'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import type { TransactionResponse } from '@/api';
import { ListRow, ListRowGroup } from '@/components/shell/list-row';
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
        <ListRowGroup className="flex flex-col gap-0.5 divide-y-0">
          {transactions.map((transaction, index) => (
            <ListRow
              key={transaction.id}
              href={`/transactions/${transaction.id}`}
              className={cn(
                'items-center gap-3 rounded-2xl px-2.5 py-2.5',
                // The lead row is filled rather than outlined — the design marks
                // emphasis with a surface, never a border.
                index === 0 ? 'bg-muted' : 'hover:bg-muted/60 transition-colors',
              )}
              leading={
                /* A receipt has no single category, so the swatch takes the first
                   line's — the same one the list's item summary shows. */
                <span
                  className="size-2.5 rounded-full"
                  style={{
                    background: transaction.items[0]?.category?.color ?? 'var(--muted-foreground)',
                  }}
                  aria-hidden
                />
              }
              title={
                transaction.description ??
                transaction.merchant?.name ??
                transaction.items[0]?.name ??
                'Transaction'
              }
              subtitle={`${dayAndMonth(transaction.occurredAt)} · ${transaction.account.name}`}
              trailing={
                <span className={transaction.type === 'INCOME' ? 'text-income' : 'text-expense'}>
                  {transaction.type === 'INCOME' ? '+' : '−'}
                  {money(transaction.amountMinor, transaction.currency)}
                </span>
              }
            />
          ))}
        </ListRowGroup>
      )}
    </div>
  </Card>
);
