'use client';

import { useId } from 'react';
import { Area, AreaChart, ReferenceLine, XAxis, YAxis } from 'recharts';

import { moneyTooltipRow } from '@/components/charts/chart-tooltip-money';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';

export interface TrendPoint {
  readonly label: string;
  readonly netMinor: number;
}

const config = {
  netMinor: { label: 'Net', color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** Net per month over the last few months. */
export const NetTrendArea = ({
  points,
  currency,
}: {
  points: readonly TrendPoint[];
  currency: string;
}) => {
  // SVG gradient ids are global to the document, so two charts sharing a
  // hardcoded id would both resolve to whichever <defs> mounted last.
  const gradientId = useId();

  return (
    <ChartContainer config={config} className="aspect-auto h-[160px] w-full">
      <AreaChart data={points as TrendPoint[]} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-netMinor)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-netMinor)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tick={{ fontSize: 11 }}
        />
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent formatter={moneyTooltipRow(currency)} />}
        />
        <Area
          type="linear"
          dataKey="netMinor"
          // Net goes negative. Anchoring the fill at zero rather than `dataMin`
          // is what keeps a loss-making month from looking like a gain.
          baseValue={0}
          stroke="var(--color-netMinor)"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
};
