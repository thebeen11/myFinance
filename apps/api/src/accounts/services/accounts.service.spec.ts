import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../database/prisma.service';
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

describe('AccountsService', () => {
  const prisma = {
    account: { findFirst: jest.fn(), findMany: jest.fn() },
    transaction: { groupBy: jest.fn() },
  };

  let service: AccountsService;

  beforeEach(async () => {
    jest.resetAllMocks();

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

  describe('tenant scoping', () => {
    it('looks an account up by owner, not by id alone', async () => {
      prisma.account.findFirst.mockResolvedValue(account);

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

      await service.findAll(USER_ID, false);

      expect(prisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID, archivedAt: null } }),
      );
    });
  });
});

describe('AccountsService usage counts', () => {
  const prisma = {
    account: { findFirst: jest.fn(), findMany: jest.fn() },
    transaction: { groupBy: jest.fn() },
  };

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

    await expect(service.findOne(USER_ID, account.id)).resolves.toMatchObject({
      categoryCount: 2,
      transactionCount: 7,
    });
  });
});
