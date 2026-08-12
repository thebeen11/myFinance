import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Which direction of change counts as a good outcome for this measure. */
export type DeltaPolarity = 'up-is-good' | 'down-is-good' | 'neutral';

const TONES = {
  default: {
    good: 'bg-income/10 text-income',
    bad: 'bg-expense/10 text-expense',
    flat: 'bg-muted text-muted-foreground',
  },
  inverted: {
    good: 'bg-primary/20 text-primary',
    bad: 'bg-expense/25 text-white',
    flat: 'bg-white/10 text-inverted-muted',
  },
} as const;

/**
 * A `+12.4% ↑` chip.
 *
 * The sign and the arrow are always rendered, never implied by the colour —
 * income and expense must stay distinguishable without relying on hue.
 * `polarity` exists because a rise is good for income and bad for spending, so
 * the caller declares the meaning rather than the component guessing it.
 */
export const DeltaPill = ({
  percent,
  polarity = 'up-is-good',
  tone = 'default',
  className,
}: {
  /** Null when there is no comparable prior period. */
  percent: number | null;
  polarity?: DeltaPolarity;
  tone?: keyof typeof TONES;
  className?: string;
}) => {
  if (percent === null || !Number.isFinite(percent)) return null;

  const rounded = Math.round(percent * 10) / 10;
  const isUp = rounded > 0;
  const isFlat = rounded === 0;

  const intent = isFlat
    ? 'flat'
    : polarity === 'neutral'
      ? 'flat'
      : (polarity === 'up-is-good') === isUp
        ? 'good'
        : 'bad';

  const Arrow = isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        TONES[tone][intent],
        className,
      )}
    >
      {isUp ? '+' : rounded < 0 ? '−' : ''}
      {Math.abs(rounded)}%{!isFlat && <Arrow className="size-3" aria-hidden />}
    </span>
  );
};

/**
 * Percentage change between two periods.
 *
 * Returns null when the prior period is zero — "up from nothing" has no
 * meaningful percentage, and rendering ∞ or 100% would both be lies.
 */
export const percentChange = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
};
