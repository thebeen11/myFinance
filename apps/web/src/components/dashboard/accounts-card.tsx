'use client';

import Link from 'next/link';

import type { AccountCurrencyTotalResponse, AccountResponse } from '@/api';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { accountIcon, accountTypeLabel } from '@/lib/account-meta';
import { money } from '@/lib/format';

/**
 * Balances per account, each with a bar showing its share of the total.
 *
 * Every row carries its own balance, so this costs no request of its own. The
 * share bar is computed within a currency, never across them, so a mixed roster
 * still produces meaningful proportions.
 */
export const AccountsCard = ({
  accounts,
  totals,
  isPending,
  className,
}: {
  accounts: readonly AccountResponse[];
  totals: readonly AccountCurrencyTotalResponse[];
  isPending: boolean;
  className?: string;
}) => {
  const totalByCurrency = new Map(
    totals.map((entry) => [entry.currency, Math.abs(entry.totalMinor)]),
  );

  return (
    <Card className={className}>
      <div className="flex h-full flex-col gap-4 px-(--card-spacing)">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs font-medium">Balances</span>
          <h2 className="text-lg font-semibold tracking-tight">Accounts</h2>
        </div>

        {isPending && accounts.length === 0 ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-12 w-full rounded-2xl" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-muted-foreground my-auto py-6 text-center text-sm">
            No accounts yet.{' '}
            <Link href="/accounts" className="text-foreground font-medium underline">
              Add one
            </Link>{' '}
            to start tracking.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {accounts.map((account) => {
              const Icon = accountIcon(account.type);
              const total = totalByCurrency.get(account.currency) ?? 0;
              const share =
                total > 0
                  ? Math.min(100, (Math.abs(account.balance.balanceMinor) / total) * 100)
                  : 0;

              return (
                <li
                  key={account.id}
                  className="hover:bg-muted/60 flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors"
                >
                  <span className="bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-xl">
                    <Icon className="size-4" aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{account.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {accountTypeLabel(account.type)}
                    </p>
                    <div className="bg-muted mt-1.5 h-1 w-full overflow-hidden rounded-full">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </div>

                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {money(account.balance.balanceMinor, account.currency)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
};
