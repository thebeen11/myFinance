import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CategoryKind, TransactionType } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';
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
  quantity: 2,
  unitPriceMinor: 3_500,
  lineTotalMinor: 7_000,
  position: 0,
};

const createDto = {
  categoryId: CATEGORY_ID,
  name: 'Indomie Goreng',
  quantity: 2,
  unitPriceMinor: 3_500,
};

describe('TransactionItemsService', () => {
  const tx = {
    transactionItem: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    transaction: { update: jest.fn() },
    product: { update: jest.fn() },
  };

  const prisma = {
    transaction: { findFirst: jest.fn() },
    transactionItem: { findFirst: jest.fn() },
    category: { findFirst: jest.fn() },
    product: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  const transactionsService = { findOne: jest.fn() };

  let service: TransactionItemsService;

  beforeEach(async () => {
    jest.resetAllMocks();

    // The interactive form: hand the callback the same mock the assertions read.
    prisma.$transaction.mockImplementation(
      <T>(callback: (client: typeof tx) => Promise<T>): Promise<T> => callback(tx),
    );
    tx.transactionItem.aggregate.mockResolvedValue({ _sum: { lineTotalMinor: 7_000 } });
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

  describe('the receipt total follows its lines', () => {
    it('re-derives the parent total from the sum of every line', async () => {
      armHappyPath();

      await service.create(USER_ID, TRANSACTION_ID, createDto);

      expect(tx.transaction.update).toHaveBeenCalledWith({
        where: { id: TRANSACTION_ID },
        data: { amountMinor: 7_000 },
      });
    });

    it('returns the parent to zero when the last line is removed', async () => {
      armHappyPath();
      // An aggregate over no rows sums to null, not 0.
      tx.transactionItem.aggregate.mockResolvedValue({ _sum: { lineTotalMinor: null } });

      await service.remove(USER_ID, TRANSACTION_ID, ITEM_ID);

      expect(tx.transaction.update).toHaveBeenCalledWith({
        where: { id: TRANSACTION_ID },
        data: { amountMinor: 0 },
      });
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

      await service.update(USER_ID, TRANSACTION_ID, ITEM_ID, { quantity: 3 });

      expect(tx.transactionItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // 3 × the stored 3_500, not 3 × whatever the dto happened to carry.
          data: expect.objectContaining({ lineTotalMinor: 10_500 }) as object,
        }),
      );
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
        service.update(USER_ID, TRANSACTION_ID, ITEM_ID, { quantity: 2 }),
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
});
