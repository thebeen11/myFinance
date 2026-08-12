'use client';

import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { AccountsCard } from '@/components/dashboard/accounts-card';
import { CategoryBreakdownCard } from '@/components/dashboard/category-breakdown-card';
import { MonthFlowCard } from '@/components/dashboard/month-flow-card';
import { MonthSummaryCard } from '@/components/dashboard/month-summary-card';
import { NetTrendCard } from '@/components/dashboard/net-trend-card';
import { NetWorthCard } from '@/components/dashboard/net-worth-card';
import { RecentActivityCard } from '@/components/dashboard/recent-activity-card';
import { PageHeader } from '@/components/shell/page-header';
import { TransactionDialog } from '@/components/transactions/transaction-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  bucketByUtcDay,
  useAccountBalances,
  useAccounts,
  useDisplayCurrency,
  useMe,
  useMerchants,
  useMonthExpenses,
  useMonthlySummaries,
  useTransactions,
} from '@/hooks/use-finance-queries';
import { currentUtcMonth } from '@/lib/date-range';
import { longMonth } from '@/lib/format';

const RECENT_LIMIT = 5;
const TREND_MONTHS = 6;

const greeting = (hour: number): string => {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

export default function DashboardPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  const month = useMemo(() => currentUtcMonth(), []);

  const me = useMe();
  const accounts = useAccounts();
  const merchants = useMerchants();
  const display = useDisplayCurrency();
  const balances = useAccountBalances(accounts.data ?? []);
  const monthly = useMonthlySummaries(TREND_MONTHS);
  const expenses = useMonthExpenses(month);
  const recent = useTransactions({ limit: RECENT_LIMIT, offset: 0 });

  const days = useMemo(
    () => bucketByUtcDay(expenses.data?.rows ?? [], month, display.currency),
    [expenses.data, month, display.currency],
  );

  // A 401 never lands here — the layout redirects first — so a failure really is
  // the API being unreachable.
  if (accounts.isError || monthly.isError || recent.isError) {
    return (
      <Card className="mx-auto max-w-xl">
        <div className="flex flex-col gap-2 px-(--card-spacing)">
          <h1 className="text-lg font-semibold tracking-tight">Cannot reach the API</h1>
          <p className="text-muted-foreground text-sm">
            Start it with <code className="font-mono">pnpm --filter @myfinance/api dev</code> and
            check that <code className="font-mono">DATABASE_URL</code> in{' '}
            <code className="font-mono">apps/api/.env</code> points at your Supabase project.
          </p>
        </div>
      </Card>
    );
  }

  const currencies = [display.currency, ...display.others];
  const name = me.data?.displayName ?? me.data?.email.split('@')[0] ?? '';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Overview"
        title={name ? `${greeting(new Date().getHours())}, ${name}` : 'Overview'}
        actions={
          <>
            <span className="bg-card ring-foreground/8 text-muted-foreground inline-flex h-9 items-center rounded-full px-4 text-sm ring-1">
              {longMonth(month.from)}
            </span>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus data-icon="inline-start" />
              Add transaction
            </Button>
          </>
        }
      />

      {/* Bento on the left, activity rail on the right. The rail belongs to this
          page rather than the shell: beside the transactions table it would be a
          second, redundant list of the same rows. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12">
          <NetWorthCard
            balances={balances}
            accountCount={accounts.data?.length ?? 0}
            className="min-w-0 lg:col-span-5"
          />
          <MonthFlowCard
            summary={monthly.current}
            previous={monthly.previous}
            days={days}
            currency={display.currency}
            isMixedCurrency={display.isMixed}
            currencies={currencies}
            isPending={monthly.isPending}
            className="min-w-0 lg:col-span-7"
          />
          <CategoryBreakdownCard
            byCategory={monthly.current?.byCategory}
            currency={display.currency}
            isMixedCurrency={display.isMixed}
            currencies={currencies}
            isPending={monthly.isPending}
            className="min-w-0 lg:col-span-5"
          />
          <AccountsCard
            accounts={accounts.data ?? []}
            balances={balances}
            isPending={accounts.isPending}
            className="min-w-0 lg:col-span-7"
          />
          <NetTrendCard
            months={monthly.months}
            currency={display.currency}
            isMixedCurrency={display.isMixed}
            currencies={currencies}
            isPending={monthly.isPending}
            className="min-w-0 lg:col-span-12"
          />
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <RecentActivityCard transactions={recent.data?.data ?? []} isPending={recent.isPending} />
          <MonthSummaryCard
            summary={monthly.current}
            monthLabel={longMonth(month.from)}
            currency={display.currency}
            isMixedCurrency={display.isMixed}
            currencies={currencies}
            isPending={monthly.isPending}
          />
        </aside>
      </div>

      <TransactionDialog
        accounts={accounts.data ?? []}
        merchants={merchants.data ?? []}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
