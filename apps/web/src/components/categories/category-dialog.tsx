'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { categoriesCreate, categoriesUpdate } from '@/api';
import type { CategoryResponse } from '@/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ACCOUNT_PICKER_QUERY, useAccounts } from '@/hooks/use-finance-queries';
import { UNASSIGNED_ACCOUNT } from '@/lib/account-meta';
import { invalidateCategoryDependents } from '@/lib/query-invalidation';
import { cn } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(1, 'Give the category a name').max(60),
  // A bare string on purpose: `.uuid()` would reject the sentinel and make the
  // field mandatory in practice, and the link is optional.
  accountId: z.string(),
  kind: z.enum(['EXPENSE', 'INCOME']),
  // Matches the API's @IsHexColor(), which will not take a 3-digit shorthand.
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour'),
});

type FormValues = z.input<typeof schema>;

/**
 * The seeded palette, reused so a hand-made category sits alongside the defaults
 * instead of standing out. These are hex because they are *data* — a value stored
 * on the row and rendered as a swatch — not theme tokens; the dialog's own
 * surfaces still take their colour from the design system.
 */
const SWATCHES = [
  '#22c55e',
  '#16a34a',
  '#f97316',
  '#0ea5e9',
  '#a855f7',
  '#ef4444',
  '#eab308',
  '#14b8a6',
] as const;

interface CategoryDialogProps {
  /** Present when editing; omit to create. */
  category?: CategoryResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CategoryDialog = ({
  category,
  open,
  onOpenChange,
}: CategoryDialogProps): ReactNode => {
  const queryClient = useQueryClient();
  // Archived accounts are excluded: filing new spending against a wallet that has
  // been put away is not something to offer.
  const accounts = useAccounts(ACCOUNT_PICKER_QUERY);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', accountId: UNASSIGNED_ACCOUNT, kind: 'EXPENSE', color: SWATCHES[2] },
  });

  // Re-seed the form whenever the dialog opens on a different row.
  useEffect(() => {
    if (!open) return;
    form.reset({
      name: category?.name ?? '',
      accountId: category?.accountId ?? UNASSIGNED_ACCOUNT,
      kind: category?.kind ?? 'EXPENSE',
      color: category?.color ?? SWATCHES[2],
    });
  }, [open, category, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const parsed = schema.parse(values);
      const body = {
        ...parsed,
        // null, not undefined: the API reads undefined as "leave it alone", so
        // unassigning an existing category needs an explicit null.
        accountId: parsed.accountId === UNASSIGNED_ACCOUNT ? null : parsed.accountId,
      };

      return category
        ? categoriesUpdate({ path: { id: category.id }, body, throwOnError: true })
        : categoriesCreate({ body, throwOnError: true });
    },
    onSuccess: async () => {
      await invalidateCategoryDependents(queryClient);
      toast.success(category ? 'Category updated' : 'Category added');
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      // The (user, account, name, kind) unique index surfaces as a 409; say which
      // rule was broken rather than leaving the user to guess at a bare failure.
      const message =
        error instanceof Error && /409|conflict|unique/i.test(error.message)
          ? 'That account already has a category with that name and kind.'
          : 'Could not save the category';
      toast.error(message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? 'Edit category' : 'Add category'}</DialogTitle>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <DialogBody className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Groceries" {...form.register('name')} />
              {form.formState.errors.name ? (
                <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="accountId">Account</Label>
              <Controller
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="accountId" className="w-full">
                      <SelectValue placeholder="Pick an account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_ACCOUNT}>No account</SelectItem>
                      {(accounts.data?.data ?? []).map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-muted-foreground text-xs">
                Bound to an account, this category can only be used on transactions posted there.
                Leave it unassigned to use it anywhere.
              </p>
            </div>

            {/* A segmented control rather than a dropdown, matching the transaction
              form: a binary choice that changes what the category can be attached
              to should be visible, not collapsed behind a menu. */}
            <div className="grid gap-2">
              <Label>Kind</Label>
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <div
                    role="radiogroup"
                    aria-label="Kind"
                    className="bg-muted grid grid-cols-2 gap-1 rounded-full p-1"
                  >
                    {(['EXPENSE', 'INCOME'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={field.value === option}
                        // Changing the kind of a category already in use would strand
                        // every line filed under it: the API refuses to write a line
                        // whose kind disagrees with its transaction's type.
                        disabled={category !== undefined}
                        onClick={() => field.onChange(option)}
                        className={cn(
                          'focus-visible:ring-ring/50 rounded-full py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed',
                          field.value === option
                            ? 'bg-card text-foreground ring-foreground/8 ring-1'
                            : 'text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground',
                        )}
                      >
                        {option === 'EXPENSE' ? 'Expense' : 'Income'}
                      </button>
                    ))}
                  </div>
                )}
              />
              {category ? (
                <p className="text-muted-foreground text-xs">
                  Kind cannot change once a category exists. Create a new one instead.
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label>Colour</Label>
              <Controller
                control={form.control}
                name="color"
                render={({ field }) => (
                  <div className="flex flex-wrap items-center gap-2">
                    {SWATCHES.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        aria-label={`Use ${swatch}`}
                        aria-pressed={field.value.toLowerCase() === swatch}
                        onClick={() => field.onChange(swatch)}
                        style={{ background: swatch }}
                        className={cn(
                          'focus-visible:ring-ring/50 size-7 rounded-full outline-none focus-visible:ring-3',
                          field.value.toLowerCase() === swatch
                            ? 'ring-foreground/40 ring-2 ring-offset-2'
                            : 'ring-foreground/8 ring-1',
                        )}
                      />
                    ))}
                    <input
                      type="color"
                      aria-label="Custom colour"
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      className="ring-foreground/8 size-7 cursor-pointer rounded-full bg-transparent ring-1"
                    />
                  </div>
                )}
              />
              {form.formState.errors.color ? (
                <p className="text-destructive text-xs">{form.formState.errors.color.message}</p>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
