'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { transactionsRemove } from '@/api';
import type {
  AccountResponse,
  CategoryResponse,
  MerchantResponse,
  TransactionResponse,
  TransactionsFindAllData,
} from '@/api';
import { ListRow, ListRowGroup, ListState, type ListStatus } from '@/components/shell/list-row';
import { PageHeader } from '@/components/shell/page-header';
import { ReceiptScanDialog } from '@/components/transactions/receipt-scan-dialog';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ACCOUNT_PICKER_QUERY,
  useAccounts,
  useCategories,
  useMerchants,
  useTransactions,
} from '@/hooks/use-finance-queries';
import { lastUtcMonths, type MonthWindow } from '@/lib/date-range';
import { longMonth, money, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;
const ALL = '__all__';
const MONTH_CHOICES = 12;
const SEARCH_DEBOUNCE_MS = 300;

type Filters = TransactionsFindAllData['query'];

/**
 * The five filters, defined once.
 *
 * Rendered inline on a desktop and inside a bottom sheet on a phone — where six
 * `w-fit` controls used to wrap into four ragged rows and put 200px of chrome
 * above the data before a single transaction. One definition, so the two views
 * cannot drift apart.
 */
const FilterFields = ({
  filters,
  patchFilters,
  accounts,
  categories,
  merchants,
  months,
  selectedMonthKey,
}: {
  filters: Filters;
  patchFilters: (patch: Partial<NonNullable<Filters>>) => void;
  accounts: AccountResponse[];
  categories: CategoryResponse[];
  merchants: MerchantResponse[];
  months: MonthWindow[];
  selectedMonthKey: string;
}) => (
  <>
    <Select
      value={filters?.accountId ?? ALL}
      onValueChange={(value) => patchFilters({ accountId: value === ALL ? undefined : value })}
    >
      <SelectTrigger aria-label="Filter by account">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All accounts</SelectItem>
        {accounts.map((account) => (
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
        {categories.map((category) => (
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
        {merchants.map((merchant) => (
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
  </>
);

export default function TransactionsPage() {
  const [filters, setFilters] = useState<Filters>({ limit: PAGE_SIZE, offset: 0 });
  const [searchInput, setSearchInput] = useState('');
  const [editing, setEditing] = useState<TransactionResponse | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TransactionResponse | undefined>(undefined);

  const queryClient = useQueryClient();
  const accounts = useAccounts(ACCOUNT_PICKER_QUERY);
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

  // What the "Filters" button reports. Search is excluded: it has its own field
  // beside the button, so counting it would make the badge describe the wrong
  // control.
  const activeFilterCount = [
    filters?.accountId,
    filters?.categoryId,
    filters?.merchantId,
    filters?.type,
    filters?.from,
  ].filter(Boolean).length;

  const status: ListStatus = transactions.isPending
    ? 'pending'
    : rows.length === 0
      ? 'empty'
      : 'ready';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Records"
        title="Transactions"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setScanOpen(true)}>
              <Camera data-icon="inline-start" />
              Scan receipt
            </Button>
            {/* The FAB is the mobile path to this same dialog. "Scan receipt"
                has no equivalent there, so it stays at every width. */}
            <Button
              className="hidden md:inline-flex"
              onClick={() => {
                setEditing(undefined);
                setDialogOpen(true);
              }}
            >
              <Plus data-icon="inline-start" />
              Add transaction
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3.5 my-auto size-4"
            aria-hidden
          />
          <Input
            placeholder="Search description or notes"
            className="pl-10"
            type="search"
            enterKeyHint="search"
            aria-label="Search transactions"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>

        {/* Desktop keeps the filters inline; a phone gets one button, because five
            of these side by side is most of the screen before any data. */}
        <div className="hidden flex-1 flex-wrap items-center gap-2 sm:flex">
          <FilterFields
            filters={filters}
            patchFilters={patchFilters}
            accounts={accounts.data?.data ?? []}
            categories={categories.data ?? []}
            merchants={merchants.data ?? []}
            months={months}
            selectedMonthKey={selectedMonthKey}
          />
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="bg-card shrink-0 sm:hidden">
              <SlidersHorizontal data-icon="inline-start" />
              Filters
              {activeFilterCount > 0 ? (
                <Badge variant="secondary" className="ml-0.5">
                  {activeFilterCount}
                </Badge>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>

            {/* Full-width triggers: `SelectTrigger` is `w-fit`, which reads as a
                ragged column of chips once they are stacked. */}
            <div className="flex flex-col gap-3 *:[button]:w-full">
              <FilterFields
                filters={filters}
                patchFilters={patchFilters}
                accounts={accounts.data?.data ?? []}
                categories={categories.data ?? []}
                merchants={merchants.data ?? []}
                months={months}
                selectedMonthKey={selectedMonthKey}
              />
            </div>

            <Button
              variant="ghost"
              disabled={activeFilterCount === 0}
              onClick={() => setFilters({ limit: PAGE_SIZE, offset: 0, search: filters?.search })}
            >
              Clear all
            </Button>
          </SheetContent>
        </Sheet>
      </div>

      <Card className="[--card-spacing:0px] py-0">
        {status === 'ready' ? (
          <>
            <ListRowGroup className="md:hidden">
              {rows.map((transaction) => (
                <ListRow
                  key={transaction.id}
                  href={`/transactions/${transaction.id}`}
                  leading={
                    <span
                      className="size-2.5 rounded-full"
                      style={{
                        background:
                          transaction.items[0]?.category?.color ?? 'var(--muted-foreground)',
                      }}
                      aria-hidden
                    />
                  }
                  title={transaction.description ?? transaction.merchant?.name ?? 'Transaction'}
                  subtitle={`${shortDate(transaction.occurredAt)} · ${transaction.account.name}`}
                  meta={
                    /* Posted by a reimbursement, not entered. Labelled so it does
                       not read as a stray row whose actions simply fail. */
                    transaction.isSettlement ? (
                      <Badge variant="secondary">Reimbursement</Badge>
                    ) : transaction.items.length > 0 ? (
                      <span className="text-muted-foreground truncate text-xs">
                        {transaction.items[0].name}
                        {transaction.items.length > 1 ? ` +${transaction.items.length - 1}` : ''}
                      </span>
                    ) : null
                  }
                  trailing={
                    <span
                      className={transaction.type === 'INCOME' ? 'text-income' : 'text-expense'}
                    >
                      {transaction.type === 'INCOME' ? '+' : '−'}
                      {money(transaction.amountMinor, transaction.currency)}
                    </span>
                  }
                  actions={
                    /* The API refuses both on a reimbursement posting — it is
                       undone from the receipt it reimbursed. */
                    transaction.isSettlement ? undefined : (
                      <>
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(transaction);
                            setDialogOpen(true);
                          }}
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
                    )
                  }
                />
              ))}
            </ListRowGroup>

            <Table className="hidden md:table">
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
                {rows.map((transaction) => (
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
                      {/* Posted by a reimbursement, not entered. Labelled so it does not
                          read as a stray row whose edit and delete buttons simply fail. */}
                      {transaction.isSettlement ? (
                        <Badge variant="secondary">Reimbursement</Badge>
                      ) : transaction.items.length === 0 ? (
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
                      {/* The API refuses both on a reimbursement posting — it is undone from
                          the receipt it reimbursed, so the buttons are not offered here. */}
                      {transaction.isSettlement ? null : (
                        <>
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
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        ) : (
          <ListState
            status={status}
            rows={6}
            title="Nothing here"
            description="No transactions match these filters."
          />
        )}
      </Card>

      <div className="flex flex-col items-start gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
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
        accounts={accounts.data?.data ?? []}
        merchants={merchants.data ?? []}
        transaction={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <ReceiptScanDialog
        accounts={accounts.data?.data ?? []}
        merchants={merchants.data ?? []}
        open={scanOpen}
        onOpenChange={setScanOpen}
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
