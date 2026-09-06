import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CategoryKind, TransactionType } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { CreateTransactionItemDto } from '../models/create-transaction-item.dto';
import { TransactionItemsService } from './transaction-items.service';
import { TransactionsService } from './transactions.service';

const USER_ID = '99999999-9999-4999-8999-999999999999';
const TRANSACTION_ID = '33333333-3333-4333-8333-333333333333';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444';
const PRODUCT_ID = '66666666-6666-4666-8666-666666666666';
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

const transaction = {
  id: TRANSACTION_ID,
  userId: USER_ID,
  accountId: ACCOUNT_ID,
  type: TransactionType.EXPENSE,
  currency: 'IDR',
  amountMinor: 0,
  settlementId: null,
};

const expenseCategory = {
  id: CATEGORY_ID,
  accountId: ACCOUNT_ID,
  name: 'Groceries',
  kind: CategoryKind.EXPENSE,
  color: '#f97316',
};

const product = {
  id: PRODUCT_ID,
  userId: USER_ID,
  name: 'Indomie Goreng',
  lastPriceMinor: 3_000,
  currency: 'IDR',
};

const storedItem = {
  id: ITEM_ID,
  userId: USER_ID,
  transactionId: TRANSACTION_ID,
  productId: null,
  categoryId: CATEGORY_ID,
  name: 'Indomie Goreng',
  quantityMilli: 2_000,
  unitPriceMinor: 3_500,
  discountBasisPoints: 0,
  discountMinor: 0,
  lineTotalMinor: 7_000,
  position: 0,
  discounts: [],
};

/** The same line at 10% off: gross 7_000, discount 700, net 6_300. */
const discountedItem = {
  ...storedItem,
  discountBasisPoints: 1_000,
  discountMinor: 700,
  lineTotalMinor: 6_300,
  discounts: [{ name: null, basisPoints: 1_000, amountMinor: 700, position: 0 }],
};

/** The 55_000 line from the receipt this feature was built for: 20% then 5%. */
const stackedItem = {
  ...storedItem,
  quantityMilli: 1_000,
  unitPriceMinor: 55_000,
  discountBasisPoints: 2_400,
  discountMinor: 13_200,
  lineTotalMinor: 41_800,
  discounts: [
    { name: 'Product', basisPoints: 2_000, amountMinor: 11_000, position: 0 },
    { name: 'Member', basisPoints: 500, amountMinor: 2_200, position: 1 },
  ],
};

const createDto = {
  categoryId: CATEGORY_ID,
  name: 'Indomie Goreng',
  quantityMilli: 2_000,
  unitPriceMinor: 3_500,
};

