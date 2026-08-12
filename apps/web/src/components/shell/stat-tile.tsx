import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

const TONES = {
  default: 'bg-card ring-1 ring-foreground/8',
  inverted: 'bg-inverted text-inverted-foreground',
  brand: 'bg-primary text-primary-foreground',
  plain: '',
} as const;

const LABEL_TONES = {
  default: 'text-muted-foreground',
  inverted: 'text-inverted-muted',
  brand: 'text-primary-foreground/75',
  plain: 'text-muted-foreground',
} as const;

const SIZES = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-3xl',
  xl: 'text-4xl',
} as const;

/**
 * The two-tier block this design is built on: a small muted label above a large
 * tight-tracked figure. Used everywhere a number needs a name.
 */
export const StatTile = ({
  label,
  value,
  tone = 'plain',
  size = 'md',
  icon,
  trailing,
  footer,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: keyof typeof TONES;
  size?: keyof typeof SIZES;
  icon?: ReactNode;
  /** Sits on the label row, right-aligned — a delta pill, usually. */
  trailing?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) => (
  <div className={cn('flex flex-col gap-1 rounded-2xl', TONES[tone], className)}>
    <div className="flex items-center gap-2">
      {icon}
      <span className={cn('text-xs font-medium', LABEL_TONES[tone])}>{label}</span>
      {trailing ? <span className="ml-auto">{trailing}</span> : null}
    </div>
    {/* tabular-nums so a changing figure never reflows its own width. */}
    <span className={cn('font-semibold tracking-tight tabular-nums', SIZES[size])}>{value}</span>
    {footer ? <div className={cn('text-xs', LABEL_TONES[tone])}>{footer}</div> : null}
  </div>
);
