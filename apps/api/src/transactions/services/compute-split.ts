import { TransactionType, allocateProportionally } from '@myfinance/shared';

import { TransactionSplitDebtorResponse } from '../models/transaction-split-debtor.response';
import { TransactionSplitLineResponse } from '../models/transaction-split-line.response';
import { TransactionSplitResponse } from '../models/transaction-split.response';

import type { TransactionWithRelations } from './transaction-include';

/** A category's lines, before charges are prorated onto them. */
interface Bucket {
  category: TransactionSplitLineResponse['category'];
  accountId: string;
  accountName: string;
  itemsMinor: number;
}

/**
 * Derives who owes what on a receipt one account paid for several.
 *
 * A line's category may be linked to a different account than the transaction was
 * posted to — the API allows that deliberately (see `Category.accountId`), and this
 * reads it back out: such a line is money the paying wallet fronted for the linked
 * one. Additional charges belong to nobody in particular, so they are **prorated by
 * each participant's share of the item subtotal**; `allocateProportionally`
 * guarantees the pieces add back to the charge total exactly, which is what keeps
 * `ownShareMinor` plus every debtor's `owedMinor` equal to the receipt.
 *
 * Pure, and deliberately not a service method: `TransactionsService.toResponse`
 * calls it on every read, and making it injectable would put that service and the
 * settlement service in a dependency cycle.
 *
 * @param transaction A transaction loaded with `transactionInclude`.
 * @returns The split, or `null` when nobody owes anything — income, a settlement
 *   posting, or an ordinary receipt whose lines are all its own.
 */
export const computeSplit = (
  transaction: TransactionWithRelations,
): TransactionSplitResponse | null => {
  // A settlement posting is a wallet-to-wallet movement with no lines. Splitting it
  // would be splitting the repayment of a split.
  if (transaction.type !== TransactionType.EXPENSE || transaction.settlementId !== null) {
    return null;
  }

  const buckets = new Map<string, Bucket>();
  let ownItemsMinor = 0;

  for (const item of transaction.items) {
    const account = item.category?.account ?? null;

    // No category, an unassigned one, or one linked to the paying wallet itself:
    // there is nobody else to attribute the line to, so it stays with the payer.
    if (!item.category || !account || account.id === transaction.accountId) {
      ownItemsMinor += item.lineTotalMinor;
      continue;
    }

    const bucket = buckets.get(item.category.id);

    if (bucket) {
      bucket.itemsMinor += item.lineTotalMinor;
      continue;
    }

    buckets.set(item.category.id, {
      category: {
        id: item.category.id,
        name: item.category.name,
        kind: item.category.kind,
        color: item.category.color,
      },
      accountId: account.id,
      accountName: account.name,
      itemsMinor: item.lineTotalMinor,
    });
  }

  // A settled wallet whose lines have since been deleted owes nothing yet still has
  // two postings standing. It has to stay visible, or the only way to undo them
  // would be to delete the receipt.
  if (buckets.size === 0 && transaction.settlements.length === 0) return null;

  const chargesMinor = transaction.charges.reduce((total, charge) => total + charge.amountMinor, 0);
  const ordered = [...buckets.values()];

  const weights = [ownItemsMinor, ...ordered.map((bucket) => bucket.itemsMinor)];
  const subtotalMinor = weights.reduce((total, weight) => total + weight, 0);

  // Charges are prorated by consumption, so a receipt with nothing itemised has
  // nothing to prorate against. They stay whole with the payer rather than
  // dissolving — `ownShareMinor` plus every debt must still equal the receipt.
  //
  // Otherwise: the payer sits at index 0, so a rounding tie falls to them rather
  // than to whichever debtor happens to sort first.
  const chargeShares =
    subtotalMinor === 0
      ? [chargesMinor, ...ordered.map(() => 0)]
      : allocateProportionally(chargesMinor, weights);

  const lines: TransactionSplitLineResponse[] = ordered
    .map((bucket, index) => ({
      category: bucket.category,
      accountId: bucket.accountId,
      accountName: bucket.accountName,
      itemsMinor: bucket.itemsMinor,
      chargeShareMinor: chargeShares[index + 1],
      owedMinor: bucket.itemsMinor + chargeShares[index + 1],
    }))
    .sort((a, b) => b.owedMinor - a.owedMinor || a.category.name.localeCompare(b.category.name));

  return {
    ownShareMinor: ownItemsMinor + chargeShares[0],
    lines,
    debtors: rollUpDebtors(lines, transaction.settlements),
  };
};

/**
 * Rolls the per-category lines up to the grain a debt is actually settled at.
 *
 * Several categories may point at one wallet, and a repayment covers all of them at
 * once — the category rows explain the figure, this is who owes it.
 */
const rollUpDebtors = (
  lines: TransactionSplitLineResponse[],
  settlements: TransactionWithRelations['settlements'],
): TransactionSplitDebtorResponse[] => {
  const owed = new Map<string, { accountName: string; owedMinor: number }>();

  for (const line of lines) {
    const existing = owed.get(line.accountId);

    if (existing) {
      existing.owedMinor += line.owedMinor;
      continue;
    }

    owed.set(line.accountId, { accountName: line.accountName, owedMinor: line.owedMinor });
  }

  for (const settlement of settlements) {
    if (owed.has(settlement.owedAccountId)) continue;

    // Settled, then edited out of the receipt. Zero is owed now, but the postings
    // that paid `settledMinor` are still standing — the row exists so they can be undone.
    owed.set(settlement.owedAccountId, {
      accountName: settlement.owedAccount.name,
      owedMinor: 0,
    });
  }

  return [...owed.entries()]
    .map(([accountId, entry]) => {
      const settlement = settlements.find((row) => row.owedAccountId === accountId) ?? null;

      return {
        accountId,
        accountName: entry.accountName,
        owedMinor: entry.owedMinor,
        settlement: settlement
          ? {
              id: settlement.id,
              settledMinor: settlement.settledMinor,
              settledAt: settlement.settledAt.toISOString(),
              // Both legs are written in one transaction and cascade away together, so
              // in practice these are always present. Nullable rather than defaulted:
              // a fabricated id would send the UI to a row that does not exist.
              inboundTransactionId:
                settlement.postings.find((row) => row.type === TransactionType.INCOME)?.id ?? null,
              outboundTransactionId:
                settlement.postings.find((row) => row.type === TransactionType.EXPENSE)?.id ?? null,
              isStale: settlement.settledMinor !== entry.owedMinor,
            }
          : null,
      };
    })
    .sort((a, b) => b.owedMinor - a.owedMinor || a.accountName.localeCompare(b.accountName));
};
