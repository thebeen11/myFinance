'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { DEFAULT_CURRENCY } from '@myfinance/shared';

import {
  accountsFindAll,
  accountsFindOne,
  authMe,
  categoriesFindAll,
  merchantsFindAll,
  merchantsFindOne,
  productsFindAll,
  reimbursementsFindOutstanding,
  transactionsFindAll,
  transactionsFindOne,
  transactionsSummarise,
} from '@/api';
import type {
  AccountsFindAllData,
  TransactionResponse,
  TransactionsFindAllData,
  TransactionsSummaryResponse,
} from '@/api';
import { lastUtcMonths, utcDayKey, utcDaysIn, type MonthWindow } from '@/lib/date-range';
import { queryKeys } from '@/lib/query-keys';

/**
 * The signed-in user. `retry: false` matters: a 401 here is the answer, not a
 * failure worth repeating, and the auth guard reads it to decide on redirecting.
 */
export const useMe = () =>
  useQuery({
    queryKey: queryKeys.me(),
    queryFn: async () => (await authMe({ throwOnError: true })).data,
    retry: false,
    staleTime: Infinity,
  });

export type AccountListQuery = NonNullable<AccountsFindAllData['query']>;

/** The window the dashboard reads. Shared so `useDisplayCurrency` hits the same cache entry. */
export const DEFAULT_ACCOUNTS_QUERY: AccountListQuery = { limit: 25, offset: 0 };

/**
 * The window a `<Select>` of accounts reads: the server's `@Max(100)` cap, since
 * a picker cannot page and an account missing from it cannot be posted to.
 */
export const ACCOUNT_PICKER_QUERY: AccountListQuery = { limit: 100, offset: 0 };

/**
 * One page of accounts, each already carrying its balance.
 *
 * Archived rows are excluded unless asked for, and `totalsByCurrency` on the
 * envelope covers the whole set rather than the page — net worth is read from
 * there, never folded out of `data`, or it would under-count past page one.
 */
export const useAccounts = (query: AccountListQuery = DEFAULT_ACCOUNTS_QUERY) =>
  useQuery({
    queryKey: queryKeys.accounts(query),
    queryFn: async () => (await accountsFindAll({ query, throwOnError: true })).data,
  });

/**
 * One account, archived or not.
 *
 * Its own request rather than a lookup in `useAccounts`: an account's page must
 * render an archived account too, and picking a row out of a list the API has
 * already filtered would 404 on exactly the rows that page exists to show.
 */
export const useAccount = (id: string) =>
  useQuery({
    queryKey: queryKeys.account(id),
    queryFn: async () => (await accountsFindOne({ path: { id }, throwOnError: true })).data,
    enabled: id !== '',
  });

export const useCategories = () =>
  useQuery({
    queryKey: queryKeys.categories(),
    queryFn: async () => (await categoriesFindAll({ throwOnError: true })).data,
  });

/** Every merchant, unpaginated — the API returns the whole set, ordered by name. */
export const useMerchants = () =>
  useQuery({
    queryKey: queryKeys.merchants(),
    queryFn: async () => (await merchantsFindAll({ throwOnError: true })).data,
  });

/**
 * One merchant by id.
 *
 * Fetched on its own rather than picked out of `useMerchants`, so the detail page
 * can title itself without pulling the whole list, and so a stale id resolves to
 * a real 404 instead of silently rendering an empty page.
 */
export const useMerchant = (merchantId: string) =>
  useQuery({
    queryKey: queryKeys.merchant(merchantId),
    queryFn: async () =>
      (await merchantsFindOne({ path: { id: merchantId }, throwOnError: true })).data,
    enabled: merchantId.length > 0,
  });

/** One merchant's catalogue, unpaginated and ordered by code, as the API returns it. */
export const useProducts = (merchantId: string) =>
  useQuery({
    queryKey: queryKeys.products(merchantId),
    queryFn: async () =>
      (await productsFindAll({ query: { merchantId }, throwOnError: true })).data,
    enabled: merchantId.length > 0,
  });

