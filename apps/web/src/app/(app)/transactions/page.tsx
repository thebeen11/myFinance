'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { transactionsRemove } from '@/api';
import type { TransactionResponse, TransactionsFindAllData } from '@/api';
import { PageHeader } from '@/components/shell/page-header';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useAccounts,
  useCategories,
  useMerchants,
  useTransactions,
} from '@/hooks/use-finance-queries';
import { lastUtcMonths } from '@/lib/date-range';
import { longMonth, money, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;
const ALL = '__all__';
const MONTH_CHOICES = 12;
const SEARCH_DEBOUNCE_MS = 300;

type Filters = TransactionsFindAllData['query'];

export default function TransactionsPage() {
  const [filters, setFilters] = useState<Filters>({ limit: PAGE_SIZE, offset: 0 });
  const [searchInput, setSearchInput] = useState('');
  const [editing, setEditing] = useState<TransactionResponse | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TransactionResponse | undefined>(undefined);

  const queryClient = useQueryClient();
  const accounts = useAccounts();
  const categories = useCategories();
  const merchants = useMerchants();
  const transactions = useTransactions(filters);

  // The months the range filter offers, newest first.
  const months = useMemo(() => [...lastUtcMonths(MONTH_CHOICES)].reverse(), []);

  const patchFilters = (patch: Partial<NonNullable<Filters>>) =>
    setFilters((current) => ({ ...current, offset: 0, ...patch }));

  // Debounced: the input fired a request on every keystroke before.
  useEffect(() => {
    const timer = setTimeout(
      () => patchFilters({ search: searchInput || undefined }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  const removal = useMutation({
    mutationFn: (id: string) => transactionsRemove({ path: { id }, throwOnError: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('Transaction deleted');
      setPendingDelete(undefined);
    },
    onError: () => toast.error('Could not delete the transaction'),
  });

  const rows = transactions.data?.data ?? [];
  const total = transactions.data?.total ?? 0;
  const offset = filters?.offset ?? 0;
  const selectedMonthKey = months.find((month) => month.from === filters?.from)?.key ?? ALL;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Records"
        title="Transactions"
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setDialogOpen(true);
            }}
          >
            <Plus data-icon="inline-start" />
            Add transaction
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3.5 my-auto size-4"
            aria-hidden
          />
          <Input
            placeholder="Search description or notes"
            className="pl-10"
            aria-label="Search transactions"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>

        <Select
          value={filters?.accountId ?? ALL}
          onValueChange={(value) => patchFilters({ accountId: value === ALL ? undefined : value })}
        >
          <SelectTrigger aria-label="Filter by account">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All accounts</SelectItem>
            {(accounts.data ?? []).map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters?.categoryId ?? ALL}
          onValueChange={(value) => patchFilters({ categoryId: value === ALL ? undefined : value })}
        >
          <SelectTrigger aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {(categories.data ?? []).map((category) => (
              <SelectItem key={category.id} value={category.id}>
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: category.color ?? 'var(--muted-foreground)' }}
                  aria-hidden
                />
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters?.merchantId ?? ALL}
          onValueChange={(value) => patchFilters({ merchantId: value === ALL ? undefined : value })}
        >
          <SelectTrigger aria-label="Filter by merchant">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All merchants</SelectItem>
            {(merchants.data ?? []).map((merchant) => (
              <SelectItem key={merchant.id} value={merchant.id}>
                {merchant.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters?.type ?? ALL}
          onValueChange={(value) =>
            patchFilters({
              type: value === ALL ? undefined : (value as TransactionResponse['type']),
            })
          }
        >
          <SelectTrigger aria-label="Filter by type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            <SelectItem value="INCOME">Income</SelectItem>
            <SelectItem value="EXPENSE">Expense</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={selectedMonthKey}
          onValueChange={(value) => {
            const month = months.find((candidate) => candidate.key === value);
            patchFilters({ from: month?.from, to: month?.to });
          }}
        >
          <SelectTrigger aria-label="Filter by month">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All time</SelectItem>
            {months.map((month) => (
              <SelectItem key={month.key} value={month.key}>
                {longMonth(month.from)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="[--card-spacing:0px] py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-24 pr-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.isPending ? (
              Array.from({ length: 6 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={7} className="px-5">
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-14 text-center">
                  <p className="text-sm font-medium">Nothing here</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    No transactions match these filters.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((transaction) => (
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
                  <TableCell className="text-muted-foreground">
                    {transaction.merchant?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {transaction.account.name}
                  </TableCell>
                  <TableCell>
                    {transaction.items.length === 0 ? (
                      <span className="text-muted-foreground">Not itemised</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{
                            background:
                              transaction.items[0].category?.color ?? 'var(--muted-foreground)',
                          }}
                          aria-hidden
                        />
                        <span className="truncate">{transaction.items[0].name}</span>
                        {transaction.items.length > 1 ? (
                          <span className="text-muted-foreground shrink-0 text-xs">
                            +{transaction.items.length - 1}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-semibold tabular-nums',
                      transaction.type === 'INCOME' ? 'text-income' : 'text-expense',
                    )}
                  >
                    {transaction.type === 'INCOME' ? '+' : '−'}
                    {money(transaction.amountMinor, transaction.currency)}
                  </TableCell>
                  <TableCell className="pr-5 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${transaction.description ?? 'transaction'}`}
                      onClick={() => {
                        setEditing(transaction);
                        setDialogOpen(true);
                      }}
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
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground tabular-nums">
          {total === 0
            ? 'No results'
            : `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="bg-card"
            disabled={offset === 0}
            onClick={() =>
              setFilters((current) => ({
                ...current,
                offset: Math.max(0, (current?.offset ?? 0) - PAGE_SIZE),
              }))
            }
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-card"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() =>
              setFilters((current) => ({ ...current, offset: (current?.offset ?? 0) + PAGE_SIZE }))
            }
          >
            Next
          </Button>
        </div>
      </div>

      <TransactionDialog
        accounts={accounts.data ?? []}
        merchants={merchants.data ?? []}
        transaction={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      {/* Deletion used to fire on the first click with no undo path. */}
      <AlertDialog
        open={pendingDelete !== undefined}
        onOpenChange={(open) => !open && setPendingDelete(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.description ?? 'Transaction'} · ${money(
                    pendingDelete.amountMinor,
                    pendingDelete.currency,
                  )} on ${shortDate(pendingDelete.occurredAt)}. This cannot be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removal.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removal.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (pendingDelete) removal.mutate(pendingDelete.id);
              }}
            >
              {removal.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
