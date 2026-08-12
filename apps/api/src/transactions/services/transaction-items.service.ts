import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type {
  CategoryModel,
  ProductModel,
  TransactionItemModel,
  TransactionModel,
} from '../../generated/prisma/models';
import { CreateTransactionItemDto } from '../models/create-transaction-item.dto';
import { TransactionResponse } from '../models/transaction.response';
import { UpdateTransactionItemDto } from '../models/update-transaction-item.dto';
import { TransactionsService } from './transactions.service';

/**
 * The line items of a receipt, edited one row at a time.
 *
 * Every method here writes a line **and** re-derives the parent's `amountMinor`
 * inside one interactive transaction. That pairing is the whole point: the header
 * total is not stored data a client may set, it is a cached sum, and a partial
 * failure that updated one without the other would leave a receipt disagreeing
 * with itself with nothing to detect it.
 *
 * Each method returns the whole parent `TransactionResponse` rather than the line
 * it touched, so an item editor re-renders its total and its rows from one reply.
 */
@Injectable()
export class TransactionItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionsService: TransactionsService,
  ) {}

  async create(
    userId: string,
    transactionId: string,
    dto: CreateTransactionItemDto,
  ): Promise<TransactionResponse> {
    const transaction = await this.getTransactionOrThrow(userId, transactionId);
    const category = await this.getCategoryOrThrow(userId, dto.categoryId, transaction.type);
    const product = await this.getProductOrThrow(userId, dto.productId ?? undefined);

    await this.prisma.$transaction(async (tx) => {
      const last = await tx.transactionItem.findFirst({
        where: { transactionId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });

      await tx.transactionItem.create({
        data: {
          userId,
          transactionId,
          productId: product?.id ?? null,
          categoryId: category.id,
          name: dto.name,
          quantity: dto.quantity,
          unitPriceMinor: dto.unitPriceMinor,
          lineTotalMinor: dto.quantity * dto.unitPriceMinor,
          position: (last?.position ?? -1) + 1,
        },
      });

      await this.syncTotal(tx, transactionId);
      await this.syncLastPrice(tx, product, transaction.currency, dto.unitPriceMinor);
    });

    return this.transactionsService.findOne(userId, transactionId);
  }

  async update(
    userId: string,
    transactionId: string,
    itemId: string,
    dto: UpdateTransactionItemDto,
  ): Promise<TransactionResponse> {
    const transaction = await this.getTransactionOrThrow(userId, transactionId);
    const existing = await this.getItemOrThrow(userId, transactionId, itemId);

    const category = dto.categoryId
      ? await this.getCategoryOrThrow(userId, dto.categoryId, transaction.type)
      : undefined;

    // `?? undefined` so an explicit null — "unlink this from the catalogue" — is
    // not looked up as an id. The write below keeps the two apart.
    const product = await this.getProductOrThrow(userId, dto.productId ?? undefined);

    const quantity = dto.quantity ?? existing.quantity;
    const unitPriceMinor = dto.unitPriceMinor ?? existing.unitPriceMinor;

    await this.prisma.$transaction(async (tx) => {
      await tx.transactionItem.update({
        where: { id: itemId },
        data: {
          // No `??` fallback: undefined leaves the link alone, null clears it.
          productId: dto.productId,
          categoryId: category?.id,
          name: dto.name,
          quantity,
          unitPriceMinor,
          lineTotalMinor: quantity * unitPriceMinor,
        },
      });

      await this.syncTotal(tx, transactionId);
      await this.syncLastPrice(tx, product, transaction.currency, unitPriceMinor);
    });

    return this.transactionsService.findOne(userId, transactionId);
  }

  async remove(
    userId: string,
    transactionId: string,
    itemId: string,
  ): Promise<TransactionResponse> {
    await this.getTransactionOrThrow(userId, transactionId);
    await this.getItemOrThrow(userId, transactionId, itemId);

    await this.prisma.$transaction(async (tx) => {
      await tx.transactionItem.delete({ where: { id: itemId } });
      await this.syncTotal(tx, transactionId);
    });

    return this.transactionsService.findOne(userId, transactionId);
  }

  /** Re-derives the receipt total from its lines. Removing the last one returns it to zero. */
  private async syncTotal(tx: Prisma.TransactionClient, transactionId: string): Promise<void> {
    const { _sum } = await tx.transactionItem.aggregate({
      where: { transactionId },
      _sum: { lineTotalMinor: true },
    });

    await tx.transaction.update({
      where: { id: transactionId },
      data: { amountMinor: _sum.lineTotalMinor ?? 0 },
    });
  }

  /**
   * Feeds what was actually paid back into the catalogue.
   *
   * Guarded on currency: `lastPriceMinor` is stored in the product's own currency,
   * and a receipt paid from a 2-decimal account would otherwise write a figure at
   * the wrong scale — 1000 rupiah and 10.00 dollars are both "1000" as minor units
   * only if you know which scale you are reading.
   */
  private async syncLastPrice(
    tx: Prisma.TransactionClient,
    product: ProductModel | undefined,
    currency: string,
    unitPriceMinor: number,
  ): Promise<void> {
    if (!product || product.currency !== currency) return;

    await tx.product.update({
      where: { id: product.id },
      data: { lastPriceMinor: unitPriceMinor },
    });
  }

  /**
   * See the note on TransactionsService.getAccountOrThrow — findUnique cannot filter by owner.
   *
   * Also the single gate that keeps income out of this service. Every write here
   * ends in `syncTotal`, which overwrites `amountMinor` with the sum of the lines —
   * on an income transaction, whose amount was entered rather than derived, that
   * would silently reset the figure to zero. Refusing the line is what makes the
   * two rules for that column safe to hold at once.
   */
  private async getTransactionOrThrow(
    userId: string,
    transactionId: string,
  ): Promise<TransactionModel> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
    }

    if (transaction.type === TransactionType.INCOME) {
      throw new BadRequestException(
        'Income is recorded as a single amount on its account and has no line items.',
      );
    }

    return transaction;
  }

  /** Scoped by owner *and* parent, so an id from another receipt reads as missing. */
  private async getItemOrThrow(
    userId: string,
    transactionId: string,
    itemId: string,
  ): Promise<TransactionItemModel> {
    const item = await this.prisma.transactionItem.findFirst({
      where: { id: itemId, transactionId, userId },
    });

    if (!item) {
      throw new NotFoundException(`Line item ${itemId} not found`);
    }

    return item;
  }

  /**
   * Direction is the only rule: an expense line cannot be filed under an income
   * category, and vice versa.
   *
   * The category's own `accountId` is deliberately **not** checked. It records
   * where that spending usually comes from — a label the categories list groups
   * and filters by — not a restriction on where it may be spent. Enforcing it
   * here left anyone who binds every category to a wallet unable to file a
   * receipt paid from a different one, with no legal value to offer them.
   */
  private async getCategoryOrThrow(
    userId: string,
    categoryId: string,
    type: TransactionType,
  ): Promise<CategoryModel> {
    const category = await this.prisma.category.findFirst({ where: { id: categoryId, userId } });

    if (!category) {
      throw new NotFoundException(`Category ${categoryId} not found`);
    }

    if (category.kind !== type) {
      throw new BadRequestException(
        `Category "${category.name}" is ${category.kind}, cannot be used on a ${type} transaction`,
      );
    }

    return category;
  }

  /**
   * The catalogue link is optional, so an absent one is not an error — but a
   * present one has to be ours, or this is a way to point at another tenant's
   * master data and, through the price write-back, to edit it.
   */
  private async getProductOrThrow(
    userId: string,
    productId: string | undefined,
  ): Promise<ProductModel | undefined> {
    if (!productId) return undefined;

    const product = await this.prisma.product.findFirst({ where: { id: productId, userId } });

    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    return product;
  }
}
