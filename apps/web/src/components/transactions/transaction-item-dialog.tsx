'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { applyBasisPoints, fromMinor, toMinor } from '@myfinance/shared';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { transactionItemsCreate, transactionItemsUpdate } from '@/api';
import type { CategoryResponse, TransactionItemResponse, TransactionResponse } from '@/api';
import { CurrencyInput } from '@/components/forms/currency-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
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
import { useProducts } from '@/hooks/use-finance-queries';
import { categoriesOfKind, noCategoriesOfKindReason } from '@/lib/category-selection';
import { cn } from '@/lib/utils';
import { money } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

const schema = z.object({
  // A bare string, not `.uuid()`: `.uuid()` would reject the "not in the
  // catalogue" sentinel and make the link mandatory in practice.
  productId: z.string(),
  categoryId: z.string().uuid('Pick a category'),
  name: z.string().min(1, 'Name what was bought').max(160),
  // `valueAsNumber` on the input keeps this a number; an emptied field arrives as
  // NaN, which `.int()` rejects with a message rather than a type error.
  quantity: z.number().int('Whole units only').min(1, 'At least one'),
  // Major units as typed by a human; converted to minor units on submit.
  // `undefined` is an empty field — the union lets the form hold that state and
  // the refinement turns it into a message instead of a type error.
  unitPrice: z
    .union([z.number(), z.undefined()])
    .refine((value): value is number => value !== undefined, 'Enter a price')
    .refine((value) => value >= 0, 'Price cannot be negative'),
  // Percent as a human types it — 10, not 1000 — like the charges card. Optional
  // and capped at 100: over that the line total would go negative.
  discountPercent: z
    .union([z.number(), z.undefined()])
    .optional()
    .refine(
      (value) => value === undefined || (value >= 0 && value <= 100),
      'Between 0 and 100 percent',
    ),
});

type FormValues = z.input<typeof schema>;

/** A SelectItem value cannot be `''`, so "not in the catalogue" needs a sentinel. */
const NO_PRODUCT = '__none__';

