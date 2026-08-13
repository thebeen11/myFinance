import type { AccountsFindAllData, TransactionsFindAllData } from '@/api';

type AccountListQuery = AccountsFindAllData['query'];
type TransactionListQuery = TransactionsFindAllData['query'];

/** A resolved summary window. Half-open: `from` inclusive, `to` exclusive. */
export interface SummaryWindowKey {
  readonly from: string;
  readonly to: string;
}

/**
 * Single source of truth for cache keys, so invalidation cannot drift from reads.
 *
 * Every transaction-derived key keeps `'transactions'` as its first element on
 * purpose: mutations invalidate the broad `['transactions']` prefix, and that is
 * what refreshes the dashboard's summaries and charts along with the list.
 * A new key that sits outside this prefix would go stale after every edit.
 */
export const queryKeys = {
  me: () => ['me'] as const,
  /**
   * One page of accounts. `'accounts'` stays the first element so the broad
   * invalidation every account mutation does still reaches every window,
   * archived-inclusive ones included — the flag is part of `query` now.
   */
  accounts: (query: AccountListQuery) => ['accounts', query] as const,
  /** One account, balance included — the account's own page reads nothing else. */
  account: (id: string) => ['accounts', id] as const,
  categories: () => ['categories'] as const,
  /**
   * Outside the `'transactions'` prefix — merchants are master data, not derived
   * from transactions. The converse matters though: `TransactionResponse` embeds
   * `merchant`, so renaming or deleting one has to invalidate `['transactions']`
   * as well, or the rows keep showing the old name.
   */
  merchants: () => ['merchants'] as const,
  merchant: (id: string) => ['merchants', id] as const,
  /**
   * Deliberately *inside* the `'merchants'` prefix, unlike the transaction keys:
   * deleting a merchant cascades its products away, so the broad `['merchants']`
   * invalidation every merchant mutation already does must reach these too.
   * The converse is manual — creating or deleting a product changes
   * `MerchantResponse.productCount`, so those mutations invalidate `['merchants']`.
   */
  products: (merchantId: string) => ['merchants', merchantId, 'products'] as const,
  transactions: (query: TransactionListQuery) => ['transactions', query] as const,
  /** One receipt with its lines. Inside the prefix, so an item write refreshes it. */
  transaction: (id: string) => ['transactions', id] as const,
  /** The server-default window (the current month). */
  transactionsSummary: () => ['transactions', 'summary'] as const,
  /** An explicit window, for the month-grain fan-out. */
  transactionsSummaryWindow: (window: SummaryWindowKey) =>
    ['transactions', 'summary', window] as const,
  /** Raw rows for one window, bucketed client-side into a daily series. */
  transactionsDaily: (window: SummaryWindowKey) => ['transactions', 'daily', window] as const,
};
