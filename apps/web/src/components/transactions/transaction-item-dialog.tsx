'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  basisPointsToPercent,
  cascadeDiscounts,
  fromMinor,
  fromQuantityMilli,
  lineGrossMinor,
  QUANTITY_FRACTION_DIGITS,
  toMinor,
  toQuantityMilli,
} from '@myfinance/shared';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { productsCreate, transactionItemsCreate, transactionItemsUpdate } from '@/api';
import type { CategoryResponse, TransactionItemResponse, TransactionResponse } from '@/api';
import { CurrencyInput } from '@/components/forms/currency-input';
import { DecimalInput } from '@/components/forms/decimal-input';
import { ProductCombobox } from '@/components/products/product-combobox';
import {
  LineDiscountsField,
  toDiscountBodies,
  toDiscountRows,
  type DiscountRow,
} from '@/components/transactions/line-discounts-field';
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
  // Fractional, because a shop sells by weight: 1,5 kg of watermelon at
  // Rp 40.000/kg is the line, not one unit at Rp 60.000. `DecimalInput` holds it
  // as a number, and an emptied field arrives as NaN, which `.min()` rejects with
  // a message rather than a type error. The floor is one thousandth — the
  // smallest quantity the stored scale can express.
  quantity: z.number().min(0.001, 'Enter how much was bought'),
  // Major units as typed by a human; converted to minor units on submit.
  // `undefined` is an empty field — the union lets the form hold that state and
  // the refinement turns it into a message instead of a type error.
  unitPrice: z
    .union([z.number(), z.undefined()])
    .refine((value): value is number => value !== undefined, 'Enter a price')
    .refine((value) => value >= 0, 'Price cannot be negative'),
  // Validated by the field itself rather than here: a row is a rate or an amount
  // and only the row knows which, so zod holds the shape and the cascade below
  // decides whether what it comes to is legal.
  discounts: z.array(
    z.object({
      name: z.string(),
      kind: z.enum(['percent', 'amount']),
      value: z.union([z.number(), z.undefined()]).optional(),
    }),
  ),
});

