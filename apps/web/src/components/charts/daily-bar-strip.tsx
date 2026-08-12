'use client';

import { Bar, BarChart, XAxis, YAxis } from 'recharts';

import { moneyTooltipRow } from '@/components/charts/chart-tooltip-money';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { DayTotal } from '@/hooks/use-finance-queries';

const config = {
  totalMinor: { label: 'Spent', color: 'var(--chart-2)' },
} satisfies ChartConfig;

/** One bar per day of the month, with a faint track on days that had no spending. */
export const DailyBarStrip = ({
  days,
  currency,
}: {
  days: readonly DayTotal[];
  currency: string;
}) => (
  <ChartContainer config={config} className="aspect-auto h-[110px] w-full">
    <BarChart data={days as DayTotal[]} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
      {/* Without an explicit domain recharts rounds the max upward, so the
          tallest bar never reaches the top of the strip. The `|| 1` guards a
          month with no spending at all, where `dataMax` is 0 and the domain
          would collapse to a single point. */}
      <YAxis hide domain={[0, (dataMax: number) => dataMax || 1]} />
      <XAxis
        dataKey="label"
        tickLine={false}
        axisLine={false}
        interval={6}
        tickMargin={8}
        tick={{ fontSize: 10 }}
      />
      <ChartTooltip
        cursor={false}
        content={
          <ChartTooltipContent
            formatter={moneyTooltipRow(currency)}
            labelFormatter={(_, payload) => `Day ${payload?.[0]?.payload?.label ?? ''}`}
          />
        }
      />
      <Bar
        dataKey="totalMinor"
        fill="var(--color-totalMinor)"
        // `radius` is absolute pixels with no clamp to half the bar width, so a
        // larger value inverts the path once 31 bars are squeezed onto a phone.
        radius={3}
        maxBarSize={14}
        // Zero-spend days would otherwise render nothing at all; the track keeps
        // a slot for every day so the month reads as a continuous strip.
        // `--border`, not `--muted`: the strip sits on a white card, where
        // `--muted` is close enough to white to disappear entirely.
        background={{ fill: 'var(--border)', radius: 3 }}
        isAnimationActive={false}
      />
    </BarChart>
  </ChartContainer>
);
