'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { categoriesRemove } from '@/api';
import type { CategoryResponse } from '@/api';
import { CategoryAccountSelect } from '@/components/categories/category-account-select';
import { CategoryDialog } from '@/components/categories/category-dialog';
import { ListRow, ListRowGroup, ListState, type ListStatus } from '@/components/shell/list-row';
import { PageHeader } from '@/components/shell/page-header';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ACCOUNT_PICKER_QUERY, useAccounts, useCategories } from '@/hooks/use-finance-queries';
import { UNASSIGNED_ACCOUNT } from '@/lib/account-meta';
import { countLabel } from '@/lib/format';
import { invalidateCategoryDependents } from '@/lib/query-invalidation';
import { cn } from '@/lib/utils';

type KindFilter = 'ALL' | 'EXPENSE' | 'INCOME';

/** Sits alongside the account ids in the same Select, so it needs its own value. */
const ALL_ACCOUNTS = '__all__';

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
];

/** Says what a delete detaches, so the confirm is a fact rather than a warning. */
const describeUsage = (category: CategoryResponse): string => {
  const parts: string[] = [];

  if (category.transactionItemCount > 0) {
    parts.push(countLabel(category.transactionItemCount, 'receipt line'));
  }

  if (category.productCount > 0) {
    parts.push(countLabel(category.productCount, 'product'));
  }

  if (parts.length === 0) return 'Nothing is filed under it.';

  return `${parts.join(' and ')} will stay but become uncategorised, and cannot be saved again until a new category is picked.`;
};

export default function CategoriesPage() {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('ALL');
  const [accountFilter, setAccountFilter] = useState<string>(ALL_ACCOUNTS);
  const [editing, setEditing] = useState<CategoryResponse | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CategoryResponse | undefined>(undefined);

  const queryClient = useQueryClient();
  const categories = useCategories();
  const accounts = useAccounts(ACCOUNT_PICKER_QUERY);

  // Filtered in the browser, not on the server: the list endpoint is unpaginated,
  // so the whole set is already in cache and a round-trip per keystroke — or per
  // kind toggle, which the API does support via `?kind=` — would buy nothing.
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return (categories.data ?? [])
      .filter((category) => kind === 'ALL' || category.kind === kind)
      .filter((category) => {
        if (accountFilter === ALL_ACCOUNTS) return true;
        if (accountFilter === UNASSIGNED_ACCOUNT) return !category.accountId;
        return category.accountId === accountFilter;
      })
      .filter((category) => !term || category.name.toLowerCase().includes(term));
  }, [categories.data, search, kind, accountFilter]);

  const hasFilters = search !== '' || kind !== 'ALL' || accountFilter !== ALL_ACCOUNTS;

  const removal = useMutation({
    mutationFn: (id: string) => categoriesRemove({ path: { id }, throwOnError: true }),
    onSuccess: async () => {
      await invalidateCategoryDependents(queryClient);
      toast.success('Category deleted');
      setPendingDelete(undefined);
    },
    onError: () => toast.error('Could not delete the category'),
  });

  const status: ListStatus = categories.isPending
    ? 'pending'
    : categories.isError
      ? 'error'
      : rows.length === 0
        ? 'empty'
        : 'ready';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Master data"
        title="Categories"
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setDialogOpen(true);
            }}
          >
            <Plus data-icon="inline-start" />
            Add category
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full min-w-0 sm:max-w-xs sm:flex-none">
          <Search
            className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3.5 my-auto size-4"
            aria-hidden
          />
          <Input
            placeholder="Search categories"
            className="pl-10"
            type="search"
            enterKeyHint="search"
            aria-label="Search categories"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div
          role="radiogroup"
          aria-label="Filter by kind"
          className="bg-muted flex flex-1 items-center gap-1 rounded-full p-1 *:flex-1 sm:flex-none sm:*:flex-none"
        >
          {KIND_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={kind === option.value}
              onClick={() => setKind(option.value)}
              className={cn(
                'focus-visible:ring-ring/50 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3',
                kind === option.value
                  ? 'bg-card text-foreground ring-foreground/8 ring-1'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger aria-label="Filter by account" className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ACCOUNTS}>All accounts</SelectItem>
            <SelectItem value={UNASSIGNED_ACCOUNT}>Unassigned</SelectItem>
            {(accounts.data?.data ?? []).map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="[--card-spacing:0px] py-0">
        {status === 'ready' ? (
          <>
            <ListRowGroup className="md:hidden">
              {rows.map((category) => (
                <ListRow
                  key={category.id}
                  leading={
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: category.color ?? 'var(--muted-foreground)' }}
                      aria-hidden
                    />
                  }
                  title={category.name}
                  subtitle={`${category.kind === 'INCOME' ? 'Income' : 'Expense'} · ${countLabel(
                    category.transactionItemCount,
                    'receipt line',
                  )} · ${countLabel(category.productCount, 'product')}`}
                  // The account picker is a control, not a value, so it gets its
                  // own full-width line rather than a 176px sliver in a cell.
                  footer={
                    // Named, because the mobile list has no column header to say
                    // what this control is picking.
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground shrink-0 text-xs">Account</span>
                      <CategoryAccountSelect
                        category={category}
                        accounts={accounts.data?.data ?? []}
                        className="max-w-none flex-1"
                      />
                    </div>
                  }
                  actions={
                    <>
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditing(category);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setPendingDelete(category)}
                      >
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </>
                  }
                />
              ))}
            </ListRowGroup>

            <Table className="hidden md:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Name</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Receipt lines</TableHead>
                  <TableHead className="text-right">Products</TableHead>
                  <TableHead className="w-24 pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((category) => (
                  <TableRow key={category.id} className="hover:bg-muted/50">
                    <TableCell className="pl-5 font-medium">
                      <span className="flex items-center gap-2.5">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: category.color ?? 'var(--muted-foreground)' }}
                          aria-hidden
                        />
                        {category.name}
                      </span>
                    </TableCell>
                    <TableCell className="py-1">
                      <CategoryAccountSelect
                        category={category}
                        accounts={accounts.data?.data ?? []}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {category.kind === 'INCOME' ? 'Income' : 'Expense'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {category.transactionItemCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {category.productCount}
                    </TableCell>
                    <TableCell className="pr-5 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${category.name}`}
                        onClick={() => {
                          setEditing(category);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${category.name}`}
                        onClick={() => setPendingDelete(category)}
                      >
                        <Trash2 />
                      </Button>
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
            title={
              status === 'error'
                ? 'Cannot reach the API'
                : hasFilters
                  ? 'Nothing here'
                  : 'No categories yet'
            }
            description={
              status === 'error'
                ? 'Categories could not be loaded.'
                : hasFilters
                  ? 'No category matches those filters.'
                  : 'Categories classify what you buy, line by line.'
            }
          />
        )}
      </Card>

      <CategoryDialog category={editing} open={dialogOpen} onOpenChange={setDialogOpen} />

      <AlertDialog
        open={pendingDelete !== undefined}
        onOpenChange={(open) => !open && setPendingDelete(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.name}. ${describeUsage(pendingDelete)} This cannot be undone.`
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