/**
 * One receipt with its line items.
 *
 * Fetched on its own rather than picked out of `useTransactions`, for the same
 * reasons as `useMerchant`: the detail page should not depend on the list having
 * been visited, and a stale id must resolve to a real 404 rather than an empty page.
 */
/**
 * Every share one account still owes another, across every receipt.
 *
 * The one dashboard figure that is *not* composed client-side: the split is derived
 * per receipt from its lines and prorated charges, so folding it in the browser
 * would mean paging the whole history and reimplementing the arithmetic.
 */
export const useOutstandingReimbursements = () =>
  useQuery({
    queryKey: queryKeys.reimbursementsOutstanding(),
    queryFn: async () => (await reimbursementsFindOutstanding({ throwOnError: true })).data,
  });

export const useTransaction = (id: string) =>
  useQuery({
    queryKey: queryKeys.transaction(id),
    queryFn: async () => (await transactionsFindOne({ path: { id }, throwOnError: true })).data,
    enabled: id.length > 0,
  });

export const useTransactions = (query: TransactionsFindAllData['query']) =>
  useQuery({
    queryKey: queryKeys.transactions(query),
    queryFn: async () => (await transactionsFindAll({ query, throwOnError: true })).data,
    placeholderData: (previous) => previous,
  });

/** Income/expense/net plus the per-category breakdown. Defaults to the server's current month. */
export const useTransactionsSummary = (window?: MonthWindow) =>
  useQuery({
    queryKey: window
      ? queryKeys.transactionsSummaryWindow({ from: window.from, to: window.to })
      : queryKeys.transactionsSummary(),
    queryFn: async () =>
      (
        await transactionsSummarise({
          query: window ? { from: window.from, to: window.to } : {},
          throwOnError: true,
        })
      ).data,
  });

export interface MonthlySummary {
  readonly window: MonthWindow;
  readonly data: TransactionsSummaryResponse | undefined;
}

export interface MonthlySummaries {
  /** Oldest first. */
  readonly months: MonthlySummary[];
  readonly current: TransactionsSummaryResponse | undefined;
  readonly previous: TransactionsSummaryResponse | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
}

/**
 * Month-grain summaries, oldest last. One `/transactions/summary` call per month.
 *
 * The fan-out is cheap because the server does the aggregation: each response is
 * a handful of numbers regardless of how many transactions the month holds.
 * Fetching raw rows instead would mean paging hundreds of records to compute six
 * figures. It also pays for itself three times over — the trend chart, the
 * current-month category breakdown and the month-over-month deltas all read from
 * this one hook rather than issuing their own requests.
 */
export const useMonthlySummaries = (monthCount: number): MonthlySummaries => {
  // `lastUtcMonths` calls `new Date()`, so without this the array identity
  // changes every render and `combine` can never memoize.
  const windows = useMemo(() => lastUtcMonths(monthCount), [monthCount]);

  return useQueries({
    queries: windows.map((window, index) => ({
      queryKey: queryKeys.transactionsSummaryWindow({ from: window.from, to: window.to }),
      queryFn: async () =>
        (
          await transactionsSummarise({
            query: { from: window.from, to: window.to },
            throwOnError: true,
          })
        ).data,
      // A closed month only changes if a transaction is retro-dated, and the
      // mutations' broad `['transactions']` invalidation already covers that —
      // invalidation overrides staleTime. Only the open month polls.
      staleTime: index === windows.length - 1 ? undefined : Infinity,
    })),
    combine: (results) => ({
      months: results.map((result, index) => ({
        window: windows[index],
        data: result.data,
      })),
      current: results[results.length - 1]?.data,
      previous: results[results.length - 2]?.data,
      isPending: results.some((result) => result.isPending),
      isError: results.some((result) => result.isError),
    }),
  });
};

