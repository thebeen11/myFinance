import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../database/prisma.service';
import { ListAccountsQueryDto } from '../models/list-accounts-query.dto';
import { AccountsService } from './accounts.service';

const USER_ID = '99999999-9999-4999-8999-999999999999';

const account = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: USER_ID,
  name: 'Cash',
  type: 'CASH',
  currency: 'IDR',
  openingBalanceMinor: 50_000,
  archivedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  _count: { categories: 2, transactions: 7 },
};

const listQuery = (overrides: Partial<ListAccountsQueryDto> = {}): ListAccountsQueryDto =>
  Object.assign(new ListAccountsQueryDto(), { limit: 25, offset: 0, ...overrides });

const createPrismaMock = () => ({
  account: { findFirst: jest.fn(), findMany: jest.fn() },
  transaction: { groupBy: jest.fn() },
  // `findAll` batches its three reads; the mock just resolves them in order.
  $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
});

describe('AccountsService', () => {
  const prisma = createPrismaMock();

  let service: AccountsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [AccountsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(AccountsService);
  });

  describe('getBalance', () => {
    it('adds income and subtracts expense from the opening balance', async () => {
      prisma.account.findFirst.mockResolvedValue(account);
      prisma.transaction.groupBy.mockResolvedValue([
        { type: 'INCOME', _sum: { amountMinor: 300_000 } },
        { type: 'EXPENSE', _sum: { amountMinor: 125_000 } },
      ]);

      await expect(service.getBalance(USER_ID, account.id)).resolves.toEqual({
        accountId: account.id,
        currency: 'IDR',
        openingBalanceMinor: 50_000,
        incomeMinor: 300_000,
        expenseMinor: 125_000,
        balanceMinor: 225_000,
      });
    });

    it('falls back to the opening balance when there are no transactions', async () => {
      prisma.account.findFirst.mockResolvedValue(account);
      prisma.transaction.groupBy.mockResolvedValue([]);

      await expect(service.getBalance(USER_ID, account.id)).resolves.toMatchObject({
        incomeMinor: 0,
        expenseMinor: 0,
        balanceMinor: 50_000,
      });
    });

    it('throws when the account does not exist', async () => {
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(service.getBalance(USER_ID, account.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('sums only the signed-in user’s transactions', async () => {
      prisma.account.findFirst.mockResolvedValue(account);
      prisma.transaction.groupBy.mockResolvedValue([]);

      await service.getBalance(USER_ID, account.id);

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID, accountId: account.id } }),
      );
    });
  });

  describe('findAll', () => {
    const savings = {
      ...account,
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Savings',
      currency: 'IDR',
      openingBalanceMinor: 1_000_000,
    };

    const dollars = {
      ...account,
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Dollars',
      currency: 'USD',
      openingBalanceMinor: 20_000,
    };

    /** `scope` (whole set), then the bulk aggregate, then the page. */
    const mockList = (scope: unknown[], posted: unknown[], page: unknown[] = scope): void => {
      prisma.account.findMany.mockResolvedValueOnce(scope).mockResolvedValueOnce(page);
      prisma.transaction.groupBy.mockResolvedValue(posted);
    };

    it('attaches a balance to every row without a query per account', async () => {
      mockList(
        [account, savings],
        [
          { accountId: account.id, type: 'INCOME', _sum: { amountMinor: 300_000 } },
          { accountId: account.id, type: 'EXPENSE', _sum: { amountMinor: 125_000 } },
        ],
      );

      const result = await service.findAll(USER_ID, listQuery());

      expect(result.data[0]?.balance).toEqual({
        accountId: account.id,
        currency: 'IDR',
        openingBalanceMinor: 50_000,
        incomeMinor: 300_000,
        expenseMinor: 125_000,
        balanceMinor: 225_000,
      });
      // Nothing posted to it, so it sits at its opening balance.
      expect(result.data[1]?.balance.balanceMinor).toBe(1_000_000);
      // One bulk aggregate, not one per account.
      expect(prisma.transaction.groupBy).toHaveBeenCalledTimes(1);
    });

    it('rolls totals up over the whole set, not just the page', async () => {
      // Three accounts match; the page holds only the first.
      mockList([account, savings, dollars], [], [account]);

      const result = await service.findAll(USER_ID, listQuery({ limit: 1 }));

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(3);
      expect(result.totalsByCurrency).toEqual([
        { currency: 'IDR', totalMinor: 1_050_000, accountCount: 2 },
        { currency: 'USD', totalMinor: 20_000, accountCount: 1 },
      ]);
    });

    it('never sums balances across currencies', async () => {
      mockList([account, dollars], []);

      const { totalsByCurrency } = await service.findAll(USER_ID, listQuery());

      expect(totalsByCurrency.map((entry) => entry.currency)).toEqual(['IDR', 'USD']);
    });

    it('leaves archived accounts out of the rows and the roll-up', async () => {
      const archived = { ...savings, archivedAt: new Date('2026-02-01T00:00:00.000Z') };
      mockList([account, archived], [], [account]);

      const result = await service.findAll(USER_ID, listQuery());

      expect(result.total).toBe(1);
      expect(result.totalsByCurrency).toEqual([
        { currency: 'IDR', totalMinor: 50_000, accountCount: 1 },
      ]);
      // Counted even while hidden — it is what labels the "show archived" toggle.
      expect(result.archivedTotal).toBe(1);
    });

    it('includes archived accounts when asked', async () => {
      const archived = { ...savings, archivedAt: new Date('2026-02-01T00:00:00.000Z') };
      mockList([account, archived], []);

      const result = await service.findAll(USER_ID, listQuery({ includeArchived: true }));

      expect(result.total).toBe(2);
      expect(result.totalsByCurrency).toEqual([
        { currency: 'IDR', totalMinor: 1_050_000, accountCount: 2 },
      ]);
    });

    it('pages with the requested window', async () => {
      mockList([account, savings], [], [savings]);

      const result = await service.findAll(USER_ID, listQuery({ limit: 1, offset: 1 }));

      expect(result).toMatchObject({ limit: 1, offset: 1 });
      expect(prisma.account.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 1, skip: 1 }),
      );
    });

    it('filters by name when a search term is given', async () => {
      mockList([account], []);

      await service.findAll(USER_ID, listQuery({ search: 'cas' }));

      expect(prisma.account.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            userId: USER_ID,
            name: { contains: 'cas', mode: 'insensitive' },
            archivedAt: null,
          },
        }),
      );
    });
  });

  describe('tenant scoping', () => {
    it('looks an account up by owner, not by id alone', async () => {
      prisma.account.findFirst.mockResolvedValue(account);
      prisma.transaction.groupBy.mockResolvedValue([]);

      await service.findOne(USER_ID, account.id);

      expect(prisma.account.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: account.id, userId: USER_ID } }),
      );
    });

    it('reports another user’s account as missing rather than forbidden', async () => {
      // The row exists, it just is not ours — the scoped lookup returns null.
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(service.findOne(USER_ID, account.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('constrains the list query to the signed-in user', async () => {
      prisma.account.findMany.mockResolvedValue([]);
      prisma.transaction.groupBy.mockResolvedValue([]);

      await service.findAll(USER_ID, listQuery());

      expect(prisma.account.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { userId: USER_ID, archivedAt: null } }),
      );
    });

    it('scopes the bulk balance aggregate to the user’s own accounts', async () => {
      prisma.account.findMany.mockResolvedValue([]);
      prisma.transaction.groupBy.mockResolvedValue([]);

      await service.findAll(USER_ID, listQuery());

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, account: { userId: USER_ID } },
        }),
      );
    });
  });
});

describe('AccountsService usage counts', () => {
  const prisma = createPrismaMock();

  let service: AccountsService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [AccountsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(AccountsService);
  });

  // The delete confirmation reads both numbers, and they mean different things:
  // transactions are destroyed with the account, categories merely come loose.
  it('reports what an account would take with it', async () => {
    prisma.account.findFirst.mockResolvedValue(account);
    prisma.transaction.groupBy.mockResolvedValue([]);

    await expect(service.findOne(USER_ID, account.id)).resolves.toMatchObject({
      categoryCount: 2,
      transactionCount: 7,
    });
  });
});
