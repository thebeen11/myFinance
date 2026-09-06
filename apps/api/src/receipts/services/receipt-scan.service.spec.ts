import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../database/prisma.service';
import { ScanReceiptDto } from '../models/scan-receipt.dto';

import type { ExtractedReceipt } from './extracted-receipt';
import { readReceipt } from './gemini-receipt-reader';
import { ReceiptScanService } from './receipt-scan.service';

jest.mock('./gemini-receipt-reader', () => ({ readReceipt: jest.fn() }));

const readReceiptMock = readReceipt as jest.MockedFunction<typeof readReceipt>;

const USER_ID = '99999999-9999-4999-8999-999999999999';
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

const dto: ScanReceiptDto = {
  accountId: ACCOUNT_ID,
  mimeType: 'image/jpeg',
  imageBase64: 'aGVsbG8=',
};

const extracted = (overrides: Partial<ExtractedReceipt> = {}): ExtractedReceipt => ({
  merchantName: 'Indomaret',
  purchasedOn: '2026-08-10',
  lines: [{ code: 'A-01', name: 'Indomie Goreng', quantity: 2, unitPrice: 3500, discounts: [] }],
  charges: [],
  grandTotal: 7000,
  ...overrides,
});

describe('ReceiptScanService', () => {
  // Reads only, and that is the point: the scan writes nothing, so any attempt to
  // create or update through this client would fail the whole suite on an
  // undefined method rather than pass quietly.
  const prisma = {
    account: { findFirst: jest.fn() },
    merchant: { findMany: jest.fn() },
    product: { findMany: jest.fn() },
  };

  let service: ReceiptScanService;

  beforeEach(async () => {
    jest.resetAllMocks();

    prisma.account.findFirst.mockResolvedValue({ id: ACCOUNT_ID, currency: 'IDR' });
    prisma.merchant.findMany.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([]);
    readReceiptMock.mockResolvedValue(extracted());

    const moduleRef = await Test.createTestingModule({
      providers: [ReceiptScanService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ReceiptScanService);
  });

  describe('tenant isolation', () => {
    it('rejects another user’s account as missing rather than reading the photo', async () => {
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(service.scan(USER_ID, dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(readReceiptMock).not.toHaveBeenCalled();
    });

    it('resolves the account by owner, not by id alone', async () => {
      await service.scan(USER_ID, dto);

      expect(prisma.account.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ACCOUNT_ID, userId: USER_ID } }),
      );
    });

    it('scopes the merchant catalogue to the signed-in user', async () => {
      await service.scan(USER_ID, dto);

      expect(prisma.merchant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID } }),
      );
    });
  });

  describe('the account owns the scale', () => {
    it('reads a zero-decimal currency as whole units', async () => {
      const draft = await service.scan(USER_ID, dto);

      expect(draft.lines[0].unitPriceMinor).toBe(3500);
      expect(draft.printedTotalMinor).toBe(7000);
    });

    it('reads the same figures into a two-decimal account a hundred times larger', async () => {
      prisma.account.findFirst.mockResolvedValue({ id: ACCOUNT_ID, currency: 'USD' });

      const draft = await service.scan(USER_ID, dto);

      expect(draft.currency).toBe('USD');
      expect(draft.lines[0].unitPriceMinor).toBe(350_000);
    });
  });

  describe('the two totals are reported, never reconciled', () => {
    it('derives the total from the lines and charges it produced', async () => {
      readReceiptMock.mockResolvedValue(
        extracted({ charges: [{ name: 'PPN', percent: 11, amount: 770 }], grandTotal: 7770 }),
      );

      const draft = await service.scan(USER_ID, dto);

      expect(draft.derivedTotalMinor).toBe(7770);
      expect(draft.printedTotalMinor).toBe(7770);
    });

    it('leaves a disagreement visible instead of trusting either figure', async () => {
      readReceiptMock.mockResolvedValue(extracted({ grandTotal: 9000 }));

      const draft = await service.scan(USER_ID, dto);

      expect(draft.printedTotalMinor).toBe(9000);
      expect(draft.derivedTotalMinor).toBe(7000);
    });

    it('reports no printed total rather than substituting the derived one', async () => {
      readReceiptMock.mockResolvedValue(extracted({ grandTotal: null }));

      const draft = await service.scan(USER_ID, dto);

      expect(draft.printedTotalMinor).toBeNull();
      expect(draft.derivedTotalMinor).toBe(7000);
    });
  });

  describe('line money', () => {
    it('applies a discount as a rate and derives the net line total from it', async () => {
      readReceiptMock.mockResolvedValue(
        extracted({
          lines: [
            {
              code: null,
              name: 'Indomie',
              quantity: 2,
              unitPrice: 3500,
              discounts: [{ name: null, percent: 10, amount: null }],
            },
          ],
        }),
      );

      const draft = await service.scan(USER_ID, dto);

      expect(draft.lines[0].discounts).toEqual([
        { name: null, basisPoints: 1000, amountMinor: null },
      ]);
      expect(draft.lines[0].discountBasisPoints).toBe(1000);
      expect(draft.lines[0].lineTotalMinor).toBe(6300);
    });

    it('cascades several discounts on one line, in the order printed', async () => {
      readReceiptMock.mockResolvedValue(
        extracted({
          lines: [
            {
              code: null,
              name: 'Kaos Polos',
              quantity: 1,
              unitPrice: 55000,
              discounts: [
                { name: 'Product', percent: 20, amount: null },
                { name: 'Member', percent: 5, amount: null },
              ],
            },
          ],
          grandTotal: 41800,
        }),
      );

      const draft = await service.scan(USER_ID, dto);

      // 5% of the 44_000 the first left, not of the 55_000 gross.
      expect(draft.lines[0].lineTotalMinor).toBe(41800);
      // The reviewer's figure has to be the one the confirm will store, or the
      // reconciliation against the printed total means nothing.
      expect(draft.derivedTotalMinor).toBe(draft.printedTotalMinor);
    });

    it('scales a printed lump-sum discount into the account’s minor units', async () => {
      readReceiptMock.mockResolvedValue(
        extracted({
          lines: [
            {
              code: null,
              name: 'Indomie',
              quantity: 2,
              unitPrice: 3500,
              discounts: [{ name: 'Voucher', percent: null, amount: 1000 }],
            },
          ],
        }),
      );

      const draft = await service.scan(USER_ID, dto);

      expect(draft.lines[0].discounts).toEqual([
        { name: 'Voucher', basisPoints: null, amountMinor: 1000 },
      ]);
      expect(draft.lines[0].lineTotalMinor).toBe(6000);
    });

    it('reads an absent discount as zero rather than leaving it unset', async () => {
      const draft = await service.scan(USER_ID, dto);

      expect(draft.lines[0].discounts).toEqual([]);
      expect(draft.lines[0].discountBasisPoints).toBe(0);
      expect(draft.lines[0].lineTotalMinor).toBe(7000);
    });
  });

  describe('the catalogue is resolved here, not by the model', () => {
    const merchant = { id: 'm-1', name: 'Indomaret' };
    const product = {
      id: 'p-1',
      code: 'A-01',
      name: 'Indomie Goreng',
      categoryId: 'c-1',
      category: { name: 'Groceries' },
    };

    it('fills in the product and its category for a known merchant', async () => {
      prisma.merchant.findMany.mockResolvedValue([merchant]);
      prisma.product.findMany.mockResolvedValue([product]);

      const draft = await service.scan(USER_ID, dto);

      expect(draft.merchant).toEqual({ id: 'm-1', name: 'Indomaret' });
      expect(draft.lines[0]).toEqual(
        expect.objectContaining({ productId: 'p-1', categoryId: 'c-1', categoryName: 'Groceries' }),
      );
    });

    it('loads the catalogue once for the whole receipt, not once per line', async () => {
      prisma.merchant.findMany.mockResolvedValue([merchant]);
      prisma.product.findMany.mockResolvedValue([product]);
      readReceiptMock.mockResolvedValue(
        extracted({
          lines: Array.from({ length: 12 }, (_, index) => ({
            code: null,
            name: `Item ${index}`,
            quantity: 1,
            unitPrice: 1000,
            discounts: [],
          })),
        }),
      );

      await service.scan(USER_ID, dto);

      expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    });

    it('keeps the printed name but no ids when the merchant is unknown', async () => {
      const draft = await service.scan(USER_ID, dto);

      expect(draft.merchant).toEqual({ id: null, name: 'Indomaret' });
      expect(draft.lines[0]).toEqual(
        expect.objectContaining({ productId: null, categoryId: null, categoryName: null }),
      );
    });

    it('does not read a catalogue at all when no merchant matched', async () => {
      await service.scan(USER_ID, dto);

      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });
  });

  describe('the printed date', () => {
    it('lands at UTC midnight so a purchase cannot drift into another month', async () => {
      const draft = await service.scan(USER_ID, dto);

      expect(draft.occurredAt).toBe('2026-08-10T00:00:00.000Z');
    });

    it('is null rather than today when the receipt showed none', async () => {
      readReceiptMock.mockResolvedValue(extracted({ purchasedOn: null }));

      await expect(service.scan(USER_ID, dto)).resolves.toEqual(
        expect.objectContaining({ occurredAt: null }),
      );
    });

    it('is null rather than a guess when the date is not a calendar date', async () => {
      readReceiptMock.mockResolvedValue(extracted({ purchasedOn: '10 Agustus' }));

      await expect(service.scan(USER_ID, dto)).resolves.toEqual(
        expect.objectContaining({ occurredAt: null }),
      );
    });
  });
});
