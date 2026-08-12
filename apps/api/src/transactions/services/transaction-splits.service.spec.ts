import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CategoryKind, TransactionType } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';

import { TransactionSplitsService } from './transaction-splits.service';
import { TransactionsService } from './transactions.service';

const USER_ID = '99999999-9999-4999-8999-999999999999';
const PAYER_ACCOUNT = '11111111-1111-4111-8111-111111111111';
const WIFE_ACCOUNT = '22222222-2222-4222-8222-222222222222';
const TRANSACTION_ID = '33333333-3333-4333-8333-333333333333';
const SETTLEMENT_ID = '44444444-4444-4444-8444-444444444444';

const wifeAccount = {
  id: WIFE_ACCOUNT,
  userId: USER_ID,
  name: 'Bank BCA',
  type: 'BANK',
  currency: 'IDR',
};

/** A receipt paid from Cash carrying one line filed under a Bank BCA category. */
const frontedReceipt = {
  id: TRANSACTION_ID,
  userId: USER_ID,
  accountId: PAYER_ACCOUNT,
  type: TransactionType.EXPENSE,
  currency: 'IDR',
  amountMinor: 84_000,
  settlementId: null,
  description: 'Groceries',
  account: { id: PAYER_ACCOUNT, name: 'Cash', type: 'CASH' },
  items: [
    {
      lineTotalMinor: 84_000,
      category: {
        id: 'c1',
        name: 'Snacks',
        kind: CategoryKind.EXPENSE,
        color: null,
        account: { id: WIFE_ACCOUNT, name: 'Bank BCA', currency: 'IDR' },
      },
    },
  ],
  charges: [],
  settlements: [],
};

describe('TransactionSplitsService', () => {
  const tx = {
    transactionSettlement: { create: jest.fn() },
    transaction: { createMany: jest.fn() },
  };

  const prisma = {
    account: { findFirst: jest.fn() },
    transaction: { findFirst: jest.fn() },
    transactionSettlement: { findFirst: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(),
  };

  const transactionsService = { findOne: jest.fn() };

  let service: TransactionSplitsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
    );
    tx.transactionSettlement.create.mockResolvedValue({ id: SETTLEMENT_ID });

    const moduleRef = await Test.createTestingModule({
      providers: [
        TransactionSplitsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
      ],
    }).compile();

    service = moduleRef.get(TransactionSplitsService);
  });

  describe('settle', () => {
    it('posts an income on the account that paid and an expense on the one that owed, both uncategorised', async () => {
      prisma.transaction.findFirst.mockResolvedValue(frontedReceipt);
      prisma.account.findFirst.mockResolvedValue(wifeAccount);

      await service.settle(USER_ID, TRANSACTION_ID, { owedAccountId: WIFE_ACCOUNT });

      const [[{ data }]] = tx.transaction.createMany.mock.calls as [
        [{ data: { type: string; accountId: string; categoryId?: string | null }[] }],
      ];
      const [inbound, outbound] = data;

      expect(inbound).toMatchObject({
        accountId: PAYER_ACCOUNT,
        type: TransactionType.INCOME,
        amountMinor: 84_000,
        settlementId: SETTLEMENT_ID,
      });
      expect(outbound).toMatchObject({
        accountId: WIFE_ACCOUNT,
        type: TransactionType.EXPENSE,
        amountMinor: 84_000,
        settlementId: SETTLEMENT_ID,
      });
      // The spending is already classified on the receipt; repeating it here would
      // count the same money twice in the summary's breakdown.
      expect(inbound.categoryId).toBeUndefined();
      expect(outbound.categoryId).toBeUndefined();
    });

    it('snapshots the share rather than taking an amount from the caller', async () => {
      prisma.transaction.findFirst.mockResolvedValue(frontedReceipt);
      prisma.account.findFirst.mockResolvedValue(wifeAccount);

      await service.settle(USER_ID, TRANSACTION_ID, { owedAccountId: WIFE_ACCOUNT });

      expect(tx.transactionSettlement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            settledMinor: 84_000,
            owedAccountId: WIFE_ACCOUNT,
          }) as object,
        }),
      );
    });

    it('returns the parent receipt, so the caller re-renders from one reply', async () => {
      prisma.transaction.findFirst.mockResolvedValue(frontedReceipt);
      prisma.account.findFirst.mockResolvedValue(wifeAccount);
      transactionsService.findOne.mockResolvedValue({ id: TRANSACTION_ID });

      await expect(
        service.settle(USER_ID, TRANSACTION_ID, { owedAccountId: WIFE_ACCOUNT }),
      ).resolves.toEqual({ id: TRANSACTION_ID });
      expect(transactionsService.findOne).toHaveBeenCalledWith(USER_ID, TRANSACTION_ID);
    });

    it('refuses to reimburse across currencies, since nothing holds an FX rate', async () => {
      prisma.transaction.findFirst.mockResolvedValue(frontedReceipt);
      prisma.account.findFirst.mockResolvedValue({ ...wifeAccount, currency: 'USD' });

      await expect(
        service.settle(USER_ID, TRANSACTION_ID, { owedAccountId: WIFE_ACCOUNT }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('404s when the account has no share of this receipt', async () => {
      prisma.transaction.findFirst.mockResolvedValue({ ...frontedReceipt, items: [] });

      await expect(
        service.settle(USER_ID, TRANSACTION_ID, { owedAccountId: WIFE_ACCOUNT }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s on another user’s transaction rather than revealing it exists', async () => {
      prisma.transaction.findFirst.mockResolvedValue(null);

      await expect(
        service.settle(USER_ID, TRANSACTION_ID, { owedAccountId: WIFE_ACCOUNT }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to split a row that a reimbursement itself posted', async () => {
      prisma.transaction.findFirst.mockResolvedValue({
        ...frontedReceipt,
        settlementId: SETTLEMENT_ID,
      });

      await expect(
        service.settle(USER_ID, TRANSACTION_ID, { owedAccountId: WIFE_ACCOUNT }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('scopes the reimbursing account lookup by owner', async () => {
      prisma.transaction.findFirst.mockResolvedValue(frontedReceipt);
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(
        service.settle(USER_ID, TRANSACTION_ID, { owedAccountId: WIFE_ACCOUNT }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.account.findFirst).toHaveBeenCalledWith({
        where: { id: WIFE_ACCOUNT, userId: USER_ID },
      });
    });
  });

  describe('unsettle', () => {
    it('deletes the record, letting both postings cascade with it', async () => {
      prisma.transactionSettlement.findFirst.mockResolvedValue({ id: SETTLEMENT_ID });

      await service.unsettle(USER_ID, TRANSACTION_ID, WIFE_ACCOUNT);

      expect(prisma.transactionSettlement.delete).toHaveBeenCalledWith({
        where: { id: SETTLEMENT_ID },
      });
    });

    it('404s when that account has reimbursed nothing on this receipt', async () => {
      prisma.transactionSettlement.findFirst.mockResolvedValue(null);

      await expect(service.unsettle(USER_ID, TRANSACTION_ID, WIFE_ACCOUNT)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.transactionSettlement.delete).not.toHaveBeenCalled();
    });
  });
});
