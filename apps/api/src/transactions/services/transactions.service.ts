import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { AccountModel } from '../../generated/prisma/models';
import { CategoryTotalResponse } from '../models/category-total.response';
import { CreateTransactionChargeDto } from '../models/create-transaction-charge.dto';
import { CreateTransactionDto } from '../models/create-transaction.dto';
import { PaginatedTransactionsResponse } from '../models/paginated-transactions.response';
import { QuerySummaryDto } from '../models/query-summary.dto';
import { QueryTransactionsDto } from '../models/query-transactions.dto';
import { TransactionResponse } from '../models/transaction.response';
import { TransactionsSummaryResponse } from '../models/transactions-summary.response';
import { UpdateTransactionDto } from '../models/update-transaction.dto';

import { assertNotSettlementPosting } from './assert-not-settlement-posting';
import { computeSplit } from './compute-split';
import { transactionInclude } from './transaction-include';
import type { TransactionWithRelations } from './transaction-include';

/** One row of the summary's line-item grouping, before category names are joined on. */
interface CategoryLineTotal {
  categoryId: string | null;
  type: TransactionType;
  totalMinor: number;
}

const sumCharges = (charges: CreateTransactionChargeDto[] | undefined): number =>
  (charges ?? []).reduce((total, charge) => total + charge.amountMinor, 0);

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    userId: string,
    query: QueryTransactionsDto,
  ): Promise<PaginatedTransactionsResponse> {
    const where = this.buildWhere(userId, query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        include: transactionInclude,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toResponse(row)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async findOne(userId: string, id: string): Promise<TransactionResponse> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId },
      include: transactionInclude,
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    return this.toResponse(transaction);
  }

  async create(userId: string, dto: CreateTransactionDto): Promise<TransactionResponse> {
    // The account owns the currency; a transaction never sets its own.
    const account = await this.getAccountOrThrow(userId, dto.accountId);

    await this.assertMerchantOwned(userId, dto.merchantId ?? undefined);

    const { amountMinor, categoryId } = await this.resolvePosting(userId, dto.type, dto);
    const charges = this.resolveCharges(dto.type, dto.charges);

    const transaction = await this.prisma.transaction.create({
      data: {
        userId,
        accountId: dto.accountId,
        merchantId: dto.merchantId ?? null,
        type: dto.type,
        // Income posts its own figure; an expense starts at whatever it was
        // charged before anything is itemised — nothing, unless charges came in
        // with it. See `resolvePosting`.
        amountMinor: amountMinor ?? sumCharges(charges),
        ...(charges
          ? {
              charges: {
                create: charges.map((charge, position) => ({
                  userId,
                  name: charge.name,
                  percentBasisPoints: charge.percentBasisPoints ?? null,
                  amountMinor: charge.amountMinor,
                  position,
                })),
              },
            }
          : {}),
        categoryId: categoryId ?? null,
        currency: account.currency,
        occurredAt: new Date(dto.occurredAt),
        description: dto.description ?? null,
        notes: dto.notes ?? null,
      },
      include: transactionInclude,
    });

    return this.toResponse(transaction);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<TransactionResponse> {
    const existing = await this.prisma.transaction.findFirst({ where: { id, userId } });

    if (!existing) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    assertNotSettlementPosting(existing, 'edited');

    // `?? undefined` so an explicit null — "clear the merchant" — is not looked up as an id.
    await this.assertMerchantOwned(userId, dto.merchantId ?? undefined);
    await this.assertTypeChangeIsSafe(id, dto.type, existing.type);

    // A patch that leaves `type` alone still has to be judged against the type the
    // row already has — the rules for what may be written follow the result, not the payload.
    const { amountMinor, categoryId } = await this.resolvePosting(
      userId,
      dto.type ?? existing.type,
      dto,
      existing.type,
    );

    const charges = this.resolveCharges(dto.type ?? existing.type, dto.charges);

    // Moving a transaction to another account re-stamps the currency — and that
    // account has to be one of ours, or this is a way to write into someone else's.
    const currency = dto.accountId
      ? (await this.getAccountOrThrow(userId, dto.accountId)).currency
      : undefined;

    const data: Prisma.TransactionUncheckedUpdateInput = {
      accountId: dto.accountId,
      // No `??` fallback: undefined leaves the link alone, null clears it.
      merchantId: dto.merchantId,
      type: dto.type,
      amountMinor,
      categoryId,
      currency,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
      description: dto.description,
      notes: dto.notes,
    };

    if (!charges) {
      const transaction = await this.prisma.transaction.update({
        where: { id },
        data,
        include: transactionInclude,
      });

      return this.toResponse(transaction);
    }

    // Replace-all, and atomic with the recompute: a partial failure that swapped
    // the rows without re-deriving the header would leave a receipt disagreeing
    // with itself, the same hazard `recomputeTotal` exists to close.
    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({ where: { id }, data });
      await tx.transactionCharge.deleteMany({ where: { transactionId: id } });
      await tx.transactionCharge.createMany({
        data: charges.map((charge, position) => ({
          userId,
          transactionId: id,
          name: charge.name,
          percentBasisPoints: charge.percentBasisPoints ?? null,
          amountMinor: charge.amountMinor,
          position,
        })),
      });
      await this.recomputeTotal(tx, id);
    });

    return this.findOne(userId, id);
  }

  /**
   * Re-derives an expense's cached total from everything hanging off it.
   *
   * Lives here rather than beside either collection because two services write
   * rows that feed this one column — line items and charges — and a total that
   * counted only the collection last touched would be wrong with nothing to
   * detect it. Takes the caller's transaction client so the recompute lands in
   * the same atomic unit as the write that made it necessary.
   *
   * Never call this for an income transaction: its amount was entered, not
   * derived, and this would reset it to zero. Both callers gate on that first.
   */
  async recomputeTotal(tx: Prisma.TransactionClient, transactionId: string): Promise<void> {
    const [items, charges] = await Promise.all([
      tx.transactionItem.aggregate({
        where: { transactionId },
        _sum: { lineTotalMinor: true },
      }),
      tx.transactionCharge.aggregate({
        where: { transactionId },
        _sum: { amountMinor: true },
      }),
    ]);

    // An aggregate over no rows sums to null, not 0 — an emptied receipt is zero.
    const total = (items._sum.lineTotalMinor ?? 0) + (charges._sum.amountMinor ?? 0);

    await tx.transaction.update({ where: { id: transactionId }, data: { amountMinor: total } });
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.transaction.findFirst({ where: { id, userId } });

    if (!existing) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    assertNotSettlementPosting(existing, 'deleted');

    await this.prisma.transaction.delete({ where: { id } });
  }

  /**
   * Income/expense totals plus a per-category breakdown for a date window.
   *
   * The response shape is unchanged by the move to line items, which is what lets
   * the whole dashboard keep reading it — but it is now assembled from two grains.
   * The headline totals group the *headers*, because that is where `type` lives and
   * a header already carries the sum of its lines.
   *
   * The breakdown is assembled from two different grains, because the two types are
   * classified in two different places: an expense groups its *lines*, where its
   * categories live, while income groups the *headers* themselves, since it has no
   * lines and carries its category on the row. `type` is not a column on a line,
   * which is why the expense side is its own query rather than a grouping by both.
   *
   * **The two grains no longer reconcile, on purpose.** `expenseMinor` counts headers, so it includes
   * additional charges; `byCategory` groups lines, and a charge has no category to be grouped under.
   * The breakdown therefore falls short of the headline by exactly the charges in the window. That is
   * the accepted cost of keeping tax and service charge free of a classification they do not have —
   * do not "fix" it by inventing a bucket for them without first deciding what that bucket means.
   */
  async summarise(userId: string, query: QuerySummaryDto): Promise<TransactionsSummaryResponse> {
    const { from, to } = this.resolveWindow(query);

    const where: Prisma.TransactionWhereInput = {
      userId,
      occurredAt: { gte: from, lt: to },
      // Settlement postings are excluded here and nowhere else. They are real
      // movements, so `getBalance` must count them or the wallets stay wrong — but
      // both legs sit inside the same person's accounts, so counting them here would
      // add a repayment to income and the same figure to expense for money that
      // never entered or left. Balances see them; summaries do not.
      settlementId: null,
      ...(query.accountId ? { accountId: query.accountId } : {}),
    };

    const [byType, income, expense] = await Promise.all([
      this.prisma.transaction.groupBy({ by: ['type'], where, _sum: { amountMinor: true } }),
      this.groupIncomeByCategory(where),
      this.groupLinesByCategory(userId, where, TransactionType.EXPENSE),
    ]);

    const grouped = [...income, ...expense];

    const categoryIds = grouped
      .map((row) => row.categoryId)
      .filter((id): id is string => id !== null);

    const categories = await this.prisma.category.findMany({
      where: { userId, id: { in: categoryIds } },
    });
    const categoryById = new Map(categories.map((category) => [category.id, category]));

    const byCategory: CategoryTotalResponse[] = grouped
      .map((row) => {
        const category = row.categoryId ? categoryById.get(row.categoryId) : undefined;

        return {
          categoryId: row.categoryId,
          // The uncategorised bucket now holds lines backfilled from transactions
          // that never had a category, not lines a user left blank — the API
          // requires one on every line it writes.
          categoryName: category?.name ?? 'Uncategorised',
          color: category?.color ?? null,
          type: row.type,
          totalMinor: row.totalMinor,
        };
      })
      .sort((a, b) => b.totalMinor - a.totalMinor);

    const sumOf = (type: TransactionType): number =>
      byType.find((row) => row.type === type)?._sum.amountMinor ?? 0;

    const incomeMinor = sumOf(TransactionType.INCOME);
    const expenseMinor = sumOf(TransactionType.EXPENSE);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      incomeMinor,
      expenseMinor,
      netMinor: incomeMinor - expenseMinor,
      byCategory,
    };
  }

  private buildWhere(userId: string, query: QueryTransactionsDto): Prisma.TransactionWhereInput {
    const occurredAt: Prisma.DateTimeFilter = {};

    if (query.from) occurredAt.gte = new Date(query.from);
    if (query.to) occurredAt.lt = new Date(query.to);

    return {
      userId,
      ...(query.accountId ? { accountId: query.accountId } : {}),
      // Category lives in two places, so this has to look in both: on the header
      // for income, and on the lines for an expense — where it reads "has at least
      // one line in that category", so a mixed receipt matches every category it
      // touches. Matching only the lines would make income invisible to the filter.
      //
      // Wrapped in `AND` rather than written as a bare `OR`: `search` below is also
      // a top-level `OR`, and two of them in one object is not a union of both —
      // the second key simply wins, silently dropping this filter.
      ...(query.categoryId
        ? {
            AND: [
              {
                OR: [
                  { categoryId: query.categoryId },
                  { items: { some: { categoryId: query.categoryId } } },
                ],
              },
            ],
          }
        : {}),
      ...(query.merchantId ? { merchantId: query.merchantId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to ? { occurredAt } : {}),
      ...(query.search
        ? {
            OR: [
              { description: { contains: query.search, mode: 'insensitive' } },
              { notes: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  /** Defaults to the current calendar month (UTC) when the caller gives no window. */
  private resolveWindow(query: QuerySummaryDto): { from: Date; to: Date } {
    const now = new Date();

    const from = query.from
      ? new Date(query.from)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const to = query.to
      ? new Date(query.to)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    if (from >= to) {
      throw new BadRequestException('`from` must be earlier than `to`');
    }

    return { from, to };
  }

  /**
   * Resolves an account the caller actually owns. `findUniqueOrThrow` would be the
   * obvious call here and is exactly wrong: it cannot filter on a non-unique
   * column, so it would happily hand back another user's account.
   */
  private async getAccountOrThrow(userId: string, accountId: string): Promise<AccountModel> {
    const account = await this.prisma.account.findFirst({ where: { id: accountId, userId } });

    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    return account;
  }

  /** One category grouping of a window's line items, tagged with the type it came from. */
  private async groupLinesByCategory(
    userId: string,
    where: Prisma.TransactionWhereInput,
    type: TransactionType,
  ): Promise<CategoryLineTotal[]> {
    const rows = await this.prisma.transactionItem.groupBy({
      by: ['categoryId'],
      where: { userId, transaction: { ...where, type } },
      _sum: { lineTotalMinor: true },
    });

    return rows.map((row) => ({
      categoryId: row.categoryId,
      type,
      totalMinor: row._sum.lineTotalMinor ?? 0,
    }));
  }

  /**
   * The income half of the breakdown, grouped one grain up from its expense
   * counterpart: income has no lines, so its category is the header's own and its
   * total is `amountMinor` rather than a sum of `lineTotalMinor`.
   *
   * `where` is already scoped to the caller's user and window.
   */
  private async groupIncomeByCategory(
    where: Prisma.TransactionWhereInput,
  ): Promise<CategoryLineTotal[]> {
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { ...where, type: TransactionType.INCOME },
      _sum: { amountMinor: true },
    });

    return rows.map((row) => ({
      categoryId: row.categoryId,
      type: TransactionType.INCOME,
      totalMinor: row._sum.amountMinor ?? 0,
    }));
  }

  /**
   * Flipping a transaction between income and expense is only safe while its lines
   * do not contradict the destination.
   *
   * Becoming **income** requires no lines and no charges at all: income is a single
   * amount posted to the account, and `amountMinor` stops being derived the moment
   * the type changes — leaving either behind would strand rows the write paths now
   * refuse to touch, under a total that no longer answers to them.
   *
   * Becoming **expense** only requires the lines to agree in kind, because the API
   * refuses to write a line whose kind differs from its transaction's type; letting
   * the type change underneath them would leave rows that could never be saved
   * again, and a breakdown filing salary as spending.
   */
  private async assertTypeChangeIsSafe(
    transactionId: string,
    nextType: TransactionType | undefined,
    currentType: TransactionType,
  ): Promise<void> {
    if (!nextType || nextType === currentType) return;

    if (nextType === TransactionType.INCOME) {
      const [lines, charges, settlements] = await Promise.all([
        this.prisma.transactionItem.count({ where: { transactionId } }),
        this.prisma.transactionCharge.count({ where: { transactionId } }),
        this.prisma.transactionSettlement.count({ where: { transactionId } }),
      ]);

      // A settlement is derived from the lines, and income has none. Left in place it
      // would keep two postings standing against a receipt that no longer explains them.
      if (settlements > 0) {
        throw new BadRequestException(
          `Cannot change this transaction to INCOME: ${settlements} of its split shares have been reimbursed. Undo them first.`,
        );
      }

      if (lines > 0) {
        throw new BadRequestException(
          `Cannot change this transaction to INCOME: income is a single amount and carries no line items, but this one has ${lines}. Remove them first.`,
        );
      }

      if (charges > 0) {
        throw new BadRequestException(
          `Cannot change this transaction to INCOME: income carries no additional charges, but this one has ${charges}. Remove them first.`,
        );
      }

      return;
    }

    const conflicting = await this.prisma.transactionItem.count({
      where: { transactionId, category: { kind: { not: nextType } } },
    });

    if (conflicting > 0) {
      throw new BadRequestException(
        `Cannot change this transaction to ${nextType}: ${conflicting} of its line items are filed under ${currentType} categories. Re-categorise or remove them first.`,
      );
    }
  }

  /**
   * The one place that knows `amountMinor` is maintained by two different rules.
   *
   * An **expense** total is the API's to derive from its lines, so a client-supplied
   * amount or category is refused outright rather than quietly dropped — a caller
   * that sent one believes it took effect. An **income** amount is the client's to
   * state, because there are no lines to add up.
   *
   * `currentType` is the type the row already has, and is absent on create. It is
   * what makes a patch legible: an income row may be edited without restating its
   * amount, but a row *becoming* income has to supply one, and a row leaving income
   * has its figure and classification reset rather than left behind as a stale total.
   *
   * Returns `undefined` for a field that should be left as it is.
   */
  private async resolvePosting(
    userId: string,
    type: TransactionType,
    dto: CreateTransactionDto | UpdateTransactionDto,
    currentType?: TransactionType,
  ): Promise<{ amountMinor?: number; categoryId?: string | null }> {
    if (type === TransactionType.EXPENSE) {
      if (dto.amountMinor !== undefined) {
        throw new BadRequestException(
          'An expense total is the sum of its line items and cannot be set directly. Add the items instead.',
        );
      }

      if (dto.categoryId != null) {
        throw new BadRequestException(
          'An expense is categorised line by line, not on the transaction. Set the category on its items instead.',
        );
      }

      // Leaving income: the old figure was authoritative and is now meaningless,
      // and the lines that would normally derive a replacement do not exist yet.
      return currentType === TransactionType.INCOME
        ? { amountMinor: 0, categoryId: null }
        : { amountMinor: undefined, categoryId: undefined };
    }

    const isBecomingIncome = currentType !== TransactionType.INCOME;

    if (isBecomingIncome && dto.amountMinor === undefined) {
      throw new BadRequestException('Income needs an amount: it has no line items to add up.');
    }

    if (isBecomingIncome && !dto.categoryId) {
      throw new BadRequestException('Income needs a category: it has no line items to carry one.');
    }

    // Explicit null on an income row would leave it unclassified, which is exactly
    // what the header category exists to prevent. Absent is fine — it means "leave it".
    if (dto.categoryId === null) {
      throw new BadRequestException('Income cannot be left uncategorised.');
    }

    if (dto.categoryId) {
      await this.assertIncomeCategory(userId, dto.categoryId);
    }

    return { amountMinor: dto.amountMinor, categoryId: dto.categoryId };
  }

  /**
   * Charges are an expense's, for the same reason line items are: every path that
   * writes one ends in `recomputeTotal`, which would overwrite an entered income
   * figure with a sum it never agreed to.
   *
   * Returns `undefined` when the caller said nothing about charges — the signal to
   * leave the existing rows alone. An empty array is a real instruction and comes
   * back as one.
   */
  private resolveCharges(
    type: TransactionType,
    charges: CreateTransactionChargeDto[] | undefined,
  ): CreateTransactionChargeDto[] | undefined {
    if (charges === undefined) return undefined;

    if (type === TransactionType.INCOME) {
      throw new BadRequestException(
        'Income is a single amount posted to its account and carries no additional charges.',
      );
    }

    return charges;
  }

  /**
   * Resolves the header category of an income transaction: ours, and filed as income.
   *
   * Deliberately does not check the category's own `accountId` — mirroring
   * TransactionItemsService.getCategoryOrThrow, that field records where money
   * usually moves, not a restriction on where it may.
   */
  private async assertIncomeCategory(userId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.category.findFirst({ where: { id: categoryId, userId } });

    if (!category) {
      throw new NotFoundException(`Category ${categoryId} not found`);
    }

    if (category.kind !== TransactionType.INCOME) {
      throw new BadRequestException(
        `Category "${category.name}" is ${category.kind}, cannot be used on an INCOME transaction`,
      );
    }
  }

  /**
   * A merchant is optional, so an absent one is not an error — but a present one
   * has to be ours, or this is a way to point at another tenant's master data.
   */
  private async assertMerchantOwned(userId: string, merchantId?: string): Promise<void> {
    if (!merchantId) return;

    const merchant = await this.prisma.merchant.findFirst({
      where: { id: merchantId, userId },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant ${merchantId} not found`);
    }
  }

  private toResponse(transaction: TransactionWithRelations): TransactionResponse {
    return {
      id: transaction.id,
      type: transaction.type,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      occurredAt: transaction.occurredAt.toISOString(),
      description: transaction.description,
      notes: transaction.notes,
      account: transaction.account,
      merchant: transaction.merchant,
      category: transaction.category,
      split: computeSplit(transaction),
      isSettlement: transaction.settlementId !== null,
      items: transaction.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantityMilli: item.quantityMilli,
        unitPriceMinor: item.unitPriceMinor,
        discounts: item.discounts.map((discount) => ({
          id: discount.id,
          name: discount.name,
          basisPoints: discount.basisPoints,
          amountMinor: discount.amountMinor,
          position: discount.position,
        })),
        discountBasisPoints: item.discountBasisPoints,
        discountMinor: item.discountMinor,
        lineTotalMinor: item.lineTotalMinor,
        position: item.position,
        product: item.product,
        // Mapped field by field rather than passed through: the include now joins the
        // category's account so a split can be derived, and that join is not part of
        // what a line item exposes.
        category: item.category
          ? {
              id: item.category.id,
              name: item.category.name,
              kind: item.category.kind,
              color: item.category.color,
            }
          : null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      charges: transaction.charges.map((charge) => ({
        id: charge.id,
        name: charge.name,
        percentBasisPoints: charge.percentBasisPoints,
        amountMinor: charge.amountMinor,
        position: charge.position,
        createdAt: charge.createdAt.toISOString(),
        updatedAt: charge.updatedAt.toISOString(),
      })),
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
    };
  }
}
