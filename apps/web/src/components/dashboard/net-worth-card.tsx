'use client';

import type { AccountCurrencyTotalResponse } from '@/api';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { money } from '@/lib/format';

/**
 * Total held across every account, on the inverted surface — the page's single
 * most important figure.
 *
 * Balances are grouped by currency and never summed across them. With one
 * currency (the ordinary case) that is a single headline; with several it is one
 * headline per currency stacked, because there is no exchange rate anywhere in
 * the system that could reduce them to one number.
 *
 * `totals` comes off the account list's envelope, rolled up server-side over
 * every account. It is deliberately not folded out of the rows on screen: the
 * list is paged, so that would quietly report page one as the whole net worth.
 */
export const NetWorthCard = ({
  totals,
  accountCount,
  isPending,
  className,
}: {
  totals: readonly AccountCurrencyTotalResponse[];
  accountCount: number;
  isPending: boolean;
  className?: string;
}) => {
  const [primary, ...others] = totals;

  return (
    <Card tone="inverted" className={className}>
      <div className="flex h-full flex-col justify-between gap-6 px-(--card-spacing)">
        <div className="flex flex-col gap-1">
          <span className="text-inverted-muted text-xs font-medium">Total balance</span>

          {isPending && !primary ? (
            <Skeleton className="mt-1 h-10 w-48 bg-white/10" />
          ) : primary ? (
            <>
              <span className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
                {money(primary.totalMinor, primary.currency)}
              </span>
              {others.length > 0 && (
                <div className="text-inverted-muted mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums">
                  {others.map((entry) => (
                    <span key={entry.currency}>{money(entry.totalMinor, entry.currency)}</span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <span className="text-3xl font-semibold tracking-tight">—</span>
          )}
        </div>

        <p className="text-inverted-muted text-sm">
          {accountCount === 0
            ? 'No accounts yet.'
            : `Across ${accountCount} ${accountCount === 1 ? 'account' : 'accounts'}`}
          {others.length > 0 && ' · not converted between currencies'}
        </p>
      </div>
    </Card>
  );
};
