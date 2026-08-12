'use client';

import { NetTrendArea, type TrendPoint } from '@/components/charts/net-trend-area';
import { MixedCurrencyNotice } from '@/components/dashboard/mixed-currency-notice';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { MonthlySummary } from '@/hooks/use-finance-queries';
import { shortMonth } from '@/lib/format';

/** Net per month over the window, oldest first. */
export const NetTrendCard = ({
  months,
  currency,
  isMixedCurrency,
  currencies,
  isPending,
  className,
}: {
  months: readonly MonthlySummary[];
  currency: string;
  isMixedCurrency: boolean;
  currencies: readonly string[];
  isPending: boolean;
  className?: string;
}) => {
  const points: TrendPoint[] = months
    .filter((month) => month.data !== undefined)
    .map((month) => ({
      label: shortMonth(month.window.from),
      netMinor: month.data?.netMinor ?? 0,
    }));

  return (
    <Card className={className}>
      <div className="flex min-w-0 flex-col gap-4 px-(--card-spacing)">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs font-medium">
            Last {months.length} months
          </span>
          <h2 className="text-lg font-semibold tracking-tight">Net trend</h2>
        </div>

        {isMixedCurrency ? (
          <MixedCurrencyNotice currencies={currencies} />
        ) : isPending && points.length === 0 ? (
          <Skeleton className="h-[160px] w-full rounded-2xl" />
        ) : points.length < 2 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            Not enough history yet — a trend needs at least two months.
          </p>
        ) : (
          <NetTrendArea points={points} currency={currency} />
        )}
      </div>
    </Card>
  );
};
