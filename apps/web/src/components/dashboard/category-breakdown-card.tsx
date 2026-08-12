'use client';

import type { CategoryTotalResponse } from '@/api';
import { CategoryDonut, type DonutSlice } from '@/components/charts/category-donut';
import { MixedCurrencyNotice } from '@/components/dashboard/mixed-currency-notice';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { money } from '@/lib/format';

/** Fallback ramp for categories whose `color` is null. */
const FALLBACK_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

const MAX_SLICES = 5;

/**
 * Where the month's money went.
 *
 * `byCategory` interleaves income and expense rows sorted by size, so it has to
 * be filtered to EXPENSE before it means "spending" — an unfiltered feed would
 * quietly plot salary as a spending slice. Anything past the top few categories
 * is folded into "Other" so the arc stays readable.
 */
export const CategoryBreakdownCard = ({
  byCategory,
  currency,
  isMixedCurrency,
  currencies,
  isPending,
  className,
}: {
  byCategory: readonly CategoryTotalResponse[] | undefined;
  currency: string;
  isMixedCurrency: boolean;
  currencies: readonly string[];
  isPending: boolean;
  className?: string;
}) => {
  const expenses = (byCategory ?? [])
    .filter((row) => row.type === 'EXPENSE' && row.totalMinor > 0)
    .sort((a, b) => b.totalMinor - a.totalMinor);

  const head = expenses.slice(0, MAX_SLICES);
  const tail = expenses.slice(MAX_SLICES);
  const tailTotal = tail.reduce((sum, row) => sum + row.totalMinor, 0);

  const slices: DonutSlice[] = [
    ...head.map((row, index) => ({
      name: row.categoryName,
      value: row.totalMinor,
      fill: row.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    })),
    ...(tailTotal > 0
      ? [{ name: `Other (${tail.length})`, value: tailTotal, fill: 'var(--muted-foreground)' }]
      : []),
  ];

  const total = expenses.reduce((sum, row) => sum + row.totalMinor, 0);

  return (
    <Card className={className}>
      <div className="flex h-full min-w-0 flex-col gap-4 px-(--card-spacing)">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs font-medium">This month</span>
          <h2 className="text-lg font-semibold tracking-tight">Where it went</h2>
        </div>

        {isMixedCurrency ? (
          <MixedCurrencyNotice currencies={currencies} />
        ) : isPending && slices.length === 0 ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="aspect-[2/1] w-full rounded-2xl" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : slices.length === 0 ? (
          <p className="text-muted-foreground my-auto py-6 text-center text-sm">
            No spending recorded this month.
          </p>
        ) : (
          <>
            <CategoryDonut
              slices={slices}
              currency={currency}
              centreValue={money(total, currency)}
              centreLabel="Spent this month"
            />

            {/* The legend is a list rather than recharts' own, so each row can
                carry a right-aligned exact figure. */}
            <ul className="flex flex-col gap-2">
              {slices.map((slice) => (
                <li key={slice.name} className="flex items-center gap-2.5 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: slice.fill }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{slice.name}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {money(slice.value, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
};
