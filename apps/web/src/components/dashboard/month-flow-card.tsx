'use client';

import type { TransactionsSummaryResponse } from '@/api';
import { DailyBarStrip } from '@/components/charts/daily-bar-strip';
import { MixedCurrencyNotice } from '@/components/dashboard/mixed-currency-notice';
import { DeltaPill, percentChange } from '@/components/shell/delta-pill';
import { StatTile } from '@/components/shell/stat-tile';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DayTotal } from '@/hooks/use-finance-queries';
import { money } from '@/lib/format';

/**
 * The month's flow: net at the top, income and expense as nested tiles, and the
 * daily spend strip underneath.
 *
 * The nested tiles invert against the card they sit in — that contrast is how
 * this design expresses depth, in place of a shadow.
 */
export const MonthFlowCard = ({
  summary,
  previous,
  days,
  currency,
  isMixedCurrency,
  currencies,
  isPending,
  className,
}: {
  summary: TransactionsSummaryResponse | undefined;
  previous: TransactionsSummaryResponse | undefined;
  days: readonly DayTotal[];
  currency: string;
  isMixedCurrency: boolean;
  currencies: readonly string[];
  isPending: boolean;
  className?: string;
}) => (
  <Card className={className}>
    <div className="flex h-full flex-col gap-5 px-(--card-spacing)">
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs font-medium">Net this month</span>
        {isMixedCurrency ? (
          <MixedCurrencyNotice currencies={currencies} />
        ) : isPending && !summary ? (
          <Skeleton className="mt-1 h-9 w-40" />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {summary ? money(summary.netMinor, currency) : '—'}
            </span>
            {summary && previous ? (
              <DeltaPill percent={percentChange(summary.netMinor, previous.netMinor)} />
            ) : null}
          </div>
        )}
      </div>

      {!isMixedCurrency && (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile
            tone="inverted"
            size="md"
            className="p-4"
            label="Income"
            value={summary ? `+${money(summary.incomeMinor, currency)}` : '—'}
            trailing={
              summary && previous ? (
                <DeltaPill
                  tone="inverted"
                  percent={percentChange(summary.incomeMinor, previous.incomeMinor)}
                  polarity="up-is-good"
                />
              ) : null
            }
          />
          <StatTile
            tone="default"
            size="md"
            className="p-4"
            label="Spent"
            value={summary ? `−${money(summary.expenseMinor, currency)}` : '—'}
            trailing={
              summary && previous ? (
                <DeltaPill
                  percent={percentChange(summary.expenseMinor, previous.expenseMinor)}
                  polarity="down-is-good"
                />
              ) : null
            }
          />
        </div>
      )}

      <div className="mt-auto min-w-0">
        <p className="text-muted-foreground mb-1 text-xs font-medium">Daily spend</p>
        <DailyBarStrip days={days} currency={currency} />
      </div>
    </div>
  </Card>
);
