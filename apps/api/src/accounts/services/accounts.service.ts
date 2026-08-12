import { Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_CURRENCY, TransactionType } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AccountBalanceResponse } from '../models/account-balance.response';
import { AccountResponse } from '../models/account.response';
import { CreateAccountDto } from '../models/create-account.dto';
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

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, includeArchived: boolean): Promise<AccountResponse[]> {
    const accounts = await this.prisma.account.findMany({
      where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
      include: accountInclude,
      orderBy: [{ archivedAt: 'asc' }, { createdAt: 'asc' }],
    });

    return accounts.map((account) => this.toResponse(account));
  }

  async findOne(userId: string, id: string): Promise<AccountResponse> {
    return this.toResponse(await this.getOrThrow(userId, id));
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

    return this.toResponse(account);
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

    return this.toResponse(account);
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

    const totals = await this.prisma.transaction.groupBy({
      by: ['type'],
      // `userId` is redundant once the account is known to be ours, but a sum is
      // the last place you want to discover a scoping mistake.
      where: { userId, accountId: id },
      _sum: { amountMinor: true },
    });

    const sumFor = (type: string): number =>
      totals.find((row) => row.type === type)?._sum.amountMinor ?? 0;

    const incomeMinor = sumFor(TransactionType.INCOME);
    const expenseMinor = sumFor(TransactionType.EXPENSE);

    return {
      accountId: account.id,
      currency: account.currency,
      openingBalanceMinor: account.openingBalanceMinor,
      incomeMinor,
      expenseMinor,
      balanceMinor: account.openingBalanceMinor + incomeMinor - expenseMinor,
    };
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

  private toResponse(account: AccountWithCounts): AccountResponse {
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      openingBalanceMinor: account.openingBalanceMinor,
      categoryCount: account._count.categories,
      transactionCount: account._count.transactions,
      archivedAt: account.archivedAt?.toISOString() ?? null,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    };
  }
}
