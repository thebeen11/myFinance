'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { toast } from 'sonner';

import { transactionItemsUpdate } from '@/api';
import type { CategoryResponse, TransactionItemResponse, TransactionResponse } from '@/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { categoriesOfKind, noCategoriesOfKindReason } from '@/lib/category-selection';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

/**
 * A line has to end up categorised — the API refuses to clear the link — so this
 * is a value the cell can *show*, never one it offers.
 */
const UNCATEGORISED = '__none__';

interface CategoryOption {
  id: string;
  name: string;
  color?: string | null;
  /** The wallet the category is filed under; two can share a name, only not an account. */
  accountName?: string | null;
  /** Listed so the trigger has a label, but not a legal choice. */
  disabled?: boolean;
}

interface TransactionItemCategorySelectProps {
  transaction: TransactionResponse;
  item: TransactionItemResponse;
  categories: CategoryResponse[];
}

/**
 * The Category cell of a receipt's lines, editable in place.
 *
 * Filing is the one thing you redo in sweeps — a receipt comes back from the shop
 * with ten lines that all landed on the same default — and re-opening the line
 * dialog for each is five clicks to change one field. Name, quantity and price
 * describe what was bought and stay in the dialog.
 */
export const TransactionItemCategorySelect = ({
  transaction,
  item,
  categories,
  className,
}: TransactionItemCategorySelectProps & { className?: string }): ReactNode => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (categoryId: string) =>
      transactionItemsUpdate({
        path: { transactionId: transaction.id, itemId: item.id },
        body: { categoryId },
        throwOnError: true,
      }),
    onSuccess: async () => {
      // The receipt total cannot move — only where the line sits — so accounts and
      // the catalogue are left alone. Both categories' `transactionItemCount` do
      // move, and the dashboard breakdown groups by category, hence the prefix.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.categories() }),
      ]);
      toast.success('Line recategorised');
    },
    onError: (error: unknown) => {
      // The API names the rule it refused on (wrong kind, wrong account) far more
      // precisely than this component could guess at.
      toast.error(error instanceof Error ? error.message : 'Could not recategorise the line');
    },
  });

  const options = useMemo<CategoryOption[]>(() => {
    const selectable: CategoryOption[] = categoriesOfKind(categories, transaction.type).map(
      (category) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        accountName: category.accountName,
      }),
    );

    // Flipping a category's kind strands the lines already filed under it: the
    // link stays on the row but disagrees with the receipt's direction. The
    // dialog blocks that edit, the API still accepts it — so listing the category
    // keeps the cell naming what it actually holds; disabled, so the only move
    // offered is off it.
    const current = item.category;
    if (current && !selectable.some((option) => option.id === current.id)) {
      selectable.push({
        id: current.id,
        name: current.name,
        color: current.color,
        // The nested summary carries no account, so read it off the full list.
        accountName: categories.find((category) => category.id === current.id)?.accountName,
        disabled: true,
      });
    }

    return selectable;
  }, [categories, transaction.type, item.category]);

  // `onSuccess` awaits the refetch, so the mutation stays pending for the whole
  // round-trip. Showing its variable meanwhile holds the trigger on the category
  // just picked, instead of snapping back to the cached one and forward again.
  const value = mutation.isPending
    ? (mutation.variables ?? UNCATEGORISED)
    : (item.category?.id ?? UNCATEGORISED);

  return (
    <Select
      value={value}
      disabled={mutation.isPending}
      onValueChange={(next) => mutation.mutate(next)}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Category for ${item.name}`}
        className={cn(
          // Quiet until touched — a column of bordered controls reads as a form
          // rather than a receipt. The negative margin and the width cap are
          // `sm:` only: they exist to sit the label on the same line as the table
          // cells either side of it, and below `md` there is no table.
          'sm:-mx-2.5 sm:max-w-52 border-transparent bg-transparent hover:bg-muted data-[state=open]:bg-muted',
          value === UNCATEGORISED && 'text-muted-foreground',
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {/* Every option is the line's own, unusable one — so the list is really
            empty, and a popover with nothing in it reads as broken. */}
        {options.every((option) => option.disabled) ? (
          <p className="text-muted-foreground max-w-64 px-2 py-1.5 text-sm">
            {noCategoriesOfKindReason(transaction.type)}
          </p>
        ) : null}
        {value === UNCATEGORISED ? (
          <SelectItem value={UNCATEGORISED} disabled>
            Uncategorised
          </SelectItem>
        ) : null}
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id} disabled={option.disabled}>
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: option.color ?? 'var(--muted-foreground)' }}
              aria-hidden
            />
            {option.name}
            {/* Two categories may share a name across wallets, so the account tells
                them apart. Radix clones the item's text into the trigger, and this
                cell is a narrow table column — hide it there. */}
            <span className="text-muted-foreground ml-auto pl-3 text-xs [[data-slot=select-trigger]_&]:hidden">
              {option.accountName ?? '—'}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