describe('TransactionItemsService', () => {
  const tx = {
    transactionItem: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createMany: jest.fn(),
    },
    transactionItemDiscount: { createMany: jest.fn() },
    category: { findMany: jest.fn() },
    product: { update: jest.fn(), findMany: jest.fn() },
  };

  const prisma = {
    transaction: { findFirst: jest.fn() },
    transactionItem: { findFirst: jest.fn() },
    category: { findFirst: jest.fn() },
    product: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  // The recompute itself is owned and unit-tested by TransactionsService; what
  // matters here is that every write reaches it, on the same client.
  const transactionsService = { findOne: jest.fn(), recomputeTotal: jest.fn() };

  let service: TransactionItemsService;

  beforeEach(async () => {
    jest.resetAllMocks();

    // The interactive form: hand the callback the same mock the assertions read.
    prisma.$transaction.mockImplementation(
      <T>(callback: (client: typeof tx) => Promise<T>): Promise<T> => callback(tx),
    );
    tx.transactionItem.findFirst.mockResolvedValue(null);
    transactionsService.findOne.mockResolvedValue({ id: TRANSACTION_ID });

    const moduleRef = await Test.createTestingModule({
      providers: [
        TransactionItemsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
      ],
    }).compile();

    service = moduleRef.get(TransactionItemsService);
  });

  const armHappyPath = (): void => {
    prisma.transaction.findFirst.mockResolvedValue(transaction);
    prisma.category.findFirst.mockResolvedValue(expenseCategory);
    prisma.transactionItem.findFirst.mockResolvedValue(storedItem);
  };

  /**
   * A settlement posting's amount was written once and is authoritative. A line
   * attached here would send `recomputeTotal` over it and zero the repayment —
   * the same hazard the income gate above exists to close.
   */
  it('refuses to itemise a settlement posting', async () => {
    prisma.transaction.findFirst.mockResolvedValue({
      ...transaction,
      settlementId: 'settlement-1',
    });

    await expect(service.create(USER_ID, TRANSACTION_ID, createDto)).rejects.toThrow(
      /Undo the reimbursement/,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  describe('the receipt total follows its lines', () => {
    it('re-derives the parent total on the same client that wrote the line', async () => {
      armHappyPath();

      await service.create(USER_ID, TRANSACTION_ID, createDto);

      // Same `tx`, so the write and the recompute stand or fall together.
      expect(transactionsService.recomputeTotal).toHaveBeenCalledWith(tx, TRANSACTION_ID);
    });

    it('re-derives the parent total when a line is removed', async () => {
      armHappyPath();

      await service.remove(USER_ID, TRANSACTION_ID, ITEM_ID);

      expect(tx.transactionItem.delete).toHaveBeenCalledWith({ where: { id: ITEM_ID } });
      expect(transactionsService.recomputeTotal).toHaveBeenCalledWith(tx, TRANSACTION_ID);
    });

    it('re-derives the parent total when a line is edited', async () => {
      armHappyPath();

      await service.update(USER_ID, TRANSACTION_ID, ITEM_ID, { quantityMilli: 3_000 });

      expect(transactionsService.recomputeTotal).toHaveBeenCalledWith(tx, TRANSACTION_ID);
    });

    it('stores quantity × unit price as the line total', async () => {
      armHappyPath();

      await service.create(USER_ID, TRANSACTION_ID, createDto);

      expect(tx.transactionItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lineTotalMinor: 7_000 }) as object,
        }),
      );
    });

    it('recomputes the line total when only the quantity changes', async () => {
      armHappyPath();

      await service.update(USER_ID, TRANSACTION_ID, ITEM_ID, { quantityMilli: 3_000 });

      expect(tx.transactionItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // 3 × the stored 3_500, not 3 × whatever the dto happened to carry.
          data: expect.objectContaining({ lineTotalMinor: 10_500 }) as object,
        }),
      );
    });

    it('prices a weighed line at what the receipt says', async () => {
      armHappyPath();

      // The case this scale was added for: 1.5 kg of watermelon at Rp 40.000/kg,
      // which used to have to be typed as one unit at Rp 60.000 — a price that is
      // not the shelf price, and which `syncLastPrice` would then catalogue as one.
      await service.create(USER_ID, TRANSACTION_ID, {
        ...createDto,
        name: 'Semangka',
        quantityMilli: 1_500,
        unitPriceMinor: 40_000,
      });

      expect(tx.transactionItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantityMilli: 1_500,
            unitPriceMinor: 40_000,
            lineTotalMinor: 60_000,
          }) as object,
        }),
      );
    });

    it('carries a three-decimal weight into the line total', async () => {
      armHappyPath();

      // 0.825 kg at Rp 12.000/kg. The division happens last, so the gram survives.
      await service.create(USER_ID, TRANSACTION_ID, {
        ...createDto,
        quantityMilli: 825,
        unitPriceMinor: 12_000,
      });

      expect(tx.transactionItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lineTotalMinor: 9_900 }) as object,
        }),
      );
    });
  });

  describe('discounts cascade, and the money follows them', () => {
    it('derives the discount and the net line total from a single rate', async () => {
      armHappyPath();

      await service.create(USER_ID, TRANSACTION_ID, {
        ...createDto,
        discounts: [{ basisPoints: 1_000 }],
      });

      expect(tx.transactionItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            discountBasisPoints: 1_000,
            discountMinor: 700,
            lineTotalMinor: 6_300,
            discounts: {
              create: [
                {
                  userId: USER_ID,
                  name: null,
                  basisPoints: 1_000,
                  amountMinor: 700,
                  position: 0,
                },
              ],
            },
          }) as object,
        }),
      );
    });

    it('takes each rate off what the one above it left, not off the gross', async () => {
      armHappyPath();

      // The receipt this was built for: 55_000, 20% off (11_000), then 5% member
      // off the 44_000 that leaves (2_200) — not 5% of 55_000, which is 2_750.
      await service.create(USER_ID, TRANSACTION_ID, {
        ...createDto,
        quantityMilli: 1_000,
        unitPriceMinor: 55_000,
        discounts: [
          { name: 'Product', basisPoints: 2_000 },
          { name: 'Member', basisPoints: 500 },
        ],
      });

      expect(tx.transactionItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            // 13_200 of 55_000 is 24%, which is what the two rates come to together
            // and is not 25%.
            discountBasisPoints: 2_400,
            discountMinor: 13_200,
            lineTotalMinor: 41_800,
            discounts: {
              create: [
                {
                  userId: USER_ID,
                  name: 'Product',
                  basisPoints: 2_000,
                  amountMinor: 11_000,
                  position: 0,
                },
                {
                  userId: USER_ID,
                  name: 'Member',
                  basisPoints: 500,
                  amountMinor: 2_200,
                  position: 1,
                },
              ],
            },
          }) as object,
        }),
      );
    });

    it('takes a typed amount as the lump sum it is, and cascades the rate after it', async () => {
      armHappyPath();

      // 55_000 less a 5_000 voucher is 50_000; 10% of that is 5_000.
      await service.create(USER_ID, TRANSACTION_ID, {
        ...createDto,
        quantityMilli: 1_000,
        unitPriceMinor: 55_000,
        discounts: [{ name: 'Voucher', amountMinor: 5_000 }, { basisPoints: 1_000 }],
      });

      expect(tx.transactionItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            discountMinor: 10_000,
            lineTotalMinor: 45_000,
            discounts: {
              create: [
                {
                  userId: USER_ID,
                  name: 'Voucher',
                  basisPoints: null,
                  amountMinor: 5_000,
                  position: 0,
                },
                {
                  userId: USER_ID,
                  name: null,
                  basisPoints: 1_000,
                  amountMinor: 5_000,
                  position: 1,
                },
              ],
            },
          }) as object,
        }),
      );
    });

    it('reads an absent array as no discount rather than leaving the columns unset', async () => {
      armHappyPath();

      await service.create(USER_ID, TRANSACTION_ID, createDto);

      expect(tx.transactionItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            discountBasisPoints: 0,
            discountMinor: 0,
            lineTotalMinor: 7_000,
            discounts: { create: [] },
          }) as object,
        }),
      );
    });

    it('re-cascades the stored rates when only the quantity changes', async () => {
      prisma.transaction.findFirst.mockResolvedValue(transaction);
      prisma.category.findFirst.mockResolvedValue(expenseCategory);
      prisma.transactionItem.findFirst.mockResolvedValue(stackedItem);

      // The whole point of deriving rather than storing the money: a stale 11_000
      // here would describe the price this line used to be.
      await service.update(USER_ID, TRANSACTION_ID, ITEM_ID, { quantityMilli: 2_000 });

      expect(tx.transactionItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            discountBasisPoints: 2_400,
            discountMinor: 26_400,
            lineTotalMinor: 83_600,
            discounts: {
              deleteMany: {},
              create: [
                {
                  userId: USER_ID,
                  name: 'Product',
                  basisPoints: 2_000,
                  amountMinor: 22_000,
                  position: 0,
                },
                {
                  userId: USER_ID,
                  name: 'Member',
                  basisPoints: 500,
                  amountMinor: 4_400,
                  position: 1,
                },
              ],
            },
          }) as object,
        }),
      );
    });

    it('leaves a stored lump sum where it is when the quantity changes', async () => {
      prisma.transaction.findFirst.mockResolvedValue(transaction);
      prisma.category.findFirst.mockResolvedValue(expenseCategory);
      prisma.transactionItem.findFirst.mockResolvedValue({
        ...storedItem,
        discountBasisPoints: 1_428,
        discountMinor: 1_000,
        lineTotalMinor: 6_000,
        discounts: [{ name: 'Voucher', basisPoints: null, amountMinor: 1_000, position: 0 }],
      });

      // A voucher is off the line, not off a unit: doubling the quantity doubles
      // the gross and leaves the 1_000 alone.
      await service.update(USER_ID, TRANSACTION_ID, ITEM_ID, { quantityMilli: 4_000 });

      expect(tx.transactionItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            discountMinor: 1_000,
            lineTotalMinor: 13_000,
          }) as object,
        }),
      );
    });

    it('rounds a rate that does not divide evenly, once', async () => {
      armHappyPath();

      // 7% of 6_500 is 455, and IDR has no minor unit to hide the remainder in.
      await service.create(USER_ID, TRANSACTION_ID, {
        ...createDto,
        quantityMilli: 1_000,
        unitPriceMinor: 6_500,
        discounts: [{ basisPoints: 700 }],
      });

      expect(tx.transactionItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            discountMinor: 455,
            lineTotalMinor: 6_045,
          }) as object,
        }),
      );
    });

    it('clears the discounts when an empty array is sent', async () => {
      prisma.transaction.findFirst.mockResolvedValue(transaction);
      prisma.category.findFirst.mockResolvedValue(expenseCategory);
      prisma.transactionItem.findFirst.mockResolvedValue(discountedItem);

      // An empty array is a real instruction — "take them off" — and has to stay
      // distinguishable from saying nothing about them at all.
      await service.update(USER_ID, TRANSACTION_ID, ITEM_ID, { discounts: [] });

      expect(tx.transactionItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            discountBasisPoints: 0,
            discountMinor: 0,
            lineTotalMinor: 7_000,
            discounts: { deleteMany: {}, create: [] },
          }) as object,
        }),
      );
    });

    it('refuses discounts that come to more than the line is worth', async () => {
      prisma.transaction.findFirst.mockResolvedValue(transaction);
      prisma.category.findFirst.mockResolvedValue(expenseCategory);
      prisma.product.findFirst.mockResolvedValue(null);

      // Clamping would be quieter and would hide a mistyped receipt, and
      // `Transaction.amountMinor` is always positive.
      await expect(
        service.create(USER_ID, TRANSACTION_ID, {
          ...createDto,
          discounts: [{ name: 'Voucher', amountMinor: 9_000 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a discount that is neither a rate nor an amount', async () => {
      prisma.transaction.findFirst.mockResolvedValue(transaction);
      prisma.category.findFirst.mockResolvedValue(expenseCategory);
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.create(USER_ID, TRANSACTION_ID, { ...createDto, discounts: [{ name: 'Promo' }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a discount that is both a rate and an amount', async () => {
      prisma.transaction.findFirst.mockResolvedValue(transaction);
      prisma.category.findFirst.mockResolvedValue(expenseCategory);
      prisma.product.findFirst.mockResolvedValue(null);

      // Which one wins is not a question with an answer: a rate re-derives when
      // the line moves and an amount does not.
      await expect(
        service.create(USER_ID, TRANSACTION_ID, {
          ...createDto,
          discounts: [{ basisPoints: 1_000, amountMinor: 700 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('category', () => {
    it('refuses a category whose kind disagrees with the transaction type', async () => {
      prisma.transaction.findFirst.mockResolvedValue(transaction);
      prisma.category.findFirst.mockResolvedValue({ name: 'Salary', kind: CategoryKind.INCOME });

      await expect(service.create(USER_ID, TRANSACTION_ID, createDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects another user’s category as missing rather than writing the line', async () => {
      prisma.transaction.findFirst.mockResolvedValue(transaction);
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(service.create(USER_ID, TRANSACTION_ID, createDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('resolves the category by owner, not by id alone', async () => {
      armHappyPath();

      await service.create(USER_ID, TRANSACTION_ID, createDto);

      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: { id: CATEGORY_ID, userId: USER_ID },
      });
    });

    // Where a category is bound says where that spending usually comes from; it
    // is not a rule about where it may be spent. Binding every category to a
    // wallet used to leave a receipt on a different one with nothing to file
    // against at all.
    it('accepts a category bound to a different account', async () => {
      armHappyPath();
      prisma.category.findFirst.mockResolvedValue({
        ...expenseCategory,
        accountId: OTHER_ACCOUNT_ID,
      });

      await expect(service.create(USER_ID, TRANSACTION_ID, createDto)).resolves.toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('accepts an unassigned category on any account', async () => {
      armHappyPath();
      prisma.category.findFirst.mockResolvedValue({ ...expenseCategory, accountId: null });

      await expect(service.create(USER_ID, TRANSACTION_ID, createDto)).resolves.toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('the product link is optional', () => {
    it('creates without touching the product lookup when none is given', async () => {
      armHappyPath();

      await service.create(USER_ID, TRANSACTION_ID, createDto);

      expect(prisma.product.findFirst).not.toHaveBeenCalled();
      expect(tx.transactionItem.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ productId: null }) as object }),
      );
    });

    it('clears the link when the product is explicitly null', async () => {
      armHappyPath();

      await service.update(USER_ID, TRANSACTION_ID, ITEM_ID, { productId: null });

      // null, not undefined — undefined would leave the old product attached.
      expect(prisma.product.findFirst).not.toHaveBeenCalled();
      expect(tx.transactionItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ productId: null }) as object }),
      );
    });

    it('rejects another user’s product as missing rather than writing the line', async () => {
      prisma.transaction.findFirst.mockResolvedValue(transaction);
      prisma.category.findFirst.mockResolvedValue(expenseCategory);
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.create(USER_ID, TRANSACTION_ID, { ...createDto, productId: PRODUCT_ID }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('the line is a snapshot, not a view of the product', () => {
    it('writes the name, price and category it was given, not the product’s own', async () => {
      armHappyPath();
      prisma.product.findFirst.mockResolvedValue(product);

      await service.create(USER_ID, TRANSACTION_ID, {
        ...createDto,
        productId: PRODUCT_ID,
        name: 'Indomie Soto',
        unitPriceMinor: 4_000,
      });

      expect(tx.transactionItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Indomie Soto',
            unitPriceMinor: 4_000,
            categoryId: CATEGORY_ID,
          }) as object,
        }),
      );
    });
  });

  describe('last known price', () => {
    it('feeds a linked line’s unit price back into the catalogue', async () => {
      armHappyPath();
      prisma.product.findFirst.mockResolvedValue(product);

      await service.create(USER_ID, TRANSACTION_ID, { ...createDto, productId: PRODUCT_ID });

      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID },
        data: { lastPriceMinor: 3_500 },
      });
    });

    it('leaves it alone when the receipt is in another currency', async () => {
      armHappyPath();
      // 3_500 minor units means something different either side of this line.
      prisma.product.findFirst.mockResolvedValue({ ...product, currency: 'USD' });

      await service.create(USER_ID, TRANSACTION_ID, { ...createDto, productId: PRODUCT_ID });

      expect(tx.product.update).not.toHaveBeenCalled();
    });

    it('leaves it alone for a line with no product', async () => {
      armHappyPath();

      await service.create(USER_ID, TRANSACTION_ID, createDto);

      expect(tx.product.update).not.toHaveBeenCalled();
    });

    it('writes back the undiscounted price, not what the promotion came to', async () => {
      armHappyPath();
      prisma.product.findFirst.mockResolvedValue(product);

      await service.create(USER_ID, TRANSACTION_ID, {
        ...createDto,
        productId: PRODUCT_ID,
        discounts: [{ basisPoints: 1_000 }],
      });

      // The catalogue holds the shelf price the next basket prefills from; a
      // one-off promotion belongs to that receipt, not to the product.
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID },
        data: { lastPriceMinor: 3_500 },
      });
    });
  });

  describe('tenant and parent scoping', () => {
    it('reports another user’s transaction as missing', async () => {
      prisma.transaction.findFirst.mockResolvedValue(null);

      await expect(service.create(USER_ID, TRANSACTION_ID, createDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('scopes a line by its parent as well as its owner', async () => {
      prisma.transaction.findFirst.mockResolvedValue(transaction);
      prisma.transactionItem.findFirst.mockResolvedValue(storedItem);

      await service.remove(USER_ID, TRANSACTION_ID, ITEM_ID);

      expect(prisma.transactionItem.findFirst).toHaveBeenCalledWith({
        where: { id: ITEM_ID, transactionId: TRANSACTION_ID, userId: USER_ID },
        // The rows come with it because an update that says nothing about them
        // re-cascades what the line already carries.
        include: { discounts: { orderBy: { position: 'asc' } } },
      });
    });

    it('refuses to delete a line that belongs to another receipt', async () => {
      prisma.transaction.findFirst.mockResolvedValue(transaction);
      prisma.transactionItem.findFirst.mockResolvedValue(null);

      await expect(service.remove(USER_ID, TRANSACTION_ID, ITEM_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // Income's amount is entered, not derived. Every write here ends in syncTotal,
  // which would overwrite it with the sum of the lines — zero — so the line is
  // refused at the door rather than the total defended afterwards.
  describe('income has no line items', () => {
    const income = { ...transaction, type: TransactionType.INCOME, amountMinor: 8_000_000 };

    it('refuses to add one', async () => {
      prisma.transaction.findFirst.mockResolvedValue(income);

      await expect(service.create(USER_ID, TRANSACTION_ID, createDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses to edit one', async () => {
      prisma.transaction.findFirst.mockResolvedValue(income);

      await expect(
        service.update(USER_ID, TRANSACTION_ID, ITEM_ID, { quantityMilli: 2_000 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses to remove one', async () => {
      prisma.transaction.findFirst.mockResolvedValue(income);

      await expect(service.remove(USER_ID, TRANSACTION_ID, ITEM_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  it('appends a new line after the last one', async () => {
    armHappyPath();
    tx.transactionItem.findFirst.mockResolvedValue({ position: 4 });

    await service.create(USER_ID, TRANSACTION_ID, createDto);

    expect(tx.transactionItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ position: 5 }) as object }),
    );
  });
  /**
   * The bulk path used when a whole scanned receipt is posted at once. It shares
   * `deriveTotals` and `syncLastPrice` with the single-line `create` above — the
   * two helpers that carry the money rules — and differs only in reading its
   * categories and products in one query each instead of one per line.
   */
  describe('createManyInTransaction', () => {
    // The mock stands in for a client the caller owns; only the handful of
    // operations this path uses is worth building, so it is narrowed here rather
    // than filled out with a dozen methods no assertion reads.
    const txClient = tx as unknown as Prisma.TransactionClient;

    const line = (overrides: Partial<CreateTransactionItemDto> = {}): CreateTransactionItemDto => ({
      ...createDto,
      ...overrides,
    });

    const armBulk = (categories: unknown[] = [expenseCategory], products: unknown[] = []): void => {
      tx.category.findMany.mockResolvedValue(categories);
      tx.product.findMany.mockResolvedValue(products);
    };

    it('writes every line in one statement, numbered in receipt order', async () => {
      armBulk();

      await service.createManyInTransaction(txClient, USER_ID, transaction, [
        line({ name: 'Indomie' }),
        line({ name: 'Teh Botol' }),
      ]);

      expect(tx.transactionItem.createMany).toHaveBeenCalledTimes(1);
      expect(tx.transactionItem.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ name: 'Indomie', position: 0 }),
          expect.objectContaining({ name: 'Teh Botol', position: 1 }),
        ],
      });
    });

    it('cascades the discounts exactly as a single line does', async () => {
      armBulk();

      await service.createManyInTransaction(txClient, USER_ID, transaction, [
        line({
          quantityMilli: 1_000,
          unitPriceMinor: 55_000,
          discounts: [{ name: 'Product', basisPoints: 2_000 }, { basisPoints: 500 }],
        }),
      ]);

      expect(tx.transactionItem.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            discountBasisPoints: 2_400,
            discountMinor: 13_200,
            lineTotalMinor: 41_800,
          }),
        ],
      });
    });

    it('writes the discounts of every line in one further statement', async () => {
      armBulk();

      await service.createManyInTransaction(txClient, USER_ID, transaction, [
        line({ name: 'Indomie', discounts: [{ basisPoints: 1_000 }] }),
        line({ name: 'Teh Botol' }),
        line({ name: 'Aqua', discounts: [{ name: 'Voucher', amountMinor: 500 }] }),
      ]);

      // Two statements for a whole receipt, not one lookup per line: `createMany`
      // cannot nest a relation, so the ids are generated up front.
      expect(tx.transactionItemDiscount.createMany).toHaveBeenCalledTimes(1);
      expect(tx.transactionItemDiscount.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ basisPoints: 1_000, amountMinor: 700, position: 0 }),
          expect.objectContaining({ name: 'Voucher', basisPoints: null, amountMinor: 500 }),
        ],
      });

      const [{ data: items }] = tx.transactionItem.createMany.mock.calls[0] as [
        { data: { id: string }[] },
      ];
      const [{ data: discounts }] = tx.transactionItemDiscount.createMany.mock.calls[0] as [
        { data: { transactionItemId: string }[] },
      ];

      // Each discount is attached to the line it was read off, by the id that line
      // was written with.
      expect(discounts.map((discount) => discount.transactionItemId)).toEqual([
        items[0].id,
        items[2].id,
      ]);
    });

    it('reads its categories once for the whole receipt, not once per line', async () => {
      armBulk();

      await service.createManyInTransaction(
        txClient,
        USER_ID,
        transaction,
        Array.from({ length: 12 }, (_, index) => line({ name: `Item ${index}` })),
      );

      expect(tx.category.findMany).toHaveBeenCalledTimes(1);
      expect(tx.category.findMany).toHaveBeenCalledWith({
        where: { id: { in: [CATEGORY_ID] }, userId: USER_ID },
      });
    });

    it('touches nothing at all for a receipt with no lines', async () => {
      await service.createManyInTransaction(txClient, USER_ID, transaction, []);

      expect(tx.category.findMany).not.toHaveBeenCalled();
      expect(tx.transactionItem.createMany).not.toHaveBeenCalled();
    });

    it('rejects another user’s category as missing rather than writing the lines', async () => {
      armBulk([]);

      await expect(
        service.createManyInTransaction(txClient, USER_ID, transaction, [line()]),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.transactionItem.createMany).not.toHaveBeenCalled();
    });

    it('refuses a category whose kind disagrees with the transaction type', async () => {
      armBulk([{ ...expenseCategory, name: 'Salary', kind: CategoryKind.INCOME }]);

      await expect(
        service.createManyInTransaction(txClient, USER_ID, transaction, [line()]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.transactionItem.createMany).not.toHaveBeenCalled();
    });

    it('rejects another user’s product as missing rather than writing the lines', async () => {
      armBulk([expenseCategory], []);

      await expect(
        service.createManyInTransaction(txClient, USER_ID, transaction, [
          line({ productId: PRODUCT_ID }),
        ]),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.transactionItem.createMany).not.toHaveBeenCalled();
    });

    it('skips the product lookup when no line came from the catalogue', async () => {
      armBulk();

      await service.createManyInTransaction(txClient, USER_ID, transaction, [line()]);

      expect(tx.product.findMany).not.toHaveBeenCalled();
    });

    it('feeds each linked line’s price back into the catalogue', async () => {
      armBulk([expenseCategory], [product]);

      await service.createManyInTransaction(txClient, USER_ID, transaction, [
        line({ productId: PRODUCT_ID, unitPriceMinor: 4_000 }),
      ]);

      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID },
        data: { lastPriceMinor: 4_000 },
      });
    });

    it('writes one last price per product, the last line’s, not one per line', async () => {
      armBulk([expenseCategory], [product]);

      await service.createManyInTransaction(txClient, USER_ID, transaction, [
        line({ productId: PRODUCT_ID, unitPriceMinor: 3_000 }),
        line({ productId: PRODUCT_ID, unitPriceMinor: 4_000 }),
      ]);

      expect(tx.product.update).toHaveBeenCalledTimes(1);
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID },
        data: { lastPriceMinor: 4_000 },
      });
    });

    it('leaves the catalogue price alone when the receipt is in another currency', async () => {
      armBulk([expenseCategory], [{ ...product, currency: 'USD' }]);

      await service.createManyInTransaction(txClient, USER_ID, transaction, [
        line({ productId: PRODUCT_ID }),
      ]);

      expect(tx.product.update).not.toHaveBeenCalled();
    });
  });
});
