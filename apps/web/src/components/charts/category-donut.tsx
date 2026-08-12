'use client';

import { useId } from 'react';
import { Cell, Pie, PieChart } from 'recharts';

import { moneyTooltipRow } from '@/components/charts/chart-tooltip-money';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';

export interface DonutSlice {
  readonly name: string;
  readonly value: number;
  readonly fill: string;
}

/**
 * Half donut, sweeping the top half.
 *
 * The geometry needs a note: recharts derives its radius from
 * `min(plotWidth, plotHeight) / 2`, so a half-donut drawn into a 2:1 box would
 * only fill a quarter of the width. The fix is to render into a *square* and clip
 * the empty lower half with the wrapper's `overflow-hidden`, which keeps the arc
 * fluid at any width.
 *
 * The centred figure is HTML rather than an SVG `<Label>` so it uses the real
 * font stack, is selectable, and can be formatted with `money`.
 */
export const CategoryDonut = ({
  slices,
  currency,
  centreValue,
  centreLabel,
}: {
  slices: readonly DonutSlice[];
  currency: string;
  centreValue: string;
  centreLabel: string;
}) => {
  const chartId = useId();

  const config: ChartConfig = Object.fromEntries(
    slices.map((slice) => [slice.name, { label: slice.name, color: slice.fill }]),
  );

  return (
    <div className="relative aspect-[2/1] w-full min-w-0 overflow-hidden">
      <ChartContainer
        id={chartId}
        config={config}
        // `aspect-auto` is required alongside an explicit size: tailwind-merge
        // treats `aspect-*` and `h-*` as different groups, so ChartContainer's
        // own `aspect-video` would otherwise survive and fight the height.
        className="absolute inset-x-0 top-0 aspect-square w-full"
      >
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent hideLabel nameKey="name" formatter={moneyTooltipRow(currency)} />
            }
          />
          <Pie
            data={slices as DonutSlice[]}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            startAngle={180}
            endAngle={0}
            innerRadius="60%"
            outerRadius="92%"
            cornerRadius={6}
            paddingAngle={1.5}
            stroke="none"
            isAnimationActive={false}
          >
            {/* The tooltip swatch reads `payload.fill`, so the colour has to be
                on the Cell — setting it on <Pie> leaves the dot uncoloured. */}
            {slices.map((slice) => (
              <Cell key={slice.name} fill={slice.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{centreValue}</span>
        <span className="text-muted-foreground text-xs">{centreLabel}</span>
      </div>
    </div>
  );
};
