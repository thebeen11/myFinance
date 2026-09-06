'use client';

import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface ListRowProps {
  /** Makes the whole row one tap target. Omit where the row has no detail page. */
  href?: string;
  /** A colour swatch or a glyph, in a fixed-width slot so the titles line up. */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Badges under the subtitle. */
  meta?: ReactNode;
  /** The figure. Right-aligned and never truncated — PRODUCT.md §4. */
  trailing?: ReactNode;
  /** A full-width row beneath the text, for a control that needs a real target. */
  footer?: ReactNode;
  /** `DropdownMenuItem`s, reached through one overflow button. */
  actions?: ReactNode;
  /** Archived rows read back. */
  isMuted?: boolean;
  className?: string;
}

/**
 * One tappable row of a list — the mobile face of a table row.
 *
 * Extracted from the two dashboard cards that already had this shape, and used by
 * every list page below `md`. It abstracts the row *chrome* — target, padding,
 * divider, the truncating title stack, the money slot, the actions affordance —
 * and deliberately not the columns: seven tables' columns change for seven
 * unrelated reasons, and a card needs a hierarchy (primary / secondary / figure)
 * that a flat column list cannot express.
 *
 * `href` is applied as a stretched pseudo-element rather than by wrapping the
 * row, so the whole row navigates while the footer control and the overflow menu
 * stay independently clickable — nesting a button inside an anchor is invalid
 * HTML and swallows the tap.
 */
export const ListRow = ({
  href,
  leading,
  title,
  subtitle,
  meta,
  trailing,
  footer,
  actions,
  isMuted,
  className,
}: ListRowProps) => (
  <li
    className={cn(
      // `items-start`, not `items-center`: a row can run to three lines, and the
      // swatch and the figure belong beside the title rather than floating to the
      // middle of the block.
      'relative flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 transition-colors',
      href && 'hover:bg-muted/50 active:bg-muted',
      isMuted && 'text-muted-foreground',
      className,
    )}
  >
    {leading ? (
      <span className="flex h-5 w-4 shrink-0 items-center justify-center">{leading}</span>
    ) : null}

    <div className="min-w-0 flex-1">
      {href ? (
        <Link
          href={href}
          className="focus-visible:ring-ring/50 rounded-sm outline-none after:absolute after:inset-0 focus-visible:ring-3"
        >
          <span className="block truncate text-sm font-medium">{title}</span>
        </Link>
      ) : (
        <span className="block truncate text-sm font-medium">{title}</span>
      )}

      {subtitle ? <p className="text-muted-foreground truncate text-xs">{subtitle}</p> : null}
      {meta ? <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{meta}</div> : null}
    </div>

    {trailing ? (
      <div className="shrink-0 py-0.5 text-right text-sm font-semibold tabular-nums">
        {trailing}
      </div>
    ) : null}

    {actions ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* `relative` lifts it out from under the stretched link. One 44px
              target instead of three 32px ones, and the items get real names
              rather than an icon the reader has to guess at. */}
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground relative -mt-1 -mr-2 shrink-0"
          >
            <MoreHorizontal />
            <span className="sr-only">More actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">{actions}</DropdownMenuContent>
      </DropdownMenu>
    ) : null}

    {footer ? <div className="relative w-full">{footer}</div> : null}
  </li>
);

/** The list itself. Hairlines between rows, none above the first or below the last. */
export const ListRowGroup = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => <ul className={cn('divide-border divide-y', className)}>{children}</ul>;

export type ListStatus = 'pending' | 'error' | 'empty' | 'ready';

/**
 * What a list shows when it has no rows to show.
 *
 * Hoisted out of the table so the phone and the desktop share one copy — these
 * used to live inside a `<TableCell colSpan={7}>`, which meant the card list
 * would have needed its own second copy of every skeleton and every empty state.
 */
export const ListState = ({
  status,
  title,
  description,
  rows = 5,
}: {
  status: Exclude<ListStatus, 'ready'>;
  title: string;
  description: string;
  rows?: number;
}) =>
  status === 'pending' ? (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full rounded-xl" />
      ))}
    </div>
  ) : (
    <div className="px-6 py-14 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground mt-1 text-sm text-balance">{description}</p>
    </div>
  );
