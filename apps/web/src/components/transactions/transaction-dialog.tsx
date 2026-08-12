'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_CURRENCY, fromMinor, toMinor } from '@myfinance/shared';
import { useEffect, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { transactionsCreate, transactionsUpdate } from '@/api';
import type { AccountResponse, MerchantResponse, TransactionResponse } from '@/api';
import { CurrencyInput } from '@/components/forms/currency-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useCategories } from '@/hooks/use-finance-queries';
import { categoriesOfKind, noCategoriesOfKindReason } from '@/lib/category-selection';
import { dateInputValue } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * One transaction, entered two different ways depending on its type.
 *
 * An **expense** is a receipt header and only a header: no amount and no
 * category, because the total is the sum of line items entered on its own page
 * afterwards, and a receipt does not have one category — its lines do.
 *
 * **Income** has no receipt to itemise. It is a single amount posted to an
 * account, so it is entered here in full — amount and category included — and is
 * finished the moment it is saved. That asymmetry is the API's rule, mirrored
 * here so the form never offers a shape the server refuses.
 */
const schema = z
  .object({
    accountId: z.string().uuid('Pick an account'),
    // Optional, and a bare string on purpose: `.uuid()` would reject the
    // "no merchant" sentinel and make the field mandatory in practice.
    merchantId: z.string(),
    type: z.enum(['INCOME', 'EXPENSE']),
    occurredAt: z.string().min(1, 'Pick a date'),
    description: z.string().max(140).optional(),
    /**
     * Income only. Major units as typed by a human, converted on submit.
     * `undefined` is an empty field, not zero — same convention as the line dialog.
     */
    amount: z.number().optional(),
    /** Income only. `''` is "nothing picked yet"; the refinement below is what requires it. */
    categoryId: z.string().optional(),
  })
  // Required-ness follows `type`, so it cannot be expressed field by field.
  .superRefine((values, ctx) => {
    if (values.type !== 'INCOME') return;

    if (values.amount === undefined) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter an amount' });
    } else if (values.amount <= 0) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter an amount above zero' });
    }

    if (!values.categoryId) {
      ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Pick a category' });
    }
  });

type FormValues = z.input<typeof schema>;

/** A SelectItem value cannot be `''`, so "no merchant" needs a sentinel of its own. */
const NO_MERCHANT = '__none__';

interface TransactionDialogProps {
  accounts: AccountResponse[];
  merchants: MerchantResponse[];
  /** Present when editing; omit to create. */
  transaction?: TransactionResponse;
  /**
   * Pins the transaction to one account and hides the picker — an account's own
   * page already answers "which account", and asking again would be a step back.
   */
  lockedAccount?: AccountResponse;
  /** Opens on, and pins, one direction. The toggle is hidden while it is set. */
  lockedType?: 'INCOME' | 'EXPENSE';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
}

