import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType, applyBasisPoints } from '@myfinance/shared';

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

import { assertNotSettlementPosting } from './assert-not-settlement-posting';
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
 * The recompute itself lives on `TransactionsService`, because additional charges
 * feed the same column from a different write path and the two must never derive
 * it differently.
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
          ...this.deriveTotals(dto.quantity, dto.unitPriceMinor, dto.discountBasisPoints ?? 0),
          position: (last?.position ?? -1) + 1,
        },
      });

      await this.transactionsService.recomputeTotal(tx, transactionId);
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

    // Merged rather than patched, because all three feed one derivation: editing
    // only the quantity still has to re-apply the rate the line already carries,
    // or the stored discount would describe the price it used to be.
    const quantity = dto.quantity ?? existing.quantity;
    const unitPriceMinor = dto.unitPriceMinor ?? existing.unitPriceMinor;
    const discountBasisPoints = dto.discountBasisPoints ?? existing.discountBasisPoints;

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
          ...this.deriveTotals(quantity, unitPriceMinor, discountBasisPoints),
        },
      });

      await this.transactionsService.recomputeTotal(tx, transactionId);
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
      await this.transactionsService.recomputeTotal(tx, transactionId);
    });

    return this.transactionsService.findOne(userId, transactionId);
  }

  /**
   * The money a line derives from the three figures a client may set.
   *
   * One helper rather than the arithmetic twice, because `create` and `update`
   * would otherwise be free to round differently and only one of them would be
   * covered the day the rule changes.
   */
  private deriveTotals(
    quantity: number,
    unitPriceMinor: number,
    discountBasisPoints: number,
  ): Pick<TransactionItemModel, 'discountBasisPoints' | 'discountMinor' | 'lineTotalMinor'> {
    const grossMinor = quantity * unitPriceMinor;
    const discountMinor = applyBasisPoints(grossMinor, discountBasisPoints);

    return { discountBasisPoints, discountMinor, lineTotalMinor: grossMinor - discountMinor };
  }

  /**
   * Feeds what was actually paid back into the catalogue.
   *
   * Deliberately the **undiscounted** unit price: the catalogue holds the shelf
   * price the next basket prefills from, and a one-off promotion is a property of
   * that receipt, not of the product.
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
   * ends in `TransactionsService.recomputeTotal`, which overwrites `amountMinor`
   * with the sum of the lines and charges — on an income transaction, whose amount
   * was entered rather than derived, that would silently reset the figure to zero.
   * Refusing the line is what makes the two rules for that column safe to hold at once.
   *
   * A settlement posting is refused for exactly the same reason: its amount was
   * written once and is authoritative, so a line attached here would send the
   * recompute over it and zero the repayment.
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

    assertNotSettlementPosting(transaction, 'itemised');

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
