'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookmarkPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { transactionItemsRemove } from '@/api';
import type { TransactionItemResponse } from '@/api';
import { SaveToCatalogueDialog } from '@/components/transactions/save-to-catalogue-dialog';
import { TransactionChargesCard } from '@/components/transactions/transaction-charges-card';
import { TransactionDialog } from '@/components/transactions/transaction-dialog';
import { TransactionItemCategorySelect } from '@/components/transactions/transaction-item-category-select';
import { TransactionItemDialog } from '@/components/transactions/transaction-item-dialog';
import { TransactionSplitCard } from '@/components/transactions/transaction-split-card';
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
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
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
  ACCOUNT_PICKER_QUERY,
  useAccounts,
  useCategories,
  useMerchants,
  useTransaction,
} from '@/hooks/use-finance-queries';
import { money, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Names both collections the expense total is derived from, skipping either when empty. */
const expenseTotalLabel = (lineCount: number, chargeCount: number): string => {
  const lines = `${lineCount} line${lineCount === 1 ? '' : 's'}`;
  const charges = `${chargeCount} charge${chargeCount === 1 ? '' : 's'}`;

  return chargeCount === 0 ? `Total from ${lines}` : `Total from ${lines} + ${charges}`;
};

export default function TransactionDetailPage() {
  // Every page here is a client component, so the route param comes from
  // `useParams` — the server `params` object is a promise in this Next version.
  const params = useParams<{ id: string }>();
  const transactionId = params.id;

  const [headerOpen, setHeaderOpen] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TransactionItemResponse | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<TransactionItemResponse | undefined>(
    undefined,
  );
  const [promoting, setPromoting] = useState<TransactionItemResponse | undefined>(undefined);

  const queryClient = useQueryClient();
  const transaction = useTransaction(transactionId);
  const accounts = useAccounts(ACCOUNT_PICKER_QUERY);
  const categories = useCategories();
  const merchants = useMerchants();

  const removal = useMutation({
    mutationFn: (itemId: string) =>
      transactionItemsRemove({
        path: { transactionId, itemId },
        throwOnError: true,
      }),
    onSuccess: async () => {
      // Removing a line re-derives the receipt total, which the list and every
      // dashboard aggregate read — so invalidate the whole prefix, not one key.
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('Line removed');
      setPendingDelete(undefined);
    },
    onError: () => toast.error('Could not remove the line'),
  });

  const receipt = transaction.data;
  const items = receipt?.items ?? [];
  // Income is a single amount posted to an account, not a receipt: it has no
  // lines, and the API refuses to write any. Everything below that edits lines is
  // hidden rather than disabled — offering a control the server always rejects
  // reads as a broken page, not a restricted one.
  const isIncome = receipt?.type === 'INCOME';
  /**
   * A row posted by a reimbursement. Its amount was written once and is
   * authoritative, and the API refuses every write to it — so the editing
   * affordances are hidden rather than offered and then rejected. It is undone from
   * the receipt it reimbursed, not from here.
   */
  const isSettlement = receipt?.isSettlement ?? false;

  if (transaction.isError) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          eyebrow={
            <Link
              href="/transactions"
              className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Transactions
            </Link>
          }
          title="Not found"
        />
        <Card>
          <div className="px-(--card-spacing) py-6 text-center">
            <p className="text-sm font-medium">This transaction could not be loaded</p>
            <p className="text-muted-foreground mt-1 text-sm">
              It may have been deleted, or the API is unreachable.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={
          <Link
            href="/transactions"
            className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Transactions
          </Link>
        }
        title={receipt?.description ?? receipt?.merchant?.name ?? 'Transaction'}
        actions={
          receipt && !isSettlement ? (
            <Button variant="secondary" onClick={() => setHeaderOpen(true)}>
              <Pencil data-icon="inline-start" />
              Edit details
            </Button>
          ) : null
        }
      />

      {isSettlement ? (
        <Card tone="muted">
          <div className="px-(--card-spacing) text-sm">
            <Badge variant="secondary">Reimbursement</Badge>
            <p className="text-muted-foreground mt-2">
              This row was posted by a reimbursement, so it cannot be edited here. Undo it on the
              receipt it came from and this row goes with its opposite side.
            </p>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="grid gap-4 px-(--card-spacing) sm:grid-cols-2 lg:grid-cols-4">
          {receipt ? (
            <>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground text-xs font-medium">Date</span>
                <span className="text-sm">{shortDate(receipt.occurredAt)}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground text-xs font-medium">Account</span>
                <span className="text-sm">{receipt.account.name}</span>
              </div>
              {/* Income has no shop to name and carries its own category; an
                  expense is the other way round. Same slot, different fact. */}
              {isIncome ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground text-xs font-medium">Category</span>
                  <span className="flex items-center gap-2 text-sm">
                    {receipt.category ? (
                      <>
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{
                            background: receipt.category.color ?? 'var(--muted-foreground)',
                          }}
                          aria-hidden
                        />
                        {receipt.category.name}
                      </>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground text-xs font-medium">Merchant</span>
                  <span className="text-sm">{receipt.merchant?.name ?? '—'}</span>
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground text-xs font-medium">
                  {isIncome ? 'Amount' : expenseTotalLabel(items.length, receipt.charges.length)}
                </span>
                <span
                  className={cn(
                    'text-lg font-semibold tabular-nums',
                    receipt.type === 'INCOME' ? 'text-income' : 'text-expense',
                  )}
                >
                  {receipt.type === 'INCOME' ? '+' : '−'}
                  {money(receipt.amountMinor, receipt.currency)}
                </span>
              </div>
            </>
          ) : (
            Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))
          )}
        </div>
      </Card>

      {isIncome || isSettlement ? null : (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">What was bought</h2>
            <Button
              disabled={!receipt}
              onClick={() => {
                setEditingItem(undefined);
                setItemDialogOpen(true);
              }}
            >
              <Plus data-icon="inline-start" />
              Add line
            </Button>
          </div>

          <Card className="[--card-spacing:0px] py-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                  <TableHead className="w-32 pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {transaction.isPending ? (
                  Array.from({ length: 3 }, (_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={7} className="px-5">
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="py-14 text-center">
                      <p className="text-sm font-medium">Nothing itemised yet</p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Add what was bought — the total adds itself up from the lines.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/50">
                      <TableCell className="pl-5 font-medium">
                        <span className="flex flex-col">
                          {item.name}
                          {item.product?.code ? (
                            <span className="text-muted-foreground text-xs font-normal">
                              {item.product.code}
                            </span>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="py-1">
                        {receipt ? (
                          <TransactionItemCategorySelect
                            transaction={receipt}
                            item={item}
                            categories={categories.data ?? []}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {money(item.unitPriceMinor, receipt?.currency ?? 'IDR')}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {item.discountMinor > 0 ? (
                          <span className="flex flex-col">
                            {/* Explicit sign, not a colour: the design system never
                                signals direction by colour alone. */}
                            −{money(item.discountMinor, receipt?.currency ?? 'IDR')}
                            <span className="text-xs">{item.discountBasisPoints / 100}%</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {money(item.lineTotalMinor, receipt?.currency ?? 'IDR')}
                      </TableCell>
                      <TableCell className="pr-5 text-right whitespace-nowrap">
                        {/* Only offered for a line that is not already in the catalogue,
                        and only when there is a merchant to file it under. */}
                        {receipt && !item.product ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Save ${item.name} to the catalogue`}
                            title={
                              receipt.merchant
                                ? 'Save to the catalogue'
                                : 'Set a merchant on this transaction first'
                            }
                            disabled={!receipt.merchant}
                            onClick={() => setPromoting(item)}
                          >
                            <BookmarkPlus />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${item.name}`}
                          onClick={() => {
                            setEditingItem(item);
                            setItemDialogOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${item.name}`}
                          onClick={() => setPendingDelete(item)}
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

          <h2 className="text-lg font-semibold tracking-tight">Additional charges</h2>

          {receipt ? <TransactionChargesCard transaction={receipt} /> : null}

          {/* Only when a line is filed under a category belonging to another wallet.
              An ordinary receipt has nothing to divide and shows no section at all. */}
          {receipt?.split ? (
            <>
              <h2 className="text-lg font-semibold tracking-tight">Split</h2>
              <TransactionSplitCard transaction={receipt} split={receipt.split} />
            </>
          ) : null}
        </>
      )}

      {receipt ? (
        <>
          <TransactionDialog
            accounts={accounts.data?.data ?? []}
            merchants={merchants.data ?? []}
            transaction={receipt}
            lockedType={receipt.type}
            open={headerOpen}
            onOpenChange={setHeaderOpen}
          />

          {isIncome ? null : (
            <>
              <TransactionItemDialog
                transaction={receipt}
                categories={categories.data ?? []}
                item={editingItem}
                open={itemDialogOpen}
                onOpenChange={setItemDialogOpen}
              />

              {promoting ? (
                <SaveToCatalogueDialog
                  transaction={receipt}
                  item={promoting}
                  open
                  onOpenChange={(open) => !open && setPromoting(undefined)}
                />
              ) : null}
            </>
          )}
        </>
      ) : null}

      <AlertDialog
        open={pendingDelete !== undefined}
        onOpenChange={(open) => !open && setPendingDelete(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this line?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.name}. The receipt total will drop by ${money(
                    pendingDelete.lineTotalMinor,
                    receipt?.currency ?? 'IDR',
                  )}. This cannot be undone.`
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
              {removal.isPending ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
