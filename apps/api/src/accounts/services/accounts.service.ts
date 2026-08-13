import { Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_CURRENCY, TransactionType } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AccountBalanceResponse } from '../models/account-balance.response';
import { AccountCurrencyTotalResponse } from '../models/account-currency-total.response';
import { AccountResponse } from '../models/account.response';
import { CreateAccountDto } from '../models/create-account.dto';
import { ListAccountsQueryDto } from '../models/list-accounts-query.dto';
import { PaginatedAccountsResponse } from '../models/paginated-accounts.response';
import { UpdateAccountDto } from '../models/update-account.dto';

/**
 * Every read carries what the account is attached to.
 *
 * The two numbers stay separate because the two consequences of deleting one
 * differ, and a confirm dialog has to say both: transactions are destroyed,
 * categories merely come loose.
 */
const accountInclude = {
  _count: { select: { categories: true, transactions: true } },
} satisfies Prisma.AccountInclude;

type AccountWithCounts = Prisma.AccountGetPayload<{ include: typeof accountInclude }>;

/** The three columns a balance is derived from, for accounts outside the page. */
type BalanceSource = Pick<AccountWithCounts, 'id' | 'currency' | 'openingBalanceMinor'>;

interface PostedTotals {
  incomeMinor: number;
  expenseMinor: number;
}

