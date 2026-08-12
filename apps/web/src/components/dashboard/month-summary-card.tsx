'use client';

import type { TransactionsSummaryResponse } from '@/api';
import { MixedCurrencyNotice } from '@/components/dashboard/mixed-currency-notice';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { money } from '@/lib/format';

/** Share of income that was spent. Null when there was no income to divide by. */
const spentShare = (summary: TransactionsSummaryResponse): number | null =>
  summary.incomeMinor === 0 ? null : Math.round((summary.expenseMinor / summary.incomeMinor) * 100);

/**
 * The month in one inverted card at the foot of the rail: what came in, what
 * went out, and what is left.
 */
export const MonthSummaryCard = ({
  summary,
  monthLabel,
  currency,
  isMixedCurrency,
  currencies,
  isPending,
  className,
}: {
  summary: TransactionsSummaryResponse | undefined;
  monthLabel: string;
  currency: string;
  isMixedCurrency: boolean;
  currencies: readonly string[];
  isPending: boolean;
  className?: string;
}) => {
  const share = summary ? spentShare(summary) : null;

  return (
    <Card tone="inverted" className={className}>
      <div className="flex flex-col gap-4 px-(--card-spacing)">
        <div className="flex flex-col gap-0.5">
          <span className="text-inverted-muted text-xs font-medium">{monthLabel}</span>
          <h2 className="text-lg font-semibold tracking-tight">This month</h2>
        </div>

        {isMixedCurrency ? (
          <div className="rounded-2xl bg-white/5 p-3">
            <MixedCurrencyNotice currencies={currencies} />
          </div>
        ) : isPending && !summary ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-11 w-full rounded-full bg-white/10" />
            <Skeleton className="h-11 w-4/5 rounded-full bg-white/10" />
            <Skeleton className="mt-2 h-9 w-2/3 bg-white/10" />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <div className="bg-primary text-primary-foreground flex items-center justify-between gap-3 rounded-full py-2.5 pr-4 pl-4">
                <span className="text-sm font-medium">Income</span>
                <span className="text-sm font-semibold tabular-nums">
                  +{summary ? money(summary.incomeMinor, currency) : '—'}
                </span>
              </div>
              {/* Narrower than the income pill so the two read as a proportion at
                  a glance, the way the reference stacks its payout rows. */}
              <div className="text-foreground mr-6 flex items-center justify-between gap-3 rounded-full bg-white py-2.5 pr-4 pl-4">
                <span className="text-sm font-medium">Spent</span>
                <span className="text-sm font-semibold tabular-nums">
                  −{summary ? money(summary.expenseMinor, currency) : '—'}
                </span>
              </div>
            </div>

            <div className="flex items-end justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-inverted-muted text-xs font-medium">Left over</span>
                <span className="truncate text-2xl font-semibold tracking-tight tabular-nums">
                  {summary ? money(summary.netMinor, currency) : '—'}
                </span>
              </div>
              {share !== null && (
                <div className="shrink-0 text-right">
                  <span className="block text-2xl font-semibold tabular-nums">{share}%</span>
                  <span className="text-inverted-muted text-xs">of income spent</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
};