export const TransactionDialog = ({
  accounts,
  merchants,
  transaction,
  lockedAccount,
  lockedType,
  open,
  onOpenChange,
  trigger,
}: TransactionDialogProps) => {
  const queryClient = useQueryClient();
  const categories = useCategories();

  const defaultAccountId = lockedAccount?.id ?? accounts[0]?.id ?? '';
  const defaultType = lockedType ?? 'EXPENSE';

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      accountId: defaultAccountId,
      merchantId: NO_MERCHANT,
      type: defaultType,
      occurredAt: dateInputValue(new Date().toISOString()),
      description: '',
      amount: undefined,
      categoryId: '',
    },
  });

  // Re-seed the form whenever the dialog opens on a different row.
  useEffect(() => {
    if (!open) return;

    form.reset(
      transaction
        ? {
            accountId: transaction.account.id,
            merchantId: transaction.merchant?.id ?? NO_MERCHANT,
            type: transaction.type,
            occurredAt: dateInputValue(transaction.occurredAt),
            description: transaction.description ?? '',
            // Only income holds a figure of its own; an expense total belongs to
            // its lines and must not be seeded into an editable field here.
            amount:
              transaction.type === 'INCOME'
                ? fromMinor(transaction.amountMinor, transaction.currency)
                : undefined,
            categoryId: transaction.category?.id ?? '',
          }
        : {
            accountId: defaultAccountId,
            merchantId: NO_MERCHANT,
            type: defaultType,
            occurredAt: dateInputValue(new Date().toISOString()),
            description: '',
            amount: undefined,
            categoryId: '',
          },
    );
  }, [open, transaction, defaultAccountId, defaultType, form]);

  // `useWatch`, not `form.watch()` — the React Compiler lint rule rejects the latter.
  const type = useWatch({ control: form.control, name: 'type' });
  const accountId = useWatch({ control: form.control, name: 'accountId' });
  const isIncome = type === 'INCOME';

  // The account owns the currency, and it decides how many decimals the amount
  // field accepts — IDR takes none, USD two.
  const currency =
    (lockedAccount ?? accounts.find((account) => account.id === accountId))?.currency ??
    DEFAULT_CURRENCY;

  const incomeCategories = categoriesOfKind(categories.data ?? [], 'INCOME');

  // Named for what is being recorded once the caller has pinned the direction —
  // "Add transaction" on a button that only ever adds income reads as a mistake.
  const noun =
    lockedType === 'INCOME' ? 'income' : lockedType === 'EXPENSE' ? 'expense' : 'transaction';
  const dialogTitle = `${transaction ? 'Edit' : 'Add'} ${noun}`;

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const parsed = schema.parse(values);

      const base = {
        accountId: parsed.accountId,
        type: parsed.type,
        // <input type="date"> gives a bare day; the API wants a timestamp.
        occurredAt: new Date(`${parsed.occurredAt}T00:00:00.000Z`).toISOString(),
        description: parsed.description || undefined,
      };

      const body =
        parsed.type === 'INCOME'
          ? {
              ...base,
              // Income is not a purchase from a shop and the form hides the
              // picker, so converting a receipt into income clears the merchant
              // rather than leaving a stale one attached behind the scenes.
              merchantId: null,
              // Undefined is unreachable — the schema refuses income without an
              // amount — and the API would reject it anyway rather than write a zero.
              amountMinor:
                parsed.amount === undefined ? undefined : toMinor(parsed.amount, currency),
              categoryId: parsed.categoryId,
            }
          : {
              ...base,
              // null, not undefined: the API reads undefined as "leave it alone", so
              // clearing the merchant on an existing transaction needs an explicit null.
              merchantId: parsed.merchantId === NO_MERCHANT ? null : parsed.merchantId,
            };

      return transaction
        ? transactionsUpdate({ path: { id: transaction.id }, body, throwOnError: true })
        : transactionsCreate({ body, throwOnError: true });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success(transaction ? 'Transaction updated' : 'Transaction added');
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Could not save the transaction');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          {/* A segmented control rather than a dropdown: this is a binary choice
              that also decides how the rest of the form behaves, so it should be
              visible at a glance instead of collapsed behind a menu. Hidden when
              the caller already committed to a direction. */}
          {lockedType ? null : (
            <div className="grid gap-2">
              <Label>Type</Label>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <div
                    role="radiogroup"
                    aria-label="Type"
                    className="bg-muted grid grid-cols-2 gap-1 rounded-full p-1"
                  >
                    {(['EXPENSE', 'INCOME'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={field.value === option}
                        onClick={() => field.onChange(option)}
                        className={cn(
                          'focus-visible:ring-ring/50 rounded-full py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3',
                          field.value === option
                            ? 'bg-card text-foreground ring-foreground/8 ring-1'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {option === 'EXPENSE' ? 'Expense' : 'Income'}
                      </button>
                    ))}
                  </div>
                )}
              />
            </div>
          )}

          {lockedAccount ? null : (
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
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.accountId ? (
                <p className="text-destructive text-xs">
                  {form.formState.errors.accountId.message}
                </p>
              ) : null}
            </div>
          )}

          {/* Income is a single figure posted to the account — there is nothing to
              itemise afterwards, so the amount is entered here and the row is
              complete on save. An expense total belongs to its lines instead. */}
          {isIncome ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="amount">Amount</Label>
                <Controller
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <CurrencyInput
                      id="amount"
                      currency={currency}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      aria-invalid={Boolean(form.formState.errors.amount)}
                    />
                  )}
                />
                {form.formState.errors.amount ? (
                  <p className="text-destructive text-xs">{form.formState.errors.amount.message}</p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="categoryId">Category</Label>
                <Controller
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={incomeCategories.length === 0}
                    >
                      <SelectTrigger id="categoryId" className="w-full">
                        <SelectValue placeholder="Pick a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {incomeCategories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {incomeCategories.length === 0 && !categories.isPending ? (
                  <p className="text-muted-foreground text-xs">
                    {noCategoriesOfKindReason('INCOME')}
                  </p>
                ) : null}
                {form.formState.errors.categoryId ? (
                  <p className="text-destructive text-xs">
                    {form.formState.errors.categoryId.message}
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            /* Optional. "No merchant" is a first-class choice, not a fallback. */
            <div className="grid gap-2">
              <Label htmlFor="merchantId">Merchant</Label>
              <Controller
                control={form.control}
                name="merchantId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="merchantId" className="w-full">
                      <SelectValue placeholder="No merchant" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_MERCHANT}>No merchant</SelectItem>
                      {merchants.map((merchant) => (
                        <SelectItem key={merchant.id} value={merchant.id}>
                          {merchant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="occurredAt">Date</Label>
            <Input id="occurredAt" type="date" {...form.register('occurredAt')} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" placeholder="Optional" {...form.register('description')} />
          </div>

          {/* Only an expense has a second step. Income is finished on save, and
              saying otherwise would send the user looking for a receipt to itemise. */}
          {transaction || isIncome ? null : (
            <p className="text-muted-foreground text-xs">
              The amount comes from what you add to the receipt. Open it after saving to enter what
              was bought.
            </p>
          )}

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
