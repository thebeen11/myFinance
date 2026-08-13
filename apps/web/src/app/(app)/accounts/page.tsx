'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, Archive, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { accountsRemove, accountsUpdate } from '@/api';
import type { AccountResponse } from '@/api';
import { AccountDialog } from '@/components/accounts/account-dialog';
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
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAccounts, type AccountListQuery } from '@/hooks/use-finance-queries';
import { accountIcon, accountTypeLabel } from '@/lib/account-meta';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Says what a delete destroys, so the confirm is a fact rather than a warning.
 *
 * The two consequences are not the same and the copy must not blur them: the
 * transactions are gone for good, the categories merely come loose.
 */
const describeUsage = (account: AccountResponse): string => {
  const parts: string[] = [];

  if (account.transactionCount > 0) {
    parts.push(
      `${account.transactionCount} transaction${
        account.transactionCount === 1 ? '' : 's'
      } will be deleted with it`,
    );
  }

  if (account.categoryCount > 0) {
    parts.push(
      `${account.categoryCount} categor${
        account.categoryCount === 1 ? 'y' : 'ies'
      } will be left unassigned`,
    );
  }

  if (parts.length === 0) return 'Nothing points at it.';

  return `${parts.join(', and ')}.`;
};

export default function AccountsPage() {
  const [query, setQuery] = useState<AccountListQuery>({ limit: PAGE_SIZE, offset: 0 });
  const [searchInput, setSearchInput] = useState('');
  const [editing, setEditing] = useState<AccountResponse | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AccountResponse | undefined>(undefined);

  const queryClient = useQueryClient();
  const accounts = useAccounts(query);

  // Any change to what is being filtered puts you back on page one — staying on
  // page four of a result set that just shrank shows an empty table.
  const patchQuery = (patch: Partial<AccountListQuery>) =>
    setQuery((current) => ({ ...current, offset: 0, ...patch }));

  // Debounced, because the filter is a request now rather than a browser-side pass.
  useEffect(() => {
    const timer = setTimeout(
      () => patchQuery({ search: searchInput || undefined }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  const rows = accounts.data?.data ?? [];
  const total = accounts.data?.total ?? 0;
  const offset = query.offset ?? 0;
  const showArchived = query.includeArchived ?? false;
  // Counted server-side over the whole match, so the toggle knows how many rows
  // it would reveal while they are still hidden.
  const archivedCount = accounts.data?.archivedTotal ?? 0;

  const archival = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      accountsUpdate({ path: { id }, body: { archived }, throwOnError: true }),
    onSuccess: async (_data, { archived }) => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success(archived ? 'Account archived' : 'Account restored');
    },
    onError: () => toast.error('Could not change the account'),
  });

  const removal = useMutation({
    mutationFn: (id: string) => accountsRemove({ path: { id }, throwOnError: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      // Its transactions cascade away, and its categories come loose.
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Account deleted');
      setPendingDelete(undefined);
    },
    onError: () => toast.error('Could not delete the account'),
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Master data"
        title="Accounts"
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setDialogOpen(true);
            }}
          >
            <Plus data-icon="inline-start" />
            Add account
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs sm:flex-none">
          <Search
            className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3.5 my-auto size-4"
            aria-hidden
          />
          <Input
            placeholder="Search accounts"
            className="pl-10"
            aria-label="Search accounts"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>

        {archivedCount > 0 ? (
          <button
            type="button"
            aria-pressed={showArchived}
            onClick={() => patchQuery({ includeArchived: !showArchived })}
            className={cn(
              'focus-visible:ring-ring/50 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3',
              showArchived
                ? 'bg-card text-foreground ring-foreground/8 ring-1'
                : 'text-muted-foreground hover:text-foreground bg-muted',
            )}
          >
            Show archived ({archivedCount})
          </button>
        ) : null}
      </div>

      <Card className="[--card-spacing:0px] py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Categories</TableHead>
              <TableHead className="text-right">Transactions</TableHead>
              <TableHead className="w-32 pr-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.isPending ? (
              Array.from({ length: 4 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={6} className="px-5">
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : accounts.isError ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center">
                  <p className="text-sm font-medium">Cannot reach the API</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Accounts could not be loaded.
                  </p>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center">
                  <p className="text-sm font-medium">
                    {searchInput ? 'Nothing here' : 'No accounts yet'}
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {searchInput
                      ? 'No account matches that name.'
                      : 'Add every place your money lives — cash, bank, e-wallets, cards.'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((account) => {
                const Icon = accountIcon(account.type);
                const isArchived = account.archivedAt !== null;

                return (
                  <TableRow
                    key={account.id}
                    className={cn('hover:bg-muted/50', isArchived && 'text-muted-foreground')}
                  >
                    <TableCell className="pl-5 font-medium">
                      {/* The way into the account's own page, where its money is
                          recorded and read. This list is master data only. */}
                      <Link
                        href={`/accounts/${account.id}`}
                        className="flex items-center gap-2.5 hover:underline focus-visible:underline focus-visible:outline-none"
                      >
                        <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                        {account.name}
                        {isArchived ? (
                          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                            Archived
                          </span>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {accountTypeLabel(account.type)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(account.balance.balanceMinor, account.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {account.categoryCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {account.transactionCount}
                    </TableCell>
                    <TableCell className="pr-5 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${account.name}`}
                        onClick={() => {
                          setEditing(account);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={archival.isPending}
                        aria-label={`${isArchived ? 'Restore' : 'Archive'} ${account.name}`}
                        onClick={() => archival.mutate({ id: account.id, archived: !isArchived })}
                      >
                        {isArchived ? <ArchiveRestore /> : <Archive />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${account.name}`}
                        onClick={() => setPendingDelete(account)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
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
              setQuery((current) => ({
                ...current,
                offset: Math.max(0, (current.offset ?? 0) - PAGE_SIZE),
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
              setQuery((current) => ({ ...current, offset: (current.offset ?? 0) + PAGE_SIZE }))
            }
          >
            Next
          </Button>
        </div>
      </div>

      <AccountDialog account={editing} open={dialogOpen} onOpenChange={setDialogOpen} />

      <AlertDialog
        open={pendingDelete !== undefined}
        onOpenChange={(open) => !open && setPendingDelete(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.name}. ${describeUsage(pendingDelete)} This cannot be undone — archive it instead to keep its history.`
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
