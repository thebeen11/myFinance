import { randomUUID } from 'node:crypto';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType, cascadeDiscounts, lineGrossMinor } from '@myfinance/shared';
import type { LineDiscountInput } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type {
  CategoryModel,
  ProductModel,
  TransactionItemDiscountModel,
  TransactionItemModel,
  TransactionModel,
} from '../../generated/prisma/models';
import { CreateTransactionItemDto } from '../models/create-transaction-item.dto';
import { TransactionItemDiscountDto } from '../models/transaction-item-discount.dto';
import { TransactionResponse } from '../models/transaction.response';
import { UpdateTransactionItemDto } from '../models/update-transaction-item.dto';

import { assertNotSettlementPosting } from './assert-not-settlement-posting';
import { TransactionsService } from './transactions.service';

/** A discount with its either/or resolved: exactly one of the two is set. */
interface NormalisedDiscount extends LineDiscountInput {
  name: string | null;
}

/** What a line's money works out to, plus the rows that explain it. */
interface DerivedLine extends Pick<
  TransactionItemModel,
  'discountBasisPoints' | 'discountMinor' | 'lineTotalMinor'
> {
  discountRows: Omit<
    TransactionItemDiscountModel,
    'id' | 'userId' | 'transactionItemId' | 'createdAt' | 'updatedAt'
  >[];
}

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
 * A line's discounts are rows of their own and they **cascade**: each comes off
 * what the ones above it left, so their order is arithmetic rather than
 * presentation. A rate row stores the rate and re-derives its money whenever the
 * line moves; a typed amount is a lump sum that does not. Both are priced by
 * `cascadeDiscounts` in `@myfinance/shared`, which is also what the browser
 * previews with, so what is shown before saving is what gets stored.
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

    const { discountRows, ...totals } = this.deriveTotals(
      dto.name,
      dto.quantityMilli,
      dto.unitPriceMinor,
      this.normaliseDiscounts(dto.name, dto.discounts ?? []),
    );

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
          quantityMilli: dto.quantityMilli,
          unitPriceMinor: dto.unitPriceMinor,
          ...totals,
          position: (last?.position ?? -1) + 1,
          // Nested, so the line and what explains it are one statement.
          discounts: { create: discountRows.map((row) => ({ userId, ...row })) },
        },
      });

      await this.transactionsService.recomputeTotal(tx, transactionId);
      await this.syncLastPrice(tx, product, transaction.currency, dto.unitPriceMinor);
    });

    return this.transactionsService.findOne(userId, transactionId);
  }

  /**
   * Writes a whole receipt's lines inside a caller's transaction.
   *
   * Exists for `ReceiptsService`, which posts a scanned receipt as one atomic
   * write. It does **not** recompute the parent total or return a response — the
   * caller owns the transaction, and it is creating the header in the same one.
   *
   * Kept beside the single-line `create` rather than replacing its body: this
   * path resolves every category and product in two batched queries because a
   * receipt is fifteen lines and a lookup each would be the N+1 the repo bans,
   * while `create` answers for exactly one line and its behaviour is pinned by
   * its own specs. The two share what must never diverge — `deriveTotals` and
   * `syncLastPrice`, which carry the money rules — and differ only in how many
   * rows they read at a time.
   *
   * @throws NotFoundException when a category or product is not the user's.
   * @throws BadRequestException when a category's kind disagrees with the type.
   */
  async createManyInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    transaction: Pick<TransactionModel, 'id' | 'type' | 'currency'>,
    dtos: CreateTransactionItemDto[],
  ): Promise<void> {
    if (dtos.length === 0) return;

    const categories = await this.getCategoriesOrThrow(
      tx,
      userId,
      dtos.map((dto) => dto.categoryId),
      transaction.type,
    );

    const products = await this.getProductsOrThrow(
      tx,
      userId,
      dtos.map((dto) => dto.productId).filter((id): id is string => Boolean(id)),
    );

    // Ids up front because `createMany` cannot nest a relation and does not hand
    // back what it wrote: with the ids known, the discounts are a second
    // `createMany` rather than a lookup per line.
    const derived = dtos.map((dto) => ({
      id: randomUUID(),
      ...this.deriveTotals(
        dto.name,
        dto.quantityMilli,
        dto.unitPriceMinor,
        this.normaliseDiscounts(dto.name, dto.discounts ?? []),
      ),
    }));

    await tx.transactionItem.createMany({
      data: dtos.map((dto, position) => {
        const { id, discountBasisPoints, discountMinor, lineTotalMinor } = derived[position];

        return {
          id,
          userId,
          transactionId: transaction.id,
          productId: dto.productId ?? null,
          categoryId: categories.get(dto.categoryId)?.id ?? null,
          name: dto.name,
          quantityMilli: dto.quantityMilli,
          unitPriceMinor: dto.unitPriceMinor,
          discountBasisPoints,
          discountMinor,
          lineTotalMinor,
          position,
        };
      }),
    });

    await tx.transactionItemDiscount.createMany({
      data: derived.flatMap((line) =>
        line.discountRows.map((row) => ({ userId, transactionItemId: line.id, ...row })),
      ),
    });

    // Last line wins, which is what posting these one at a time would have left
    // behind. Sequential rather than in parallel: every statement in an
    // interactive transaction shares one connection.
    const lastPriceByProduct = new Map<string, number>();

    for (const dto of dtos) {
      if (dto.productId) lastPriceByProduct.set(dto.productId, dto.unitPriceMinor);
    }

    for (const [productId, unitPriceMinor] of lastPriceByProduct) {
      await this.syncLastPrice(tx, products.get(productId), transaction.currency, unitPriceMinor);
    }
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

    // Merged rather than patched, because all of these feed one derivation: editing
    // only the quantity still has to re-cascade the rates the line already carries,
    // or the stored discounts would describe the price it used to be. An absent
    // array leaves them alone; an empty one clears them.
    const name = dto.name ?? existing.name;
    const quantityMilli = dto.quantityMilli ?? existing.quantityMilli;
    const unitPriceMinor = dto.unitPriceMinor ?? existing.unitPriceMinor;
    const discounts = dto.discounts
      ? this.normaliseDiscounts(name, dto.discounts)
      : this.toDiscountInputs(existing.discounts);

    const { discountRows, ...totals } = this.deriveTotals(
      name,
      quantityMilli,
      unitPriceMinor,
      discounts,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.transactionItem.update({
        where: { id: itemId },
        data: {
          // No `??` fallback: undefined leaves the link alone, null clears it.
          productId: dto.productId,
          categoryId: category?.id,
          name: dto.name,
          quantityMilli,
          unitPriceMinor,
          ...totals,
          // Replaced wholesale rather than diffed: the rows are a list whose order
          // is the arithmetic, so there is no stable identity to patch against.
          discounts: {
            deleteMany: {},
            create: discountRows.map((row) => ({ userId, ...row })),
          },
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
   * The money a line derives from the figures a client may set.
   *
   * One helper rather than the arithmetic three times, because `create`, `update`
   * and the bulk path would otherwise be free to round differently and only one of
   * them would be covered the day the rule changes. The cascade itself lives in
   * `@myfinance/shared`, so the browser can preview the figure that will be stored
   * rather than one that usually agrees with it.
   *
   * @throws BadRequestException when the discounts take off more than the line is
   *   worth. A clamp would be quieter and would hide a mistyped receipt, and
   *   `Transaction.amountMinor` is always positive.
   */
  private deriveTotals(
    name: string,
    quantityMilli: number,
    unitPriceMinor: number,
    discounts: NormalisedDiscount[],
  ): DerivedLine {
    const cascaded = cascadeDiscounts(lineGrossMinor(quantityMilli, unitPriceMinor), discounts);

    if (cascaded.lineTotalMinor < 0) {
      throw new BadRequestException(
        `Discounts on "${name}" come to more than the line is worth. ` +
          'Reduce them so the line total is not negative.',
      );
    }

    return {
      discountBasisPoints: cascaded.effectiveBasisPoints,
      discountMinor: cascaded.discountMinor,
      lineTotalMinor: cascaded.lineTotalMinor,
      discountRows: cascaded.discounts.map((discount, position) => ({
        name: discounts[position].name,
        basisPoints: discount.basisPoints,
        amountMinor: discount.amountMinor,
        position,
      })),
    };
  }

  /**
   * Turns what a client sent into rows the cascade can price.
   *
   * The either/or is enforced here rather than by a decorator because only this
   * layer knows which line it is on, and "which one" is the whole question the
   * message has to answer.
   *
   * @throws BadRequestException when a row sets neither figure or both.
   */
  private normaliseDiscounts(
    name: string,
    discounts: TransactionItemDiscountDto[],
  ): NormalisedDiscount[] {
    return discounts.map((discount) => {
      const hasRate = discount.basisPoints !== undefined && discount.basisPoints !== null;
      const hasAmount = discount.amountMinor !== undefined && discount.amountMinor !== null;

      if (hasRate === hasAmount) {
        throw new BadRequestException(
          `A discount on "${name}" must be either a rate or an amount, not ${
            hasRate ? 'both' : 'neither'
          }.`,
        );
      }

      return {
        name: discount.name ?? null,
        basisPoints: hasRate ? (discount.basisPoints as number) : null,
        amountMinor: hasRate ? null : (discount.amountMinor as number),
      };
    });
  }

  /**
   * The stored rows read back as inputs, so an edit that says nothing about the
   * discounts re-cascades exactly what the line already carries.
   *
   * A stored rate row carries both columns — the rate and what it came to — and
   * only the rate is the input; handing the amount back too would pin a rate row
   * to the money it was worth at the old quantity.
   */
  private toDiscountInputs(discounts: TransactionItemDiscountModel[]): NormalisedDiscount[] {
    return discounts.map((discount) => ({
      name: discount.name,
      basisPoints: discount.basisPoints,
      amountMinor: discount.basisPoints === null ? discount.amountMinor : null,
    }));
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

  /**
   * Scoped by owner *and* parent, so an id from another receipt reads as missing.
   *
   * The discounts come with it because `update` re-derives from them whenever the
   * caller said nothing about them, and they only mean anything in order.
   */
  private async getItemOrThrow(
    userId: string,
    transactionId: string,
    itemId: string,
  ): Promise<TransactionItemModel & { discounts: TransactionItemDiscountModel[] }> {
    const item = await this.prisma.transactionItem.findFirst({
      where: { id: itemId, transactionId, userId },
      include: { discounts: { orderBy: { position: 'asc' } } },
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

  /**
   * The batched form of `getCategoryOrThrow`, keyed by id for the write below.
   *
   * One query for the whole receipt, and the same two rules: a category that is
   * not the user's reads as missing, and one whose kind disagrees with the
   * transaction is refused by name so the message says which line to fix.
   */
  private async getCategoriesOrThrow(
    tx: Prisma.TransactionClient,
    userId: string,
    categoryIds: string[],
    type: TransactionType,
  ): Promise<Map<string, CategoryModel>> {
    const wanted = [...new Set(categoryIds)];
    const rows = await tx.category.findMany({ where: { id: { in: wanted }, userId } });
    const found = new Map(rows.map((row) => [row.id, row]));

    for (const categoryId of wanted) {
      const category = found.get(categoryId);

      if (!category) {
        throw new NotFoundException(`Category ${categoryId} not found`);
      }

      if (category.kind !== type) {
        throw new BadRequestException(
          `Category "${category.name}" is ${category.kind}, cannot be used on a ${type} transaction`,
        );
      }
    }

    return found;
  }

  /** The batched form of `getProductOrThrow`. Same rule: a link must be ours. */
  private async getProductsOrThrow(
    tx: Prisma.TransactionClient,
    userId: string,
    productIds: string[],
  ): Promise<Map<string, ProductModel>> {
    const wanted = [...new Set(productIds)];

    if (wanted.length === 0) return new Map();

    const rows = await tx.product.findMany({ where: { id: { in: wanted }, userId } });
    const found = new Map(rows.map((row) => [row.id, row]));

    for (const productId of wanted) {
      if (!found.has(productId)) {
        throw new NotFoundException(`Product ${productId} not found`);
      }
    }

    return found;
  }
}
