'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { transactionsRemove } from '@/api';
import type { TransactionResponse } from '@/api';
import { ListRow, ListRowGroup, ListState, type ListStatus } from '@/components/shell/list-row';
import { PageHeader } from '@/components/shell/page-header';
import { StatTile } from '@/components/shell/stat-tile';
import { TransactionDialog } from '@/components/transactions/transaction-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAccount, useMerchants, useTransactions } from '@/hooks/use-finance-queries';
import { accountTypeLabel } from '@/lib/account-meta';
import { money, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

/**
 * One account's own page: what it holds, and everything posted to it.
 *
 * This is where income is recorded. Income has no receipt to itemise — it is a
 * single amount that belongs to an account — so it is entered here in full and is
 * finished on save, rather than being filed through the receipt flow an expense
 * needs. That is why the two actions are separate buttons instead of one "add"
 * that asks which direction afterwards.
 */
export default function AccountDetailPage() {
  // Every page here is a client component, so the route param comes from
  // `useParams` — the server `params` object is a promise in this Next version.
  const params = useParams<{ id: string }>();
  const accountId = params.id;

  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<TransactionResponse | undefined>(undefined);
  const [dialogType, setDialogType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TransactionResponse | undefined>(undefined);

  const queryClient = useQueryClient();
  // One request, not two: `AccountResponse` carries its own balance now, so the
  // account and its money arrive together.
  const account = useAccount(accountId);
  const balance = account.data?.balance;
  const merchants = useMerchants();
  // No hook of its own: `useTransactions` forwards the whole query object, and the
  // API already indexes ([accountId, occurredAt]) for exactly this read.
  const transactions = useTransactions({ accountId, limit: PAGE_SIZE, offset });

  const rows = transactions.data?.data ?? [];
  const total = transactions.data?.total ?? 0;

  const removal = useMutation({
    mutationFn: (id: string) => transactionsRemove({ path: { id }, throwOnError: true }),
    onSuccess: async () => {
      // Broad prefixes on purpose: deleting a row moves this account's balance and
      // every summary the dashboard derives from it.
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('Transaction deleted');
      setPendingDelete(undefined);
    },
    onError: () => toast.error('Could not delete the transaction'),
  });

  const openDialog = (type: 'INCOME' | 'EXPENSE', transaction?: TransactionResponse): void => {
    setEditing(transaction);
    setDialogType(type);
    setDialogOpen(true);
  };

  const status: ListStatus = transactions.isPending
    ? 'pending'
    : transactions.isError
      ? 'error'
      : rows.length === 0
        ? 'empty'
        : 'ready';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrowClassName="hidden md:block"
        eyebrow={
          <Link
            href="/accounts"
            className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Accounts
          </Link>
        }
        title={account.data?.name ?? 'Account'}
        actions={
          <>
            <Button variant="outline" onClick={() => openDialog('INCOME')}>
              <Plus data-icon="inline-start" />
              Add income
            </Button>
            <Button onClick={() => openDialog('EXPENSE')}>
              <Minus data-icon="inline-start" />
              Add expense
            </Button>
          </>
        }
      />

      <Card tone="inverted" className="grid gap-5 px-(--card-spacing) sm:grid-cols-3">
        <StatTile
          tone="inverted"
          size="lg"
          label={
            account.data
              ? `${accountTypeLabel(account.data.type)} · ${account.data.currency}`
              : 'Balance'
          }
          value={
            account.isPending ? (
              <Skeleton className="h-9 w-40" />
            ) : balance ? (
              money(balance.balanceMinor, balance.currency)
            ) : (
              '—'
            )
          }
        />
        <StatTile
          tone="inverted"
          label="Income, all time"
          value={balance ? `+${money(balance.incomeMinor, balance.currency)}` : '—'}
        />
        <StatTile
          tone="inverted"
          label="Expense, all time"
          value={balance ? `−${money(balance.expenseMinor, balance.currency)}` : '—'}
        />
      </Card>

      <Card className="[--card-spacing:0px] py-0">
        {status === 'ready' ? (
          <>
            <ListRowGroup className="md:hidden">
              {rows.map((transaction) => {
                const isIncome = transaction.type === 'INCOME';
                const category = isIncome ? transaction.category : transaction.items[0]?.category;

                return (
                  <ListRow
                    key={transaction.id}
                    href={`/transactions/${transaction.id}`}
                    leading={
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: category?.color ?? 'var(--muted-foreground)' }}
                        aria-hidden
                      />
                    }
                    title={transaction.description ?? transaction.merchant?.name ?? 'Transaction'}
                    subtitle={`${shortDate(transaction.occurredAt)} · ${
                      category?.name ?? 'Not itemised'
                    }`}
                    trailing={
                      /* The sign is spelled out, never left to colour alone — this
                         has to stay readable outdoors in daylight. */
                      <span className={isIncome ? 'text-income' : 'text-expense'}>
                        {isIncome ? '+' : '−'}
                        {money(transaction.amountMinor, transaction.currency)}
                      </span>
                    }
                    actions={
                      <>
                        <DropdownMenuItem
                          onSelect={() => openDialog(transaction.type, transaction)}
                        >
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setPendingDelete(transaction)}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </>
                    }
                  />
                );
              })}
            </ListRowGroup>

            <Table className="hidden md:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-24 pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((transaction) => {
                  const isIncome = transaction.type === 'INCOME';
                  // Income carries its category on the row itself; an expense is
                  // classified line by line, so it can only show its first line's.
                  const category = isIncome ? transaction.category : transaction.items[0]?.category;

                  return (
                    <TableRow key={transaction.id} className="hover:bg-muted/50">
                      <TableCell className="text-muted-foreground pl-5 whitespace-nowrap">
                        {shortDate(transaction.occurredAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link
                          href={`/transactions/${transaction.id}`}
                          className="hover:underline focus-visible:underline focus-visible:outline-none"
                        >
                          {transaction.description ?? transaction.merchant?.name ?? 'Transaction'}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {category ? (
                          <span className="flex items-center gap-2">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ background: category.color ?? 'var(--muted-foreground)' }}
                              aria-hidden
                            />
                            <span className="truncate">{category.name}</span>
                            {!isIncome && transaction.items.length > 1 ? (
                              <span className="text-muted-foreground shrink-0 text-xs">
                                +{transaction.items.length - 1}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Not itemised</span>
                        )}
                      </TableCell>
                      {/* The sign is spelled out, never left to colour alone — this has
                          to stay readable outdoors in daylight. */}
                      <TableCell
                        className={cn(
                          'text-right font-semibold tabular-nums',
                          isIncome ? 'text-income' : 'text-expense',
                        )}
                      >
                        {isIncome ? '+' : '−'}
                        {money(transaction.amountMinor, transaction.currency)}
                      </TableCell>
                      <TableCell className="pr-5 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${transaction.description ?? 'transaction'}`}
                          onClick={() => openDialog(transaction.type, transaction)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${transaction.description ?? 'transaction'}`}
                          onClick={() => setPendingDelete(transaction)}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        ) : (
          <ListState
            status={status}
            rows={6}
            title={status === 'error' ? 'Cannot reach the API' : 'Nothing posted here yet'}
            description={
              status === 'error'
                ? "This account's transactions could not be loaded."
                : 'Add income to record money arriving, or an expense to record it leaving.'
            }
          />
        )}
      </Card>

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm tabular-nums">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {account.data ? (
        <TransactionDialog
          accounts={[account.data]}
          merchants={merchants.data ?? []}
          transaction={editing}
          lockedAccount={account.data}
          lockedType={dialogType}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      ) : null}

      <AlertDialog
        open={pendingDelete !== undefined}
        onOpenChange={(open) => !open && setPendingDelete(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.description ?? 'Transaction'} — ${money(
                    pendingDelete.amountMinor,
                    pendingDelete.currency,
                  )}. This cannot be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removal.isPending}
              onClick={() => pendingDelete && removal.mutate(pendingDelete.id)}
            >
              {removal.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
