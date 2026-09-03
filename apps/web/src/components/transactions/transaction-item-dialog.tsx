'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BASIS_POINTS_SCALE, applyBasisPoints, fromMinor, toMinor } from '@myfinance/shared';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { productsCreate, transactionItemsCreate, transactionItemsUpdate } from '@/api';
import type { CategoryResponse, TransactionItemResponse, TransactionResponse } from '@/api';
import { CurrencyInput } from '@/components/forms/currency-input';
import { ProductCombobox } from '@/components/products/product-combobox';
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
  // A bare string, not `.uuid()`: an empty one is "not in the catalogue", and
  // `.uuid()` would reject it and make the link mandatory in practice.
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

/**
 * Basis points are the wire format; nobody types "1000" for ten percent. The same
 * pair the charges card keeps locally — a third caller is what should promote them
 * to `packages/shared/src/money/`.
 */
const toPercent = (basisPoints: number): number => basisPoints / 100;

/** Anything unusable — an emptied field arrives as NaN — is "no discount". */
const toBasisPoints = (percent: number | undefined): number =>
  percent === undefined || !Number.isFinite(percent)
    ? 0
    : Math.round((percent * BASIS_POINTS_SCALE) / 100);

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
 * The name field *is* the catalogue search: typing filters the merchant's
 * products, and picking one prefills the price and category — then gets out of
 * the way. Every one of those stays editable, because the line is a snapshot of
 * what was actually bought, not a live view of the catalogue: the shop's price
 * that day and the category you filed it under are properties of the receipt.
 *
 * Editing the name after a pick drops the link, so what the box says is what gets
 * catalogued. A **new** line whose name matches nothing in the catalogue adds
 * itself to it on save — the catalogue fills itself as receipts are entered,
 * rather than waiting for someone to remember the bookmark on the row. Editing an
 * existing line never does: re-saving an old hand-typed line should not quietly
 * become master data, and promoting it stays the deliberate step that can also
 * give it a product code.
 *
 * The discount is a **rate**, and only the rate is sent: the API derives the money
 * from it, so editing the quantity later re-applies it instead of leaving a figure
 * that describes the price this line used to be. That is deliberately the opposite
 * of an additional charge, where a typed amount wins over the arithmetic.
 *
 * It can still be entered either way. The money box is a view of the rate rather
 * than a second field, so typing into it converts to a rate and the box then settles
 * on whatever that rate actually comes to. A receipt's printed discount usually
 * round-trips exactly; when it cannot, the settled figure is the one that will be
 * saved — better than a box that quietly disagrees with the stored line.
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
      productId: '',
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
      productId: item?.product?.id ?? '',
      categoryId: item?.category?.id ?? '',
      name: item?.name ?? '',
      quantity: item?.quantity ?? 1,
      unitPrice: item ? fromMinor(item.unitPriceMinor, transaction.currency) : undefined,
      // A line with no discount reads as an empty field, not a typed "0".
      discountPercent: item?.discountBasisPoints ? toPercent(item.discountBasisPoints) : undefined,
    });
  }, [open, item, transaction.currency, form]);

  const merchantId = transaction.merchant?.id;

  /**
   * The catalogue id a new, unlinked line should be saved under.
   *
   * An exact name match — case and surrounding space aside — links to what is
   * already there rather than adding a second row saying the same thing. It is
   * matched against the whole catalogue, not the filtered list: a product hidden
   * because its category does not suit this receipt is still a duplicate.
   *
   * Anything else becomes a new product, priced at the **undiscounted** unit
   * price, the same shelf-price rule the API applies when it writes a linked
   * line's price back. No code is set: it is optional, and typing one belongs to
   * the deliberate promotion the row's bookmark still offers.
   */
  const catalogueNewLine = async (name: string, unitPriceMinor: number, categoryId: string) => {
    if (!merchantId) return { productId: null, created: false, failed: false };

    const existing = (products.data ?? []).find(
      (product) => product.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );

    if (existing) return { productId: existing.id, created: false, failed: false };

    try {
      const created = await productsCreate({
        body: { merchantId, categoryId, name, lastPriceMinor: unitPriceMinor },
        throwOnError: true,
      });

      return { productId: created.data.id, created: true, failed: false };
    } catch {
      // The line is what the user came here to save; losing it because the
      // catalogue write failed would be the worse outcome. Save it unlinked and
      // say so — the two calls are not atomic and the toast should not pretend.
      return { productId: null, created: false, failed: true };
    }
  };

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const parsed = schema.parse(values);
      const unitPriceMinor = toMinor(parsed.unitPrice, transaction.currency);

      // Only a new line, only when nothing was picked, and only where there is a
      // merchant to file it under.
      const catalogued =
        !item && !parsed.productId && merchantId
          ? await catalogueNewLine(parsed.name, unitPriceMinor, parsed.categoryId)
          : { productId: parsed.productId || null, created: false, failed: false };

      const body = {
        // null, not undefined: the API reads undefined as "leave it alone", so
        // unlinking a line from the catalogue needs an explicit null.
        productId: catalogued.productId,
        categoryId: parsed.categoryId,
        name: parsed.name,
        quantity: parsed.quantity,
        unitPriceMinor,
        // The rate is all that is sent; the API derives the money from it.
        discountBasisPoints: toBasisPoints(parsed.discountPercent),
      };

      await (item
        ? transactionItemsUpdate({
            path: { transactionId: transaction.id, itemId: item.id },
            body,
            throwOnError: true,
          })
        : transactionItemsCreate({
            path: { transactionId: transaction.id },
            body,
            throwOnError: true,
          }));

      return catalogued;
    },
    onSuccess: async (catalogued) => {
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      // A linked line writes its price back to the product it came from.
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories() });
      if (merchantId) {
        // The broad prefix once a product was added: a new row moves the
        // merchant's own `productCount`, and the catalogue key sits under it.
        await queryClient.invalidateQueries({
          queryKey: catalogued.created ? queryKeys.merchants() : queryKeys.products(merchantId),
        });
      }

      if (catalogued.failed) {
        toast.warning('Line added, but it could not be added to the catalogue.');
      } else {
        toast.success(item ? 'Line updated' : 'Line added');
      }

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
  const productId = useWatch({ control: form.control, name: 'productId' });
  const quantity = useWatch({ control: form.control, name: 'quantity' });
  const unitPrice = useWatch({ control: form.control, name: 'unitPrice' });
  const discountPercent = useWatch({ control: form.control, name: 'discountPercent' });

  const linkedProduct = selectableProducts.find((product) => product.id === productId);

  // Says what saving will do to the catalogue, because the field now decides it:
  // a pick links, typed text does not, and a new line's typed text is added.
  const catalogueHint = !transaction.merchant
    ? 'Set a merchant on this transaction to pick from its catalogue.'
    : linkedProduct
      ? `Linked to ${linkedProduct.code ? `${linkedProduct.code} · ` : ''}${linkedProduct.name} in ${transaction.merchant.name}'s catalogue.`
      : item
        ? 'Not in the catalogue.'
        : 'Not in the catalogue — it will be added when you save.';

  const grossMinor = toMinor(
    (Number.isFinite(quantity) ? quantity : 0) * (unitPrice ?? 0),
    transaction.currency,
  );
  // The same helper the API derives with, so this preview is the figure that will
  // be stored rather than one that usually agrees with it.
  const discountMinor = applyBasisPoints(grossMinor, toBasisPoints(discountPercent));
  const lineTotalMinor = grossMinor - discountMinor;

  // The money box is a view of the rate, not a second piece of state — which is why
  // changing the quantity moves it on its own and the two can never disagree. An
  // unset discount reads as an empty field rather than a typed zero.
  const discountAmount =
    discountPercent === undefined || !Number.isFinite(discountPercent)
      ? undefined
      : fromMinor(discountMinor, transaction.currency);

  /**
   * Entering the discount as money instead of a rate. Only the rate is stored, so
   * the amount is turned into one immediately and the box then re-renders off it,
   * settling on the figure that will actually be saved rather than one the API is
   * about to round somewhere else.
   */
  const handleDiscountAmountChange = (amount: number | undefined): void => {
    if (amount === undefined) {
      form.setValue('discountPercent', undefined);
      return;
    }

    // There is nothing to take a percentage of until a price has been typed.
    const amountMinor = toMinor(amount, transaction.currency);
    const basisPoints =
      grossMinor > 0 ? Math.round((amountMinor * BASIS_POINTS_SCALE) / grossMinor) : 0;
    form.setValue('discountPercent', toPercent(basisPoints));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wider than the other dialogs: the quantity/price/discount row is four
          fields across, two of them money with a currency prefix. */}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit line' : 'Add line'}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Controller
              control={form.control}
              name="name"
              render={({ field }) => (
                <ProductCombobox
                  id="name"
                  placeholder="Indomie Goreng"
                  value={field.value}
                  onBlur={field.onBlur}
                  products={selectableProducts}
                  onValueChange={(name) => {
                    field.onChange(name);
                    // Typed text wins over the pick it replaces: what the box says
                    // is what gets catalogued.
                    form.setValue('productId', '');
                  }}
                  onSelectProduct={(picked) => {
                    // Prefill from the catalogue, then leave it alone — these are
                    // starting points for a snapshot, not a live binding.
                    field.onChange(picked.name);
                    form.setValue('productId', picked.id);
                    form.setValue('unitPrice', fromMinor(picked.lastPriceMinor, picked.currency));
                    if (picked.category) form.setValue('categoryId', picked.category.id);
                  }}
                  aria-invalid={Boolean(form.formState.errors.name)}
                />
              )}
            />
            {form.formState.errors.name ? (
              <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>
            ) : (
              <p className="text-muted-foreground text-xs">{catalogueHint}</p>
            )}
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

          <div className="grid gap-2">
            {/* Four across once there is room for it; two-up on a phone, where the
                dialog is only `calc(100% - 2rem)` wide and a currency-prefixed money
                field in a quarter of that has no space left for digits. The two
                short numbers get a fixed column wide enough for their own labels;
                the money fields take everything left over. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[6.5rem_1fr_6.5rem_1fr] sm:gap-3">
              <div className="grid gap-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  step={1}
                  {...form.register('quantity', { valueAsNumber: true })}
                  aria-invalid={Boolean(form.formState.errors.quantity)}
                />
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
                      aria-invalid={Boolean(form.formState.errors.unitPrice)}
                    />
                  )}
                />
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
                      onBlur={() => {
                        // Settle on the rate that will be stored: a typed 33.333 is
                        // saved as 3333 basis points, so leaving 33.333 on screen
                        // would state a figure nothing keeps — and the money box
                        // beside it would already be showing the rounded one.
                        // An emptied field stays empty, though: 0% is a typed
                        // instruction, not the absence of one.
                        if (field.value !== undefined && Number.isFinite(field.value)) {
                          field.onChange(toPercent(toBasisPoints(field.value)));
                        }
                        field.onBlur();
                      }}
                      onChange={(event) => {
                        const percent = event.target.valueAsNumber;
                        field.onChange(Number.isFinite(percent) ? percent : undefined);
                      }}
                      aria-invalid={Boolean(form.formState.errors.discountPercent)}
                    />
                  )}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="discountAmount">Discount amount</Label>
                {/* Not a form field: its value is derived from the rate and its
                    onChange writes back into it, so the pair cannot drift apart. */}
                <CurrencyInput
                  id="discountAmount"
                  name="discountAmount"
                  currency={transaction.currency}
                  value={discountAmount}
                  onChange={handleDiscountAmountChange}
                  aria-invalid={Boolean(form.formState.errors.discountPercent)}
                />
              </div>
            </div>

            {/* Below the row, at full width: a message has no room inside a 2.75rem
                column. */}
            {form.formState.errors.quantity ? (
              <p className="text-destructive text-xs">{form.formState.errors.quantity.message}</p>
            ) : null}
            {form.formState.errors.unitPrice ? (
              <p className="text-destructive text-xs">{form.formState.errors.unitPrice.message}</p>
            ) : null}
            {form.formState.errors.discountPercent ? (
              <p className="text-destructive text-xs">
                {form.formState.errors.discountPercent.message}
              </p>
            ) : null}
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