const NO_TOTALS: PostedTotals = { incomeMinor: 0, expenseMinor: 0 };

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of accounts, each carrying its own balance.
   *
   * Three queries regardless of how many accounts exist — the balances used to
   * cost one request per account from the browser, which is what this replaces.
   * `totalsByCurrency` is rolled up over the *whole* filtered set rather than the
   * page, so net worth stays correct on page two.
   */
  async findAll(userId: string, query: ListAccountsQueryDto): Promise<PaginatedAccountsResponse> {
    // Archived accounts are deliberately left in `baseWhere`: the toggle that
    // reveals them has to show a count while they are still hidden.
    const baseWhere: Prisma.AccountWhereInput = {
      userId,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const pageWhere: Prisma.AccountWhereInput = {
      ...baseWhere,
      ...(query.includeArchived ? {} : { archivedAt: null }),
    };

    const [scope, posted, page] = await this.prisma.$transaction([
      // The whole matching set, four columns. It is what makes `total`,
      // `archivedTotal` and the currency roll-up independent of the page — and
      // it makes a separate `count()` unnecessary.
      this.prisma.account.findMany({
        where: baseWhere,
        select: { id: true, currency: true, openingBalanceMinor: true, archivedAt: true },
      }),
      // One aggregate covering every account at once, in place of the per-account
      // groupBy that `getBalance` runs.
      this.prisma.transaction.groupBy({
        by: ['accountId', 'type'],
        where: { userId, account: baseWhere },
        // Prisma's groupBy overload only resolves `_sum` once `orderBy` is given;
        // the order itself is irrelevant, the rows are folded into a map.
        orderBy: { accountId: 'asc' },
        _sum: { amountMinor: true },
      }),
      this.prisma.account.findMany({
        where: pageWhere,
        include: accountInclude,
        orderBy: [{ archivedAt: 'asc' }, { createdAt: 'asc' }],
        take: query.limit,
        skip: query.offset,
      }),
    ]);

    const totalsByAccount = new Map<string, PostedTotals>();

    for (const row of posted) {
      const totals = totalsByAccount.get(row.accountId) ?? { incomeMinor: 0, expenseMinor: 0 };
      const amount = row._sum?.amountMinor ?? 0;

      if (row.type === TransactionType.INCOME) {
        totals.incomeMinor += amount;
      } else if (row.type === TransactionType.EXPENSE) {
        totals.expenseMinor += amount;
      }

      totalsByAccount.set(row.accountId, totals);
    }

    const counted = query.includeArchived
      ? scope
      : scope.filter((account) => account.archivedAt === null);

    return {
      data: page.map((account) =>
        this.toResponse(account, this.toBalance(account, totalsByAccount)),
      ),
      total: counted.length,
      limit: query.limit,
      offset: query.offset,
      totalsByCurrency: this.rollUpByCurrency(counted, totalsByAccount),
      archivedTotal: scope.filter((account) => account.archivedAt !== null).length,
    };
  }

  async findOne(userId: string, id: string): Promise<AccountResponse> {
    const account = await this.getOrThrow(userId, id);
    const posted = await this.postedTotals(userId, id);

    return this.toResponse(account, this.toBalance(account, posted));
  }

  async create(userId: string, dto: CreateAccountDto): Promise<AccountResponse> {
    const account = await this.prisma.account.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type,
        currency: (dto.currency ?? DEFAULT_CURRENCY).toUpperCase(),
        openingBalanceMinor: dto.openingBalanceMinor ?? 0,
      },
      include: accountInclude,
    });

    // Nothing can have posted to an account that did not exist a moment ago.
    return this.toResponse(account, this.toBalance(account, NO_TOTALS));
  }

  async update(userId: string, id: string, dto: UpdateAccountDto): Promise<AccountResponse> {
    await this.getOrThrow(userId, id);

    const account = await this.prisma.account.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        currency: dto.currency?.toUpperCase(),
        openingBalanceMinor: dto.openingBalanceMinor,
        // `archived` is a convenience flag over the archivedAt timestamp.
        archivedAt: dto.archived === undefined ? undefined : dto.archived ? new Date() : null,
      },
      include: accountInclude,
    });

    return this.toResponse(account, this.toBalance(account, await this.postedTotals(userId, id)));
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOrThrow(userId, id);
    // Transactions cascade — deleting an account you still want history for is
    // a mistake, so the UI archives instead.
    await this.prisma.account.delete({ where: { id } });
  }

  /** Opening balance plus every tracked transaction, signed by type. */
  async getBalance(userId: string, id: string): Promise<AccountBalanceResponse> {
    const account = await this.getOrThrow(userId, id);

    return this.toBalance(account, await this.postedTotals(userId, id));
  }

  /** What has been posted to one account, summed by type. */
  private async postedTotals(userId: string, accountId: string): Promise<PostedTotals> {
    const rows = await this.prisma.transaction.groupBy({
      by: ['type'],
      // `userId` is redundant once the account is known to be ours, but a sum is
      // the last place you want to discover a scoping mistake.
      where: { userId, accountId },
      _sum: { amountMinor: true },
    });

    const sumFor = (type: string): number =>
      rows.find((row) => row.type === type)?._sum.amountMinor ?? 0;

    return {
      incomeMinor: sumFor(TransactionType.INCOME),
      expenseMinor: sumFor(TransactionType.EXPENSE),
    };
  }

  /**
   * The one place the balance formula lives, shared by the list and the
   * single-account route so the two can never drift apart.
   *
   * `posted` is either the account's own totals or a lookup into the list's
   * bulk aggregate; an account nothing has posted to is simply absent from it.
   */
  private toBalance(
    account: BalanceSource,
    posted: PostedTotals | Map<string, PostedTotals>,
  ): AccountBalanceResponse {
    const { incomeMinor, expenseMinor } =
      posted instanceof Map ? (posted.get(account.id) ?? NO_TOTALS) : posted;

    return {
      accountId: account.id,
      currency: account.currency,
      openingBalanceMinor: account.openingBalanceMinor,
      incomeMinor,
      expenseMinor,
      balanceMinor: account.openingBalanceMinor + incomeMinor - expenseMinor,
    };
  }

  /** Balances folded per currency — never across, there is no FX rate anywhere. */
  private rollUpByCurrency(
    accounts: readonly BalanceSource[],
    posted: Map<string, PostedTotals>,
  ): AccountCurrencyTotalResponse[] {
    const byCurrency = new Map<string, AccountCurrencyTotalResponse>();

    for (const account of accounts) {
      const entry = byCurrency.get(account.currency) ?? {
        currency: account.currency,
        totalMinor: 0,
        accountCount: 0,
      };

      entry.totalMinor += this.toBalance(account, posted).balanceMinor;
      entry.accountCount += 1;
      byCurrency.set(account.currency, entry);
    }

    return [...byCurrency.values()].sort((a, b) => b.totalMinor - a.totalMinor);
  }

  /**
   * `findFirst`, not `findUnique`: the id alone is unique, but a lookup that
   * ignores `userId` would happily return someone else's account. Another user's
   * row reads as 404 rather than 403 — existence is not theirs to learn.
   */
  private async getOrThrow(userId: string, id: string): Promise<AccountWithCounts> {
    const account = await this.prisma.account.findFirst({
      where: { id, userId },
      include: accountInclude,
    });

    if (!account) {
      throw new NotFoundException(`Account ${id} not found`);
    }

    return account;
  }

  private toResponse(account: AccountWithCounts, balance: AccountBalanceResponse): AccountResponse {
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      openingBalanceMinor: account.openingBalanceMinor,
      balance,
      categoryCount: account._count.categories,
      transactionCount: account._count.transactions,
      archivedAt: account.archivedAt?.toISOString() ?? null,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    };
  }
}