type FormValues = z.input<typeof schema>;

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
 * The quantity is a decimal, because a shop sells by weight: 1,5 kg of
 * watermelon at Rp 40.000/kg is that line, and typing it as one unit at
 * Rp 60.000 would put a price on the catalogue that the shop never charged.
 *
 * Discounts are a list, and they **cascade**: each one comes off what the ones
 * above it left, which is how a receipt prints them. 55,000 with a 20% promo and
 * a 5% member discount is 11,000 and 2,200 — the member rate reads against the
 * 44,000 the promo left, not the gross — so the order of the rows is part of the
 * answer and the summary below shows the working.
 *
 * A row is a **rate** or a **lump sum**, and the difference outlives this dialog:
 * only the rate is sent for a rate row, so editing the quantity later re-applies
 * it instead of leaving a figure that describes the price this line used to be,
 * while a voucher is off the line and stays where it is. That is deliberately the
 * opposite of an additional charge, where a typed amount wins over the arithmetic.
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
      discounts: [],
    },
  });

  // Re-seed the form whenever the dialog opens on a different line.
  useEffect(() => {
    if (!open) return;

    form.reset({
      productId: item?.product?.id ?? '',
      categoryId: item?.category?.id ?? '',
      name: item?.name ?? '',
      quantity: item ? fromQuantityMilli(item.quantityMilli) : 1,
      unitPrice: item ? fromMinor(item.unitPriceMinor, transaction.currency) : undefined,
      // A line with no discount opens with no rows, not an empty one.
      discounts: toDiscountRows(item?.discounts ?? [], transaction.currency),
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
        quantityMilli: toQuantityMilli(parsed.quantity),
        unitPriceMinor,
        // Rates go over as rates; the API cascades them and derives the money.
        discounts: toDiscountBodies(parsed.discounts, transaction.currency),
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
  const discounts = useWatch({ control: form.control, name: 'discounts' });

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

  // Scaled the same way the body is, then priced by the same helper the API
  // derives with — an emptied quantity field is NaN, which would otherwise reach
  // `toQuantityMilli` and throw where the preview should just read zero.
  const grossMinor = lineGrossMinor(
    Number.isFinite(quantity) ? toQuantityMilli(quantity) : 0,
    toMinor(unitPrice ?? 0, transaction.currency),
  );
  // The same helper the API derives with, so this preview is the figure that will
  // be stored rather than one that usually agrees with it — including the order
  // the rows apply in, which changes what each one is worth.
  const bodies = toDiscountBodies(discounts ?? [], transaction.currency);
  const cascaded = cascadeDiscounts(grossMinor, bodies);

  // The API refuses this rather than clamping it, so say so here instead of
  // showing a negative total and letting the save be the one to explain it.
  const isOverDiscounted = cascaded.lineTotalMinor < 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wider than the other dialogs: the quantity/price/discount row is four
          fields across, two of them money with a currency prefix. */}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit line' : 'Add line'}</DialogTitle>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <DialogBody className="space-y-4">
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
                <p className="text-destructive text-xs">
                  {form.formState.errors.categoryId.message}
                </p>
              ) : pickableCategories.length === 0 ? (
                // Nothing to pick means the line cannot be saved at all, so say the
                // way out here rather than leaving it to a rejected submit.
                <p className="text-muted-foreground text-xs">
                  {noCategoriesOfKindReason(transaction.type)}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              {/* The quantity gets a fixed column wide enough for its own label and
                for a three-decimal weight; the money field takes what is left. */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[8rem_1fr] sm:gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  {/* Not a number input: a weight is typed "1,5" and a browser whose
                    locale uses a dot would reject it outright. */}
                  <Controller
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <DecimalInput
                        id="quantity"
                        fractionDigits={QUANTITY_FRACTION_DIGITS}
                        // Unpadded: "1" stays "1" rather than settling to "1,000",
                        // which in this locale reads as a thousand.
                        minFractionDigits={0}
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        aria-invalid={Boolean(form.formState.errors.quantity)}
                      />
                    )}
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
              </div>

              {/* Below the row, at full width: a message has no room inside a 2.75rem
                column. */}
              {form.formState.errors.quantity ? (
                <p className="text-destructive text-xs">{form.formState.errors.quantity.message}</p>
              ) : null}
              {form.formState.errors.unitPrice ? (
                <p className="text-destructive text-xs">
                  {form.formState.errors.unitPrice.message}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label>Discounts</Label>
              <Controller
                control={form.control}
                name="discounts"
                render={({ field }) => (
                  <LineDiscountsField
                    rows={field.value as DiscountRow[]}
                    onChange={field.onChange}
                    currency={transaction.currency}
                    idPrefix="line-discount"
                  />
                )}
              />
              {(discounts ?? []).length > 1 ? (
                <p className="text-muted-foreground text-xs">
                  Each one comes off what the one above it left, in this order.
                </p>
              ) : null}
            </div>

            <div className="bg-muted grid gap-1.5 rounded-xl px-4 py-3 text-sm">
              {/* Only worth the working when there is something to subtract; an
                undiscounted line just states its total. Each row shows what that
                discount is actually worth here, which is not what its rate alone
                would suggest once anything sits above it. */}
              {cascaded.discountMinor !== 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Before discount</span>
                    <span className="tabular-nums">{money(grossMinor, transaction.currency)}</span>
                  </div>
                  {cascaded.discounts.map((discount, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {(discounts ?? [])[index]?.name.trim() || `Discount ${index + 1}`}
                        {discount.basisPoints !== null ? (
                          <span className="ml-1.5 text-xs">
                            {basisPointsToPercent(discount.basisPoints)}%
                          </span>
                        ) : null}
                      </span>
                      <span className="tabular-nums">
                        −{money(discount.amountMinor, transaction.currency)}
                      </span>
                    </div>
                  ))}
                </>
              ) : null}
              <div
                className={cn(
                  'flex items-center justify-between font-semibold',
                  cascaded.discountMinor !== 0 && 'border-t pt-1.5',
                )}
              >
                <span>Line total</span>
                <span className="tabular-nums">
                  {money(cascaded.lineTotalMinor, transaction.currency)}
                </span>
              </div>
              {isOverDiscounted ? (
                <p className="text-destructive text-xs">
                  These discounts come to more than the line is worth.
                </p>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={mutation.isPending || isOverDiscounted}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
