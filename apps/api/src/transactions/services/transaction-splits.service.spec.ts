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
    transaction: { findFirst: jest.fn(), findMany: jest.fn() },
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

  describe('listOutstanding', () => {
    const GOPAY_ACCOUNT = '55555555-5555-4555-8555-555555555555';
    const USD_ACCOUNT = '66666666-6666-4666-8666-666666666666';

    /** A receipt paid from Cash, with one line owed by `owedBy`. */
    const owedReceipt = ({
      id,
      occurredAt,
      owedBy = wifeAccount,
      lineTotalMinor = 84_000,
      currency = 'IDR',
      settlements = [] as unknown[],
      description = 'Groceries',
    }: {
      id: string;
      occurredAt: string;
      owedBy?: { id: string; name: string; currency: string };
      lineTotalMinor?: number;
      currency?: string;
      settlements?: unknown[];
      description?: string | null;
    }) => ({
      ...frontedReceipt,
      id,
      currency,
      description,
      occurredAt: new Date(occurredAt),
      amountMinor: lineTotalMinor,
      items: [
        {
          lineTotalMinor,
          category: {
            id: `c-${owedBy.id}`,
            name: 'Snacks',
            kind: CategoryKind.EXPENSE,
            color: null,
            account: { id: owedBy.id, name: owedBy.name, currency },
          },
        },
      ],
      settlements,
    });

    it("scopes the scan to the caller's own unsettled receipts", async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      await service.listOutstanding(USER_ID);

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: USER_ID,
            type: TransactionType.EXPENSE,
            settlementId: null,
          }) as object,
          orderBy: { occurredAt: 'desc' },
        }),
      );
    });

    it('rolls several receipts up into one row and keeps the oldest date', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        owedReceipt({ id: 'r2', occurredAt: '2026-08-20T00:00:00.000Z', lineTotalMinor: 16_000 }),
        owedReceipt({ id: 'r1', occurredAt: '2026-06-11T00:00:00.000Z', lineTotalMinor: 84_000 }),
      ]);

      const result = await service.listOutstanding(USER_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        owedAccountId: WIFE_ACCOUNT,
        owedAccountName: 'Bank BCA',
        paidByAccountId: PAYER_ACCOUNT,
        paidByAccountName: 'Cash',
        currency: 'IDR',
        owedMinor: 100_000,
        receiptCount: 2,
        oldestOccurredAt: '2026-06-11T00:00:00.000Z',
      });
      // Newest first, matching the order they were read in.
      expect(result.data[0].receipts.map((receipt) => receipt.transactionId)).toEqual(['r2', 'r1']);
      expect(result.totalsByCurrency).toEqual([{ currency: 'IDR', owedMinor: 100_000 }]);
    });

    it('leaves out a share that has already been reimbursed', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        owedReceipt({
          id: 'r1',
          occurredAt: '2026-08-20T00:00:00.000Z',
          settlements: [
            {
              id: SETTLEMENT_ID,
              owedAccountId: WIFE_ACCOUNT,
              settledMinor: 84_000,
              settledAt: new Date('2026-08-21T00:00:00.000Z'),
              postings: [],
              owedAccount: wifeAccount,
            },
          ],
        }),
      ]);

      const result = await service.listOutstanding(USER_ID);

      expect(result.data).toEqual([]);
      expect(result.totalsByCurrency).toEqual([]);
    });

    it('leaves out a settled debtor edited off the receipt, whose share is now zero', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        {
          ...owedReceipt({ id: 'r1', occurredAt: '2026-08-20T00:00:00.000Z' }),
          // The line that made GoPay owe is gone; computeSplit keeps the row only so
          // the postings behind it can still be undone.
          items: [],
          settlements: [
            {
              id: SETTLEMENT_ID,
              owedAccountId: GOPAY_ACCOUNT,
              settledMinor: 10_000,
              settledAt: new Date('2026-08-21T00:00:00.000Z'),
              postings: [],
              owedAccount: { id: GOPAY_ACCOUNT, name: 'GoPay', currency: 'IDR' },
            },
          ],
        },
      ]);

      const result = await service.listOutstanding(USER_ID);

      expect(result.data).toEqual([]);
    });

    it('keeps two currencies as two debts, since neither could repay the other', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        owedReceipt({ id: 'r1', occurredAt: '2026-08-20T00:00:00.000Z', lineTotalMinor: 84_000 }),
        owedReceipt({
          id: 'r2',
          occurredAt: '2026-08-19T00:00:00.000Z',
          owedBy: { id: USD_ACCOUNT, name: 'Wise', currency: 'USD' },
          currency: 'USD',
          lineTotalMinor: 1_200,
        }),
      ]);

      const result = await service.listOutstanding(USER_ID);

      expect(result.data).toHaveLength(2);
      // Largest first, and the two are never added together.
      expect(result.data.map((row) => row.currency)).toEqual(['IDR', 'USD']);
      expect(result.totalsByCurrency).toEqual([
        { currency: 'IDR', owedMinor: 84_000 },
        { currency: 'USD', owedMinor: 1_200 },
      ]);
    });
  });
});
