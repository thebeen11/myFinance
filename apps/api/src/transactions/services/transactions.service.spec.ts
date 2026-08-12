import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TransactionType } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';
import { TransactionsService } from './transactions.service';

const USER_ID = '99999999-9999-4999-8999-999999999999';
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const MERCHANT_ID = '22222222-2222-4222-8222-222222222222';
const TRANSACTION_ID = '33333333-3333-4333-8333-333333333333';
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444';

const account = {
  id: ACCOUNT_ID,
  userId: USER_ID,
  name: 'Cash',
  type: 'CASH',
  currency: 'IDR',
  openingBalanceMinor: 0,
  archivedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const storedTransaction = {
  id: TRANSACTION_ID,
  userId: USER_ID,
  accountId: ACCOUNT_ID,
  merchantId: MERCHANT_ID,
  type: 'EXPENSE',
  amountMinor: 25_000,
  currency: 'IDR',
  categoryId: null,
  occurredAt: new Date('2026-08-01T00:00:00.000Z'),
  description: null,
  notes: null,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  account: { id: ACCOUNT_ID, name: 'Cash', type: 'CASH' },
  merchant: { id: MERCHANT_ID, name: 'Indomaret' },
  category: null,
  items: [],
};

/** Income posts its own figure and carries no lines. */
const storedIncome = {
  ...storedTransaction,
  type: 'INCOME',
  merchantId: null,
  merchant: null,
  amountMinor: 8_000_000,
  categoryId: CATEGORY_ID,
  category: { id: CATEGORY_ID, name: 'Salary', kind: 'INCOME', color: null },
};

const incomeCategory = {
  id: CATEGORY_ID,
  userId: USER_ID,
  accountId: null,
  name: 'Salary',
  kind: 'INCOME',
  color: null,
};

const expenseCategory = { ...incomeCategory, name: 'Groceries', kind: 'EXPENSE' };

const createDto = {
  accountId: ACCOUNT_ID,
  type: TransactionType.EXPENSE,
  occurredAt: '2026-08-01T00:00:00.000Z',
};

const createIncomeDto = {
  accountId: ACCOUNT_ID,
  type: TransactionType.INCOME,
  occurredAt: '2026-08-01T00:00:00.000Z',
  amountMinor: 8_000_000,
  categoryId: CATEGORY_ID,
};

describe('TransactionsService', () => {
  const prisma = {
    account: { findFirst: jest.fn() },
    category: { findFirst: jest.fn() },
    merchant: { findFirst: jest.fn() },
    transaction: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    transactionItem: { count: jest.fn() },
    // findAll batches its rows-and-count pair through the array form.
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };

  let service: TransactionsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    // resetAllMocks clears implementations too, so the batching one is re-armed here.
    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [TransactionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(TransactionsService);
  });

  describe('the merchant link is optional', () => {
    it('creates without touching the merchant lookup when none is given', async () => {
      prisma.account.findFirst.mockResolvedValue(account);
      prisma.transaction.create.mockResolvedValue({ ...storedTransaction, merchant: null });

      await service.create(USER_ID, createDto);

      expect(prisma.merchant.findFirst).not.toHaveBeenCalled();
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ merchantId: null }) as object }),
      );
    });

    it('clears the link when the merchant is explicitly null', async () => {
      prisma.transaction.findFirst.mockResolvedValue(storedTransaction);
      prisma.transaction.update.mockResolvedValue({ ...storedTransaction, merchant: null });

      await service.update(USER_ID, TRANSACTION_ID, { merchantId: null });

      // null, not undefined — undefined would leave the old merchant attached.
      expect(prisma.merchant.findFirst).not.toHaveBeenCalled();
      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ merchantId: null }) as object }),
      );
    });

    it('leaves the link alone when the merchant is absent from an update', async () => {
      prisma.transaction.findFirst.mockResolvedValue(storedTransaction);
      prisma.transaction.update.mockResolvedValue(storedTransaction);

      await service.update(USER_ID, TRANSACTION_ID, { description: 'Renamed' });

      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ merchantId: undefined }) as object,
        }),
      );
    });
  });

  describe('merchant ownership', () => {
    it('resolves a merchant by owner, not by id alone', async () => {
      prisma.account.findFirst.mockResolvedValue(account);
      prisma.merchant.findFirst.mockResolvedValue({ id: MERCHANT_ID, userId: USER_ID });
      prisma.transaction.create.mockResolvedValue(storedTransaction);

      await service.create(USER_ID, { ...createDto, merchantId: MERCHANT_ID });

      expect(prisma.merchant.findFirst).toHaveBeenCalledWith({
        where: { id: MERCHANT_ID, userId: USER_ID },
      });
    });

    it('rejects another user’s merchant as missing rather than writing the row', async () => {
      prisma.account.findFirst.mockResolvedValue(account);
      prisma.merchant.findFirst.mockResolvedValue(null);

      await expect(
        service.create(USER_ID, { ...createDto, merchantId: MERCHANT_ID }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
  });

  it('returns the merchant on the response so a row renders in one request', async () => {
    prisma.transaction.findFirst.mockResolvedValue(storedTransaction);

    await expect(service.findOne(USER_ID, TRANSACTION_ID)).resolves.toMatchObject({
      merchant: { id: MERCHANT_ID, name: 'Indomaret' },
    });
  });

  describe('an expense total is derived, not entered', () => {
    it('creates a receipt at zero — it has no lines yet', async () => {
      prisma.account.findFirst.mockResolvedValue(account);
      prisma.transaction.create.mockResolvedValue(storedTransaction);

      await service.create(USER_ID, createDto);

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amountMinor: 0 }) as object }),
      );
    });

    it('leaves the total alone on an update that does not mention it', async () => {
      prisma.transaction.findFirst.mockResolvedValue(storedTransaction);
      prisma.transaction.update.mockResolvedValue(storedTransaction);

      await service.update(USER_ID, TRANSACTION_ID, { description: 'Renamed' });

      // undefined, which Prisma reads as "do not write this column" — the lines
      // are what move an expense total, and this patch touched none of them.
      const [[call]] = prisma.transaction.update.mock.calls as [
        [{ data: { amountMinor?: number } }],
      ];
      expect(call.data.amountMinor).toBeUndefined();
    });

    it('refuses a client-supplied amount rather than silently dropping it', async () => {
      prisma.account.findFirst.mockResolvedValue(account);

      await expect(
        service.create(USER_ID, { ...createDto, amountMinor: 25_000 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('refuses a header category — an expense is categorised line by line', async () => {
      prisma.account.findFirst.mockResolvedValue(account);

      await expect(
        service.create(USER_ID, { ...createDto, categoryId: CATEGORY_ID }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
  });

  describe('an income amount is entered, not derived', () => {
    it('writes the figure it was given, with its category', async () => {
      prisma.account.findFirst.mockResolvedValue(account);
      prisma.category.findFirst.mockResolvedValue(incomeCategory);
      prisma.transaction.create.mockResolvedValue(storedIncome);

      await service.create(USER_ID, createIncomeDto);

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amountMinor: 8_000_000,
            categoryId: CATEGORY_ID,
          }) as object,
        }),
      );
    });

    it('refuses income with no amount — there are no lines to add up', async () => {
      prisma.account.findFirst.mockResolvedValue(account);

      await expect(
        service.create(USER_ID, { ...createIncomeDto, amountMinor: undefined }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('refuses income with no category — there are no lines to carry one', async () => {
      prisma.account.findFirst.mockResolvedValue(account);

      await expect(
        service.create(USER_ID, { ...createIncomeDto, categoryId: undefined }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('refuses an EXPENSE category on income', async () => {
      prisma.account.findFirst.mockResolvedValue(account);
      prisma.category.findFirst.mockResolvedValue(expenseCategory);

      await expect(service.create(USER_ID, createIncomeDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('resolves the category by owner, not by id alone', async () => {
      prisma.account.findFirst.mockResolvedValue(account);
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(service.create(USER_ID, createIncomeDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: { id: CATEGORY_ID, userId: USER_ID },
      });
    });

    it('lets an income row be edited without restating its amount', async () => {
      prisma.transaction.findFirst.mockResolvedValue(storedIncome);
      prisma.transaction.update.mockResolvedValue(storedIncome);

      await service.update(USER_ID, TRANSACTION_ID, { description: 'August salary' });

      const [[call]] = prisma.transaction.update.mock.calls as [
        [{ data: { amountMinor?: number } }],
      ];
      expect(call.data.amountMinor).toBeUndefined();
    });

    it('writes a new amount when one is given', async () => {
      prisma.transaction.findFirst.mockResolvedValue(storedIncome);
      prisma.transaction.update.mockResolvedValue(storedIncome);

      await service.update(USER_ID, TRANSACTION_ID, { amountMinor: 9_000_000 });

      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amountMinor: 9_000_000 }) as object,
        }),
      );
    });

    it('refuses to leave income uncategorised', async () => {
      prisma.transaction.findFirst.mockResolvedValue(storedIncome);

      await expect(
        service.update(USER_ID, TRANSACTION_ID, { categoryId: null }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });
  });

  describe('changing the type of a transaction', () => {
    it('refuses to make a receipt with lines into income — income carries none', async () => {
      prisma.transaction.findFirst.mockResolvedValue(storedTransaction);
      prisma.transactionItem.count.mockResolvedValue(2);

      await expect(
        service.update(USER_ID, TRANSACTION_ID, {
          type: TransactionType.INCOME,
          amountMinor: 8_000_000,
          categoryId: CATEGORY_ID,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('allows it once the receipt is empty, given an amount and a category', async () => {
      prisma.transaction.findFirst.mockResolvedValue(storedTransaction);
      prisma.transactionItem.count.mockResolvedValue(0);
      prisma.category.findFirst.mockResolvedValue(incomeCategory);
      prisma.transaction.update.mockResolvedValue(storedIncome);

      await expect(
        service.update(USER_ID, TRANSACTION_ID, {
          type: TransactionType.INCOME,
          amountMinor: 8_000_000,
          categoryId: CATEGORY_ID,
        }),
      ).resolves.toBeDefined();
    });

    it('refuses to become income without an amount, even when empty', async () => {
      prisma.transaction.findFirst.mockResolvedValue(storedTransaction);
      prisma.transactionItem.count.mockResolvedValue(0);

      await expect(
        service.update(USER_ID, TRANSACTION_ID, { type: TransactionType.INCOME }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    // Leaving income, the entered figure stops being authoritative and no lines
    // exist to replace it — so it is reset rather than left behind as a stale total.
    it('resets the amount and category when income becomes an expense', async () => {
      prisma.transaction.findFirst.mockResolvedValue(storedIncome);
      prisma.transactionItem.count.mockResolvedValue(0);
      prisma.transaction.update.mockResolvedValue(storedTransaction);

      await service.update(USER_ID, TRANSACTION_ID, { type: TransactionType.EXPENSE });

      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amountMinor: 0, categoryId: null }) as object,
        }),
      );
    });

    it('does not count anything when the type is unchanged', async () => {
      prisma.transaction.findFirst.mockResolvedValue(storedTransaction);
      prisma.transaction.update.mockResolvedValue(storedTransaction);

      await service.update(USER_ID, TRANSACTION_ID, { type: TransactionType.EXPENSE });

      expect(prisma.transactionItem.count).not.toHaveBeenCalled();
    });
  });

  // Direction is the only thing a line's category constrains. Where a category is
  // bound is a label, so moving a receipt between wallets strands nothing and must
  // not inspect the lines at all — this guards against the old check coming back.
  it('moves a receipt to another account without checking its lines', async () => {
    const otherAccountId = '55555555-5555-4555-8555-555555555555';
    prisma.transaction.findFirst.mockResolvedValue(storedTransaction);
    prisma.account.findFirst.mockResolvedValue({ ...account, id: otherAccountId });
    prisma.transaction.update.mockResolvedValue(storedTransaction);

    await expect(
      service.update(USER_ID, TRANSACTION_ID, { accountId: otherAccountId }),
    ).resolves.toBeDefined();
    expect(prisma.transactionItem.count).not.toHaveBeenCalled();
  });

  // Category lives on the header for income and on the lines for an expense, so
  // the filter has to look in both — matching only the lines hides income entirely.
  it('filters by category across both the header and the lines', async () => {
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.transaction.count.mockResolvedValue(0);

    await service.findAll(USER_ID, { limit: 25, offset: 0, categoryId: CATEGORY_ID });

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [{ categoryId: CATEGORY_ID }, { items: { some: { categoryId: CATEGORY_ID } } }],
            },
          ],
        }) as object,
      }),
    );
  });

  // `search` is itself a top-level OR. Written as a bare OR the category filter
  // would be overwritten by it — one key, last one wins — and quietly stop applying.
  it('keeps the category filter when a search term is also given', async () => {
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.transaction.count.mockResolvedValue(0);

    await service.findAll(USER_ID, {
      limit: 25,
      offset: 0,
      categoryId: CATEGORY_ID,
      search: 'salary',
    });

    const [[call]] = prisma.transaction.findMany.mock.calls as [
      [{ where: { AND?: unknown[]; OR?: unknown[] } }],
    ];
    expect(call.where.AND).toBeDefined();
    expect(call.where.OR).toBeDefined();
  });
});
