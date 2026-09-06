'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Store, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { merchantsRemove } from '@/api';
import type { MerchantResponse } from '@/api';
import { MerchantDialog } from '@/components/merchants/merchant-dialog';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMerchants } from '@/hooks/use-finance-queries';
import { countLabel } from '@/lib/format';

export default function MerchantsPage() {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<MerchantResponse | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MerchantResponse | undefined>(undefined);

  const queryClient = useQueryClient();
  const merchants = useMerchants();

  // Filtered in the browser, not on the server: the list endpoint is unpaginated,
  // so the whole set is already in cache and a round-trip per keystroke would buy
  // nothing. (The API's `?search=` is still there for other consumers.)
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = merchants.data ?? [];
    return term ? all.filter((merchant) => merchant.name.toLowerCase().includes(term)) : all;
  }, [merchants.data, search]);

  const removal = useMutation({
    mutationFn: (id: string) => merchantsRemove({ path: { id }, throwOnError: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['merchants'] });
      // Transactions embed the merchant, and deleting one nulls their link.
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Merchant deleted');
      setPendingDelete(undefined);
    },
    onError: () => toast.error('Could not delete the merchant'),
  });

  const status: ListStatus = merchants.isPending
    ? 'pending'
    : merchants.isError
      ? 'error'
      : rows.length === 0
        ? 'empty'
        : 'ready';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Master data"
        title="Merchants"
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setDialogOpen(true);
            }}
          >
            <Plus data-icon="inline-start" />
            Add merchant
          </Button>
        }
      />

      <div className="relative min-w-0 sm:max-w-xs">
        <Search
          className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3.5 my-auto size-4"
          aria-hidden
        />
        <Input
          placeholder="Search merchants"
          className="pl-10"
          type="search"
          enterKeyHint="search"
          aria-label="Search merchants"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card className="[--card-spacing:0px] py-0">
        {status === 'ready' ? (
          <>
            {/* One branch is always `display:none`, so the inactive one is out of
                the accessibility tree too and nothing is announced twice. */}
            <ListRowGroup className="md:hidden">
              {rows.map((merchant) => (
                <ListRow
                  key={merchant.id}
                  href={`/merchants/${merchant.id}`}
                  leading={<Store className="text-muted-foreground size-4" aria-hidden />}
                  title={merchant.name}
                  subtitle={`${countLabel(merchant.productCount, 'product')} · ${countLabel(
                    merchant.transactionCount,
                    'transaction',
                  )}`}
                  actions={
                    <>
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditing(merchant);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setPendingDelete(merchant)}
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
                  <TableHead className="text-right">Products</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                  <TableHead className="w-24 pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((merchant) => (
                  <TableRow key={merchant.id} className="hover:bg-muted/50">
                    <TableCell className="pl-5 font-medium">
                      <Link
                        href={`/merchants/${merchant.id}`}
                        className="hover:underline focus-visible:underline focus-visible:outline-none"
                      >
                        {merchant.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {merchant.productCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {merchant.transactionCount}
                    </TableCell>
                    <TableCell className="pr-5 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${merchant.name}`}
                        onClick={() => {
                          setEditing(merchant);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${merchant.name}`}
                        onClick={() => setPendingDelete(merchant)}
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
            title={
              status === 'error'
                ? 'Cannot reach the API'
                : search
                  ? 'Nothing here'
                  : 'No merchants yet'
            }
            description={
              status === 'error'
                ? 'Merchants could not be loaded.'
                : search
                  ? 'No merchant matches that name.'
                  : 'Add the shops you buy from, then pick one when logging a transaction.'
            }
          />
        )}
      </Card>

      <MerchantDialog merchant={editing} open={dialogOpen} onOpenChange={setDialogOpen} />

      <AlertDialog
        open={pendingDelete !== undefined}
        onOpenChange={(open) => !open && setPendingDelete(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this merchant?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.name}. ${
                    pendingDelete.transactionCount === 0
                      ? 'No transactions point at it.'
                      : `${countLabel(
                          pendingDelete.transactionCount,
                          'transaction',
                        )} will stay, with no merchant.`
                  }${
                    // Products cascade rather than detach, so say so — this is the
                    // one part of the deletion that actually destroys data.
                    pendingDelete.productCount === 0
                      ? ''
                      : ` Its ${countLabel(pendingDelete.productCount, 'product')} will be deleted.`
                  } This cannot be undone.`
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
