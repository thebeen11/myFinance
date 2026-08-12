'use client';

import type { ReactNode } from 'react';

import { money } from '@/lib/format';

interface TooltipItem {
  readonly color?: string;
  readonly payload?: { fill?: string };
}

const MoneyTooltipRow = ({
  swatch,
  name,
  value,
  currency,
}: {
  swatch: string | undefined;
  name: ReactNode;
  value: number;
  currency: string;
}) => (
  <div className="flex w-full items-center gap-2">
    <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: swatch }} aria-hidden />
    <span className="text-muted-foreground flex-1">{name}</span>
    <span className="font-medium tabular-nums">{money(value, currency)}</span>
  </div>
);

/**
 * Row renderer for `ChartTooltipContent`.
 *
 * Two reasons this exists. First, the stock content renders values with
 * `toLocaleString()`, and our values are integer *minor units* — 1234567 would
 * read as "1,234,567" rather than "Rp 1.234.567". Second, supplying a `formatter`
 * replaces the entire row including the colour swatch, so the swatch has to be
 * rebuilt here.
 *
 * Always full precision: a tooltip is a figure the user is reading deliberately,
 * so `compactMoney` must never appear in one.
 */
export const moneyTooltipRow = (currency: string) => {
  // A named declaration, not an arrow: this is a render callback recharts calls
  // per row, and an anonymous arrow returning JSX reads to the linter as an
  // unnamed component.
  function renderMoneyRow(value: unknown, name: ReactNode, item: TooltipItem): ReactNode {
    return (
      <MoneyTooltipRow
        swatch={item.payload?.fill ?? item.color}
        name={name}
        value={Number(value)}
        currency={currency}
      />
    );
  }

  return renderMoneyRow;
};
