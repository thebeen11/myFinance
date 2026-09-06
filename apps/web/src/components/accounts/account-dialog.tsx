'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_CURRENCY, fromMinor, toMinor } from '@myfinance/shared';
import { useEffect, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { accountsCreate, accountsUpdate } from '@/api';
import type { AccountResponse } from '@/api';
import { CurrencyInput } from '@/components/forms/currency-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogBody,
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
import { accountTypeLabel } from '@/lib/account-meta';

const ACCOUNT_TYPES = ['CASH', 'BANK', 'EWALLET', 'CREDIT_CARD', 'INVESTMENT'] as const;

const schema = z.object({
  name: z.string().min(1, 'Give the account a name').max(80),
  type: z.enum(ACCOUNT_TYPES),
  currency: z
    .string()
    .length(3, 'Use a three-letter code')
    .regex(/^[A-Za-z]{3}$/, 'Use a three-letter code'),
  // Major units as typed by a human; converted to minor units on submit.
  // `undefined` is an empty field — the union lets the form hold that state and
  // the refinement turns it into a message instead of a type error.
  openingBalance: z
    .union([z.number(), z.undefined()])
    .refine((value): value is number => value !== undefined, 'Enter an opening balance'),
});

type FormValues = z.input<typeof schema>;

interface AccountDialogProps {
  /** Present when editing; omit to create. */
  account?: AccountResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
}

export const AccountDialog = ({ account, open, onOpenChange, trigger }: AccountDialogProps) => {
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      type: 'BANK',
      currency: DEFAULT_CURRENCY,
      openingBalance: undefined,
    },
  });

  // The opening balance field has to scale by the currency chosen right here —
  // IDR has no decimals, USD has two — so it reads the live form value.
  const currency = useWatch({ control: form.control, name: 'currency' });

  // Re-seed the form whenever the dialog opens on a different row.
  useEffect(() => {
    if (!open) return;
    form.reset({
      name: account?.name ?? '',
      type: account?.type ?? 'BANK',
      currency: account?.currency ?? DEFAULT_CURRENCY,
      openingBalance: account
        ? fromMinor(account.openingBalanceMinor, account.currency)
        : // Not `undefined`: an account almost always starts at zero, and making
          // the common case require typing a 0 is friction for nothing.
          0,
    });
  }, [open, account, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const parsed = schema.parse(values);
      const code = parsed.currency.toUpperCase();
      const body = {
        name: parsed.name,
        type: parsed.type,
        currency: code,
        openingBalanceMinor: toMinor(parsed.openingBalance, code),
      };

      return account
        ? accountsUpdate({ path: { id: account.id }, body, throwOnError: true })
        : accountsCreate({ body, throwOnError: true });
    },
    onSuccess: async () => {
      // The broad prefix also refreshes every accountBalance key and the
      // archived-inclusive list.
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      // Transaction rows embed the account, so a rename has to reach them too.
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(account ? 'Account updated' : 'Account added');
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Could not save the account');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? 'Edit account' : 'Add account'}</DialogTitle>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <DialogBody className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="BCA Payroll"
                autoComplete="off"
                {...form.register('name')}
              />
              {form.formState.errors.name ? (
                <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="type">Type</Label>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="type" className="w-full">
                      <SelectValue placeholder="Pick a type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {accountTypeLabel(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.type ? (
                <p className="text-destructive text-xs">{form.formState.errors.type.message}</p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                placeholder="IDR"
                autoComplete="off"
                maxLength={3}
                className="uppercase"
                // Fixed once the account exists: every amount already posted to it
                // was stored at this currency's scale, and changing the code would
                // silently reinterpret all of them.
                disabled={account !== undefined}
                {...form.register('currency')}
              />
              {form.formState.errors.currency ? (
                <p className="text-destructive text-xs">{form.formState.errors.currency.message}</p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {account
                    ? 'Fixed once the account exists — its history is stored at this scale.'
                    : 'ISO 4217 code. Cannot be changed later.'}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="openingBalance">Opening balance</Label>
              <Controller
                control={form.control}
                name="openingBalance"
                render={({ field }) => (
                  <CurrencyInput
                    id="openingBalance"
                    currency={currency.length === 3 ? currency.toUpperCase() : DEFAULT_CURRENCY}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              {form.formState.errors.openingBalance ? (
                <p className="text-destructive text-xs">
                  {form.formState.errors.openingBalance.message}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  What the account held before the first tracked transaction.
                </p>
              )}
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
