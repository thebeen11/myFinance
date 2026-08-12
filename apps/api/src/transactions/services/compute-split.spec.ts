import { CategoryKind, TransactionType } from '@myfinance/shared';

import { computeSplit } from './compute-split';
import type { TransactionWithRelations } from './transaction-include';

const PAYER_ACCOUNT = '11111111-1111-4111-8111-111111111111';
const WIFE_ACCOUNT = '22222222-2222-4222-8222-222222222222';
const GOPAY_ACCOUNT = '33333333-3333-4333-8333-333333333333';

const account = (id: string, name: string) => ({ id, name, currency: 'IDR' });

const category = (id: string, name: string, linkedTo: { id: string; name: string } | null) => ({
  id,
  name,
  kind: CategoryKind.EXPENSE,
  color: null,
  account: linkedTo ? account(linkedTo.id, linkedTo.name) : null,
});

const line = (
  lineTotalMinor: number,
  itemCategory: ReturnType<typeof category> | null,
): TransactionWithRelations['items'][number] =>
  ({ lineTotalMinor, category: itemCategory }) as TransactionWithRelations['items'][number];

const receipt = (overrides: Partial<TransactionWithRelations>): TransactionWithRelations =>
  ({
    accountId: PAYER_ACCOUNT,
    type: TransactionType.EXPENSE,
    settlementId: null,
    items: [],
    charges: [],
    settlements: [],
    ...overrides,
  }) as TransactionWithRelations;

const snacks = category('c1', 'Snacks', { id: WIFE_ACCOUNT, name: 'Bank BCA' });
const toiletries = category('c2', 'Toiletries', { id: WIFE_ACCOUNT, name: 'Bank BCA' });
const transport = category('c3', 'Transport', { id: GOPAY_ACCOUNT, name: 'Gopay' });
const ownGroceries = category('c4', 'Groceries', { id: PAYER_ACCOUNT, name: 'Cash' });
const unassigned = category('c5', 'Misc', null);

