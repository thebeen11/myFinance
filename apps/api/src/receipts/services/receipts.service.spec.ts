import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TransactionType } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';
import { TransactionItemsService } from '../../transactions/services/transaction-items.service';
import { TransactionsService } from '../../transactions/services/transactions.service';
import { CreateReceiptDto } from '../models/create-receipt.dto';

import { ReceiptsService } from './receipts.service';

const USER_ID = '99999999-9999-4999-8999-999999999999';
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const MERCHANT_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const TRANSACTION_ID = '44444444-4444-4444-8444-444444444444';

const dto = (overrides: Partial<CreateReceiptDto> = {}): CreateReceiptDto => ({
  accountId: ACCOUNT_ID,
  occurredAt: '2026-08-10T00:00:00.000Z',
  items: [
    { categoryId: CATEGORY_ID, name: 'Indomie Goreng', quantityMilli: 2_000, unitPriceMinor: 3500 },
  ],
  ...overrides,
});

describe('ReceiptsService', () => {
  const tx = {
    transaction: { create: jest.fn() },
  };

  const prisma = {
    account: { findFirst: jest.fn() },
    merchant: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  const transactionsService = { recomputeTotal: jest.fn(), findOne: jest.fn() };
  const transactionItemsService = { createManyInTransaction: jest.fn() };

  let service: ReceiptsService;

  beforeEach(async () => {
    jest.resetAllMocks();

    prisma.account.findFirst.mockResolvedValue({ id: ACCOUNT_ID, currency: 'IDR' });
    prisma.merchant.findFirst.mockResolvedValue({ id: MERCHANT_ID });
    // Re-armed after resetAllMocks, the same way TransactionsService's spec does it.
    prisma.$transaction.mockImplementation((run: (client: typeof tx) => Promise<string>) =>
      run(tx),
    );
    tx.transaction.create.mockResolvedValue({
      id: TRANSACTION_ID,
      type: TransactionType.EXPENSE,
      currency: 'IDR',
    });
    transactionsService.findOne.mockResolvedValue({ id: TRANSACTION_ID });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReceiptsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: TransactionItemsService, useValue: transactionItemsService },
      ],
    }).compile();

    service = moduleRef.get(ReceiptsService);
  });

  describe('the whole receipt commits or none of it does', () => {
    it('writes the header, its lines and the recompute on one client', async () => {
      await service.create(USER_ID, dto());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(transactionItemsService.createManyInTransaction).toHaveBeenCalledWith(
        tx,
        USER_ID,
        expect.objectContaining({ id: TRANSACTION_ID }),
        dto().items,
      );
      expect(transactionsService.recomputeTotal).toHaveBeenCalledWith(tx, TRANSACTION_ID);
    });

    it('derives the total instead of accepting one, so this is no back door', async () => {
      await service.create(USER_ID, dto());

      expect(tx.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amountMinor: 0 }) as object }),
      );
      expect(transactionsService.recomputeTotal).toHaveBeenCalled();
    });

    it('posts an expense, since a receipt is never income', async () => {
      await service.create(USER_ID, dto());

      expect(tx.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: TransactionType.EXPENSE }) as object,
        }),
      );
    });
  });

  describe('the account owns the currency', () => {
    it('stamps the account’s currency rather than taking one from the caller', async () => {
      prisma.account.findFirst.mockResolvedValue({ id: ACCOUNT_ID, currency: 'USD' });

      await service.create(USER_ID, dto());

      expect(tx.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ currency: 'USD' }) as object }),
      );
    });
  });

  describe('charges', () => {
    it('writes them in the order they were read off the receipt', async () => {
      await service.create(
        USER_ID,
        dto({
          charges: [
            { name: 'PPN', percentBasisPoints: 1100, amountMinor: 770 },
            { name: 'Service', percentBasisPoints: null, amountMinor: 500 },
          ],
        }),
      );

      expect(tx.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            charges: {
              create: [
                {
                  userId: USER_ID,
                  name: 'PPN',
                  percentBasisPoints: 1100,
                  amountMinor: 770,
                  position: 0,
                },
                {
                  userId: USER_ID,
                  name: 'Service',
                  percentBasisPoints: null,
                  amountMinor: 500,
                  position: 1,
                },
              ],
            },
          }) as object,
        }),
      );
    });
  });

  describe('tenant isolation', () => {
    it('rejects another user’s account as missing rather than writing anything', async () => {
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(service.create(USER_ID, dto())).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects another user’s merchant as missing rather than writing anything', async () => {
      prisma.merchant.findFirst.mockResolvedValue(null);

      await expect(
        service.create(USER_ID, dto({ merchantId: MERCHANT_ID })),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('resolves the merchant by owner, not by id alone', async () => {
      await service.create(USER_ID, dto({ merchantId: MERCHANT_ID }));

      expect(prisma.merchant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: MERCHANT_ID, userId: USER_ID } }),
      );
    });

    it('skips the merchant lookup entirely when the receipt has none', async () => {
      await service.create(USER_ID, dto());

      expect(prisma.merchant.findFirst).not.toHaveBeenCalled();
    });
  });
});
