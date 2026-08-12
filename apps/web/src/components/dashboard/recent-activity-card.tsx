'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import type { TransactionResponse } from '@/api';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { dayAndMonth, money } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The activity rail.
 *
 * Amounts carry an explicit `+` / `−` as well as a colour: income and expense
 * must stay distinguishable for someone who cannot separate the two hues, and
 * this design's brand green is already spoken for elsewhere.
 */
export const RecentActivityCard = ({
  transactions,
  isPending,
  className,
}: {
  transactions: readonly TransactionResponse[];
  isPending: boolean;
  className?: string;
}) => (
  <Card className={className}>
    <div className="flex flex-col gap-4 px-(--card-spacing)">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs font-medium">Latest</span>
          <h2 className="text-lg font-semibold tracking-tight">Recent activity</h2>
        </div>
        <Link
          href="/transactions"
          className="text-muted-foreground hover:text-foreground bg-muted flex size-8 items-center justify-center rounded-full transition-colors"
          aria-label="View all transactions"
        >
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      {isPending && transactions.length === 0 ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-12 w-full rounded-2xl" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">Nothing recorded yet.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {transactions.map((transaction, index) => (
            <li
              key={transaction.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl px-2.5 py-2.5',
                // The lead row is filled rather than outlined — the design marks
                // emphasis with a surface, never a border.
                index === 0 ? 'bg-muted' : 'hover:bg-muted/60 transition-colors',
              )}
            >
              {/* A receipt has no single category, so the swatch takes the first
                  line's — the same one the list's item summary shows. */}
              <span
                className="mt-0.5 size-2.5 shrink-0 rounded-full"
                style={{
                  background: transaction.items[0]?.category?.color ?? 'var(--muted-foreground)',
                }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {transaction.description ??
                    transaction.merchant?.name ??
                    transaction.items[0]?.name ??
                    'Transaction'}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {dayAndMonth(transaction.occurredAt)} · {transaction.account.name}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 text-sm font-semibold tabular-nums',
                  transaction.type === 'INCOME' ? 'text-income' : 'text-expense',
                )}
              >
                {transaction.type === 'INCOME' ? '+' : '−'}
                {money(transaction.amountMinor, transaction.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  </Card>
);