describe('computeSplit', () => {
  describe('which lines belong to another account', () => {
    it('attributes a line whose category is linked to another account', () => {
      const split = computeSplit(receipt({ items: [line(60_000, snacks), line(95_000, null)] }));

      expect(split?.lines).toHaveLength(1);
      expect(split?.lines[0]).toMatchObject({
        accountId: WIFE_ACCOUNT,
        accountName: 'Bank BCA',
        itemsMinor: 60_000,
        owedMinor: 60_000,
      });
      expect(split?.ownShareMinor).toBe(95_000);
    });

    it.each([
      ['a category linked to the paying account', ownGroceries],
      ['a category with no account at all', unassigned],
      ['no category', null],
    ])('keeps a line with %s on the payer', (_label, itemCategory) => {
      const split = computeSplit(
        receipt({ items: [line(60_000, snacks), line(40_000, itemCategory)] }),
      );

      expect(split?.ownShareMinor).toBe(40_000);
      expect(split?.lines).toHaveLength(1);
    });

    it('is null when every line is the payer’s own', () => {
      expect(computeSplit(receipt({ items: [line(95_000, ownGroceries)] }))).toBeNull();
    });

    it('is null for income and for a reimbursement posting', () => {
      expect(computeSplit(receipt({ type: TransactionType.INCOME }))).toBeNull();
      expect(
        computeSplit(receipt({ settlementId: 's1', items: [line(60_000, snacks)] })),
      ).toBeNull();
    });

    it('keeps one row per category but rolls them up per account', () => {
      const split = computeSplit(
        receipt({
          items: [line(60_000, snacks), line(24_000, toiletries), line(21_000, transport)],
        }),
      );

      expect(split?.lines.map((row) => row.category.name)).toEqual([
        'Snacks',
        'Toiletries',
        'Transport',
      ]);
      expect(split?.debtors).toEqual([
        expect.objectContaining({ accountId: WIFE_ACCOUNT, owedMinor: 84_000 }),
        expect.objectContaining({ accountId: GOPAY_ACCOUNT, owedMinor: 21_000 }),
      ]);
    });
  });

  describe('charges are prorated by item subtotal', () => {
    it('splits a charge in proportion to what each participant consumed', () => {
      const split = computeSplit(
        receipt({
          items: [line(84_000, snacks), line(21_000, transport), line(95_000, ownGroceries)],
          charges: [{ amountMinor: 22_000 }] as TransactionWithRelations['charges'],
        }),
      );

      // 84/200, 21/200 and 95/200 of 22_000.
      expect(split?.lines.find((row) => row.category.name === 'Snacks')).toMatchObject({
        chargeShareMinor: 9_240,
        owedMinor: 93_240,
      });
      expect(split?.lines.find((row) => row.category.name === 'Transport')).toMatchObject({
        chargeShareMinor: 2_310,
        owedMinor: 23_310,
      });
      expect(split?.ownShareMinor).toBe(105_450);
    });

    it('always adds back to the receipt, however the rounding falls', () => {
      // Three equal shares of a total that does not divide by three: independent
      // rounding would lose or gain a minor unit here.
      const split = computeSplit(
        receipt({
          items: [line(10, snacks), line(10, transport), line(10, ownGroceries)],
          charges: [{ amountMinor: 100 }] as TransactionWithRelations['charges'],
        }),
      );

      const owed = split!.debtors.reduce((total, row) => total + row.owedMinor, 0);

      expect(owed + split!.ownShareMinor).toBe(130);
    });

    it('leaves charges with the payer when nothing was itemised', () => {
      const split = computeSplit(
        receipt({
          settlements: [settlementRow(WIFE_ACCOUNT, 5_000)],
          charges: [{ amountMinor: 7_000 }] as TransactionWithRelations['charges'],
        }),
      );

      expect(split?.ownShareMinor).toBe(7_000);
      expect(split?.debtors[0].owedMinor).toBe(0);
    });
  });

  describe('reimbursements', () => {
    it('attaches the reimbursement to the account that owed, and reads the posting ids off it', () => {
      const split = computeSplit(
        receipt({
          items: [line(84_000, snacks)],
          settlements: [settlementRow(WIFE_ACCOUNT, 84_000)],
        }),
      );

      expect(split?.debtors[0].settlement).toMatchObject({
        settledMinor: 84_000,
        inboundTransactionId: 'in-1',
        outboundTransactionId: 'out-1',
        isStale: false,
      });
    });

    it('flags a reimbursement as stale once the receipt no longer agrees with it', () => {
      const split = computeSplit(
        receipt({
          items: [line(95_000, snacks)],
          settlements: [settlementRow(WIFE_ACCOUNT, 84_000)],
        }),
      );

      expect(split?.debtors[0]).toMatchObject({
        owedMinor: 95_000,
        settlement: expect.objectContaining({ settledMinor: 84_000, isStale: true }) as object,
      });
    });

    it('keeps a reimbursed account visible after its lines are deleted, so it can be undone', () => {
      const split = computeSplit(
        receipt({ items: [], settlements: [settlementRow(WIFE_ACCOUNT, 84_000)] }),
      );

      expect(split?.lines).toHaveLength(0);
      expect(split?.debtors).toEqual([
        expect.objectContaining({
          accountId: WIFE_ACCOUNT,
          accountName: 'Bank BCA',
          owedMinor: 0,
          settlement: expect.objectContaining({ isStale: true }) as object,
        }),
      ]);
    });
  });
});

const settlementRow = (
  owedAccountId: string,
  settledMinor: number,
): TransactionWithRelations['settlements'][number] =>
  ({
    id: `s-${owedAccountId}`,
    owedAccountId,
    settledMinor,
    settledAt: new Date('2026-08-12T00:00:00.000Z'),
    owedAccount: { id: owedAccountId, name: 'Bank BCA', currency: 'IDR' },
    postings: [
      { id: 'in-1', type: TransactionType.INCOME },
      { id: 'out-1', type: TransactionType.EXPENSE },
    ],
  }) as TransactionWithRelations['settlements'][number];
