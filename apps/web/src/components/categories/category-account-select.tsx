'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { toast } from 'sonner';

import { categoriesUpdate } from '@/api';
import type { AccountResponse, CategoryResponse } from '@/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UNASSIGNED_ACCOUNT } from '@/lib/account-meta';
import { invalidateCategoryDependents } from '@/lib/query-invalidation';
import { cn } from '@/lib/utils';

interface CategoryAccountSelectProps {
  category: CategoryResponse;
  /**
   * Passed down rather than fetched per row: the page already holds the list, and
   * archived accounts are excluded from it — filing spending against a wallet that
   * has been put away is not something to offer.
   */
  accounts: AccountResponse[];
}

/**
 * The Account cell of the categories table, editable in place.
 *
 * Where a category is filed is the one field worth changing without the edit
 * dialog: sorting a fresh set of categories across wallets is a run down the
 * column, and a modal per row turns each move into four clicks. Name, kind and
 * colour stay in the dialog — they are not what you sweep a whole list for.
 */
export const CategoryAccountSelect = ({
  category,
  accounts,
}: CategoryAccountSelectProps): ReactNode => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    // null, not undefined: the API reads undefined as "leave the link alone", so
    // unassigning needs an explicit null.
    mutationFn: (accountId: string | null) =>
      categoriesUpdate({ path: { id: category.id }, body: { accountId }, throwOnError: true }),
    onSuccess: async () => {
      await invalidateCategoryDependents(queryClient);
      toast.success('Category moved');
    },
    onError: (error: unknown) => {
      // The (user, account, name, kind) unique index surfaces as a 409; say which
      // rule was broken rather than leaving the user to guess at a bare failure.
      const message =
        error instanceof Error && /409|conflict|unique/i.test(error.message)
          ? 'That account already has a category with that name and kind.'
          : 'Could not move the category';
      toast.error(message);
    },
  });

  // A category can be bound to an archived account, which the picker omits. Listing
  // the current link regardless keeps the trigger from rendering blank and losing a
  // name the cell used to show; it simply cannot be chosen again once moved off.
  const options = useMemo(() => {
    const listed = accounts.map((account) => ({ id: account.id, name: account.name }));

    if (category.accountId && !listed.some((option) => option.id === category.accountId)) {
      listed.push({ id: category.accountId, name: category.accountName ?? 'Archived account' });
    }

    return listed;
  }, [accounts, category.accountId, category.accountName]);

  // `onSuccess` awaits the refetch, so the mutation stays pending for the whole
  // round-trip. Showing its variable meanwhile holds the trigger on the account
  // just picked, instead of snapping back to the cached one and forward again.
  const value = mutation.isPending
    ? (mutation.variables ?? UNASSIGNED_ACCOUNT)
    : (category.accountId ?? UNASSIGNED_ACCOUNT);

  return (
    <Select
      value={value}
      disabled={mutation.isPending}
      onValueChange={(next) => mutation.mutate(next === UNASSIGNED_ACCOUNT ? null : next)}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Account for ${category.name}`}
        className={cn(
          // Quiet until touched — a column of bordered controls reads as a form
          // rather than a list. The negative margin keeps the label optically on
          // the same line as the cells either side of it.
          '-mx-2.5 max-w-44 border-transparent bg-transparent hover:bg-muted data-[state=open]:bg-muted',
          value === UNASSIGNED_ACCOUNT ? 'text-muted-foreground/60' : 'text-muted-foreground',
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED_ACCOUNT}>Unassigned</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