interface TransactionItemDialogProps {
  transaction: TransactionResponse;
  categories: CategoryResponse[];
  /** Present when editing a line; omit to add one. */
  item?: TransactionItemResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * One line of a receipt.
 *
 * Picking a product prefills the name, price and category — and then gets out of
 * the way. Every one of those stays editable, because the line is a snapshot of
 * what was actually bought, not a live view of the catalogue: the shop's price
 * that day and the category you filed it under are properties of the receipt.
 *
 * The discount is a **rate**, and only the rate is sent: the API derives the money
 * from it, so editing the quantity later re-applies it instead of leaving a figure
 * that describes the price this line used to be. That is deliberately the opposite
 * of an additional charge, where a typed amount wins over the arithmetic.
 */
export const TransactionItemDialog = ({
  transaction,
  categories,
  item,
  open,
  onOpenChange,
}: TransactionItemDialogProps) => {
  const queryClient = useQueryClient();

  // Only the receipt's own merchant sells things on this receipt. With no
  // merchant set the hook stays disabled and every line is typed by hand.
  const products = useProducts(transaction.merchant?.id ?? '');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      productId: NO_PRODUCT,
      categoryId: '',
      name: '',
      quantity: 1,
      unitPrice: undefined,
      discountPercent: undefined,
    },
  });

  // Re-seed the form whenever the dialog opens on a different line.
  useEffect(() => {
    if (!open) return;

    form.reset({
      productId: item?.product?.id ?? NO_PRODUCT,
      categoryId: item?.category?.id ?? '',
      name: item?.name ?? '',
      quantity: item?.quantity ?? 1,
      unitPrice: item ? fromMinor(item.unitPriceMinor, transaction.currency) : undefined,
      // A line with no discount reads as an empty field, not a typed "0".
      discountPercent: item?.discountBasisPoints ? item.discountBasisPoints / 100 : undefined,
    });
  }, [open, item, transaction.currency, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const parsed = schema.parse(values);

      const body = {
        // null, not undefined: the API reads undefined as "leave it alone", so
        // unlinking a line from the catalogue needs an explicit null.
        productId: parsed.productId === NO_PRODUCT ? null : parsed.productId,
        categoryId: parsed.categoryId,
        name: parsed.name,
        quantity: parsed.quantity,
        unitPriceMinor: toMinor(parsed.unitPrice, transaction.currency),
        // The rate is all that is sent; the API derives the money from it.
        discountBasisPoints: Math.round((parsed.discountPercent ?? 0) * 100),
      };

      return item
        ? transactionItemsUpdate({
            path: { transactionId: transaction.id, itemId: item.id },
            body,
            throwOnError: true,
          })
        : transactionItemsCreate({
            path: { transactionId: transaction.id },
            body,
            throwOnError: true,
          });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      // A linked line writes its price back to the product it came from.
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories() });
      if (transaction.merchant) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.products(transaction.merchant.id),
        });
      }
      toast.success(item ? 'Line updated' : 'Line added');
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Could not save the line');
    },
  });

  const pickableCategories = categoriesOfKind(categories, transaction.type);

  // Products are filtered by the same rule, through the category they prefill.
  // Offering one whose category this receipt cannot use would fill the form in
  // with a value the API then rejects — better never to show it.
  const selectableCategoryIds = new Set(pickableCategories.map((category) => category.id));
  const selectableProducts = (products.data ?? []).filter(
    (product) => !product.category || selectableCategoryIds.has(product.category.id),
  );

  // `useWatch`, not `form.watch()` — the React Compiler lint rule rejects the latter.
  const quantity = useWatch({ control: form.control, name: 'quantity' });
  const unitPrice = useWatch({ control: form.control, name: 'unitPrice' });
  const discountPercent = useWatch({ control: form.control, name: 'discountPercent' });

  const grossMinor = toMinor(
    (Number.isFinite(quantity) ? quantity : 0) * (unitPrice ?? 0),
    transaction.currency,
  );
  // The same helper the API derives with, so this preview is the figure that will
  // be stored rather than one that usually agrees with it.
  const discountMinor = applyBasisPoints(
    grossMinor,
    Math.round((Number.isFinite(discountPercent) ? (discountPercent ?? 0) : 0) * 100),
  );
  const lineTotalMinor = grossMinor - discountMinor;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit line' : 'Add line'}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <div className="grid gap-2">
            <Label htmlFor="productId">Product</Label>
            <Controller
              control={form.control}
              name="productId"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);

                    // Prefill from the catalogue, then leave it alone — these are
                    // starting points for a snapshot, not a live binding.
                    const picked = selectableProducts.find((product) => product.id === value);
                    if (!picked) return;

                    form.setValue('name', picked.name);
                    form.setValue('unitPrice', fromMinor(picked.lastPriceMinor, picked.currency));
                    if (picked.category) form.setValue('categoryId', picked.category.id);
                  }}
                  disabled={!transaction.merchant}
                >
                  <SelectTrigger id="productId" className="w-full">
                    <SelectValue placeholder="Not in the catalogue" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PRODUCT}>Not in the catalogue</SelectItem>
                    {selectableProducts.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.code} · {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-muted-foreground text-xs">
              {transaction.merchant
                ? 'Optional. Picking one fills in the rest, which you can still change.'
                : 'Set a merchant on this transaction to pick from its catalogue.'}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Indomie Goreng"
              autoComplete="off"
              {...form.register('name')}
            />
            {form.formState.errors.name ? (
              <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="categoryId">Category</Label>
            <Controller
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger id="categoryId" className="w-full">
                    <SelectValue placeholder="Pick a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {pickableCategories.length === 0 ? (
                      <p className="text-muted-foreground max-w-64 px-2 py-1.5 text-sm">
                        {noCategoriesOfKindReason(transaction.type)}
                      </p>
                    ) : null}
                    {pickableCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: category.color ?? 'var(--muted-foreground)' }}
                          aria-hidden
                        />
                        {category.name}
                        {/* Two categories may share a name across wallets, so the
                            account tells them apart. Radix clones the item's text
                            into the trigger — hide it there. */}
                        <span className="text-muted-foreground ml-auto pl-3 text-xs [[data-slot=select-trigger]_&]:hidden">
                          {category.accountName ?? '—'}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.categoryId ? (
              <p className="text-destructive text-xs">{form.formState.errors.categoryId.message}</p>
            ) : pickableCategories.length === 0 ? (
              // Nothing to pick means the line cannot be saved at all, so say the
              // way out here rather than leaving it to a rejected submit.
              <p className="text-muted-foreground text-xs">
                {noCategoriesOfKindReason(transaction.type)}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                step={1}
                {...form.register('quantity', { valueAsNumber: true })}
              />
              {form.formState.errors.quantity ? (
                <p className="text-destructive text-xs">{form.formState.errors.quantity.message}</p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="unitPrice">Unit price</Label>
              <Controller
                control={form.control}
                name="unitPrice"
                render={({ field }) => (
                  <CurrencyInput
                    id="unitPrice"
                    currency={transaction.currency}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              {form.formState.errors.unitPrice ? (
                <p className="text-destructive text-xs">
                  {form.formState.errors.unitPrice.message}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="discountPercent">Discount %</Label>
              <Controller
                control={form.control}
                name="discountPercent"
                render={({ field }) => (
                  <Input
                    id="discountPercent"
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    inputMode="decimal"
                    placeholder="—"
                    value={field.value ?? ''}
                    onBlur={field.onBlur}
                    onChange={(event) => {
                      const percent = event.target.valueAsNumber;
                      field.onChange(Number.isFinite(percent) ? percent : undefined);
                    }}
                    aria-invalid={Boolean(form.formState.errors.discountPercent)}
                  />
                )}
              />
              {form.formState.errors.discountPercent ? (
                <p className="text-destructive text-xs">
                  {form.formState.errors.discountPercent.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="bg-muted grid gap-1.5 rounded-xl px-4 py-3 text-sm">
            {/* Only worth three rows when there is something to subtract; an
                undiscounted line just states its total. */}
            {discountMinor > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Before discount</span>
                  <span className="tabular-nums">{money(grossMinor, transaction.currency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="tabular-nums">
                    −{money(discountMinor, transaction.currency)}
                  </span>
                </div>
              </>
            ) : null}
            <div
              className={cn(
                'flex items-center justify-between font-semibold',
                discountMinor > 0 && 'border-t pt-1.5',
              )}
            >
              <span>Line total</span>
              <span className="tabular-nums">{money(lineTotalMinor, transaction.currency)}</span>
            </div>
          </div>

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