export interface DisplayCurrency {
  /** The currency most accounts are denominated in. */
  readonly currency: string;
  /** True when accounts span more than one currency. */
  readonly isMixed: boolean;
  readonly others: string[];
}

/**
 * Which currency the page should speak in.
 *
 * This matters more than it looks: `/transactions/summary` groups by category
 * and type but *not* by currency, so under mixed currencies it adds IDR and USD
 * minor units into one integer. Nothing in the system holds an FX rate, so the
 * only honest response is to label figures with a single currency and refuse to
 * present cross-currency aggregates as money. `isMixed` is what gates that.
 */
export const useDisplayCurrency = (): DisplayCurrency => {
  const accounts = useAccounts();
  const totals = accounts.data?.totalsByCurrency;

  return useMemo(() => {
    // Ranked over every account, not just the page: `totalsByCurrency` is rolled
    // up server-side, so paging the list cannot change which currency wins.
    const ranked = [...(totals ?? [])].sort((a, b) => b.accountCount - a.accountCount);

    return {
      currency: ranked[0]?.currency ?? DEFAULT_CURRENCY,
      isMixed: ranked.length > 1,
      others: ranked.slice(1).map((entry) => entry.currency),
    };
  }, [totals]);
};

/** Server cap: `limit` is validated `@Max(100)`. */
const TX_PAGE_SIZE = 100;
/** 1_200 rows. Past this we report truncation rather than page forever. */
const MAX_PAGES = 12;

export interface MonthExpenses {
  readonly rows: TransactionResponse[];
  readonly total: number;
  readonly truncated: boolean;
}

/**
 * Every expense in one UTC month, paged inside a single `queryFn`.
 *
 * Deliberately *not* a fan-out: bucketing a month into days via the summary
 * endpoint would take 28-31 requests for one 120px strip, and each refetch would
 * repeat them. Fetching the rows is one cache entry, one loading state, and one
 * retry unit — and because `TransactionResponse` carries `currency` per row, it
 * is also the only path that can filter a daily series by display currency,
 * which `/transactions/summary` structurally cannot do.
 */
export const useMonthExpenses = (window: MonthWindow) =>
  useQuery({
    queryKey: queryKeys.transactionsDaily({ from: window.from, to: window.to }),
    queryFn: async (): Promise<MonthExpenses> => {
      const rows: TransactionResponse[] = [];
      let offset = 0;
      let total = 0;

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const { data } = await transactionsFindAll({
          query: {
            from: window.from,
            to: window.to,
            type: 'EXPENSE',
            limit: TX_PAGE_SIZE,
            offset,
          },
          throwOnError: true,
        });

        rows.push(...data.data);
        total = data.total;
        offset += data.data.length;

        if (data.data.length === 0 || offset >= total) break;
      }

      return { rows, total, truncated: rows.length < total };
    },
  });

export interface DayTotal {
  /** `YYYY-MM-DD`. */
  readonly day: string;
  /** Day of month, for the axis. */
  readonly label: number;
  readonly totalMinor: number;
}

/**
 * Sum expenses into one bucket per UTC day, including days with no activity so
 * the bar strip keeps a slot for every day of the month.
 *
 * Pass `currency` to keep a mixed-currency account set from adding unlike minor
 * units together.
 */
export const bucketByUtcDay = (
  rows: readonly TransactionResponse[],
  window: MonthWindow,
  currency?: string,
): DayTotal[] => {
  const totals = new Map(utcDaysIn(window).map((day) => [day, 0]));

  for (const row of rows) {
    if (currency && row.currency !== currency) continue;
    const day = utcDayKey(row.occurredAt);
    const running = totals.get(day);
    if (running !== undefined) totals.set(day, running + row.amountMinor);
  }

  return [...totals].map(([day, totalMinor]) => ({
    day,
    label: Number(day.slice(8)),
    totalMinor,
  }));
};
