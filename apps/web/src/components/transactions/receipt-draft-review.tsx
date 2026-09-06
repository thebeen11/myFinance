'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  basisPointsToPercent,
  cascadeDiscounts,
  fromMinor,
  fromQuantityMilli,
  lineGrossMinor,
  percentToBasisPoints,
  QUANTITY_FRACTION_DIGITS,
  toMinor,
  toQuantityMilli,
} from '@myfinance/shared';
import { AlertTriangle, ChevronDown, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch, Controller } from 'react-hook-form';
import { z } from 'zod';

import type {
  CategoryResponse,
  CreateReceiptDto,
  MerchantResponse,
  ReceiptDraftResponse,
} from '@/api';
import { CurrencyInput } from '@/components/forms/currency-input';
import { DecimalInput } from '@/components/forms/decimal-input';
import { MerchantField, NO_MERCHANT } from '@/components/merchants/merchant-field';
import {
  LineDiscountsField,
  toDiscountBodies,
  toDiscountRows,
  type DiscountRow,
} from '@/components/transactions/line-discounts-field';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { categoriesOfKind, noCategoriesOfKindReason } from '@/lib/category-selection';
import { dateInputValue, money, quantityText } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The scanned receipt, before it is a transaction.
 *
 * Every field the model filled in is editable, because the whole point of the
 * draft step is that the reviewer outranks the reader. Nothing here has been
 * written yet — `onConfirm` is the first write.
 */
const schema = z.object({
  merchantId: z.string(),
  occurredAt: z.string().min(1, 'Pick a date'),
  description: z.string().max(140).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().nullable(),
        // `''` is "nothing picked yet"; the refinement below is what requires it.
        categoryId: z.string(),
        name: z.string().min(1, 'Name the line'),
        // Fractional: a weighed line is "1,5 KG x 40.000", and the draft has to
        // be able to hold what the scanner read off the receipt.
        quantity: z.number().min(0.001),
        /** Major units, as typed. `undefined` is an empty field, not zero. */
        unitPrice: z.number().optional(),
        discounts: z.array(
          z.object({
            name: z.string(),
            kind: z.enum(['percent', 'amount']),
            value: z.union([z.number(), z.undefined()]).optional(),
          }),
        ),
      }),
    )
    .min(1, 'A receipt needs at least one line'),
  charges: z.array(
    z.object({
      name: z.string().min(1, 'Name the charge'),
      percent: z.number().optional(),
      amount: z.number().optional(),
    }),
  ),
});

type FormValues = z.input<typeof schema>;

/** Same NaN guard as the line quantity — an emptied money field is zero, not NaN. */
const chargeAmount = (charge: { amount?: number }): number =>
  Number.isFinite(charge.amount) ? (charge.amount as number) : 0;

interface ReceiptDraftReviewProps {
  draft: ReceiptDraftResponse;
  merchants: MerchantResponse[];
  categories: CategoryResponse[];
  isSubmitting: boolean;
  onBack: () => void;
  onConfirm: (dto: CreateReceiptDto) => void;
}

export const ReceiptDraftReview = ({
  draft,
  merchants,
  categories,
  isSubmitting,
  onBack,
  onConfirm,
}: ReceiptDraftReviewProps) => {
  const { currency } = draft;
  const expenseCategories = categoriesOfKind(categories, 'EXPENSE');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      merchantId: draft.merchant.id ?? NO_MERCHANT,
      occurredAt: draft.occurredAt ? dateInputValue(draft.occurredAt) : '',
      description: draft.description ?? '',
      lines: draft.lines.map((line) => ({
        productId: line.productId ?? null,
        categoryId: line.categoryId ?? '',
        name: line.name,
        quantity: fromQuantityMilli(line.quantityMilli),
        unitPrice: fromMinor(line.unitPriceMinor, currency),
        discounts: toDiscountRows(line.discounts, currency),
      })),
      charges: draft.charges.map((charge) => ({
        name: charge.name,
        percent: basisPointsToPercent(charge.percentBasisPoints),
        amount: fromMinor(charge.amountMinor, currency),
      })),
    },
  });

  const lines = useFieldArray({ control: form.control, name: 'lines' });

  /**
   * Which lines are open on a phone.
   *
   * A ten-line receipt is ~50 stacked fields; collapsed, it is a list you can
   * read at a glance and open where it is wrong. Purely a mobile concern — from
   * `sm` up the fields are laid out in a grid and every line stays expanded, so
   * this state is ignored there rather than duplicated into a breakpoint hook.
   */
  const [expandedLines, setExpandedLines] = useState<ReadonlySet<string>>(new Set());

  const toggleLine = (id: string) =>
    setExpandedLines((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const charges = useFieldArray({ control: form.control, name: 'charges' });

  // `useWatch` rather than form.watch() — the React Compiler lint rule rejects
  // the latter. The totals below have to be live: correcting a misread price is
  // only obviously the right correction if the reconciliation updates with it.
  const watchedLines = useWatch({ control: form.control, name: 'lines' });
  const watchedCharges = useWatch({ control: form.control, name: 'charges' });
  const watchedMerchantId = useWatch({ control: form.control, name: 'merchantId' });

  // A cleared number input reads back as NaN, which would otherwise propagate
  // through the running total and render the reconciliation as "NaN" — the one
  // figure on this screen the reviewer is meant to be able to trust.
  const lineTotalMinor = (line: FormValues['lines'][number]): number => {
    const quantityMilli = Number.isFinite(line.quantity) ? toQuantityMilli(line.quantity) : 0;
    const grossMinor = lineGrossMinor(quantityMilli, toMinor(line.unitPrice ?? 0, currency));

    // The same helper the API cascades with, so a corrected line reconciles
    // against the printed total the way the saved receipt will.
    return cascadeDiscounts(grossMinor, toDiscountBodies(line.discounts, currency)).lineTotalMinor;
  };

  const derivedTotalMinor =
    (watchedLines ?? []).reduce((total, line) => total + lineTotalMinor(line), 0) +
    (watchedCharges ?? []).reduce(
      (total, charge) => total + toMinor(chargeAmount(charge), currency),
      0,
    );

  const printedTotalMinor = draft.printedTotalMinor ?? null;
  const difference = printedTotalMinor === null ? 0 : printedTotalMinor - derivedTotalMinor;
  const missingCategoryCount = (watchedLines ?? []).filter((line) => !line.categoryId).length;

  const handleSubmit = (values: FormValues): void => {
    const parsed = schema.parse(values);

    onConfirm({
      accountId: draft.accountId,
      merchantId: parsed.merchantId === NO_MERCHANT ? null : parsed.merchantId,
      occurredAt: new Date(`${parsed.occurredAt}T00:00:00.000Z`).toISOString(),
      description: parsed.description || undefined,
      items: parsed.lines.map((line) => ({
        productId: line.productId,
        categoryId: line.categoryId,
        name: line.name,
        quantityMilli: toQuantityMilli(line.quantity),
        unitPriceMinor: toMinor(line.unitPrice ?? 0, currency),
        discounts: toDiscountBodies(line.discounts, currency),
      })),
      charges: parsed.charges.map((charge) => ({
        name: charge.name,
        percentBasisPoints: percentToBasisPoints(charge.percent),
        amountMinor: toMinor(chargeAmount(charge), currency),
      })),
    });
  };

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={form.handleSubmit(handleSubmit)}>
      <DialogBody className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="receipt-merchant">Merchant</Label>
            <Controller
              control={form.control}
              name="merchantId"
              render={({ field }) => (
                <MerchantField
                  id="receipt-merchant"
                  value={field.value}
                  onChange={field.onChange}
                  merchants={merchants}
                  suggestedName={draft.merchant.id ? null : draft.merchant.name}
                />
              )}
            />
            {/* The scan read a shop we have never seen. Saying so is more useful than
              an empty picker, and Add turns the printed name into a merchant right
              here, rather than sending the reviewer off to lose this draft. It goes
              once something is picked — including the merchant just created from it,
              which would otherwise still be described as missing. */}
            {!draft.merchant.id && draft.merchant.name && watchedMerchantId === NO_MERCHANT ? (
              <p className="text-muted-foreground text-xs">
                Read as “{draft.merchant.name}”, which is not in your merchants yet — Add creates
                it.
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="receipt-date">Date</Label>
            <Input id="receipt-date" type="date" {...form.register('occurredAt')} />
            {form.formState.errors.occurredAt ? (
              <p className="text-destructive text-xs">{form.formState.errors.occurredAt.message}</p>
            ) : null}
          </div>

          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="receipt-description">Description</Label>
            <Input id="receipt-description" {...form.register('description')} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium">Lines</h3>
            <span className="text-muted-foreground text-xs">
              {lines.fields.length} read from the photo
            </span>
          </div>

          {lines.fields.map((field, index) => {
            const values = watchedLines?.[index] ?? field;
            const isOpen = expandedLines.has(field.id);

            return (
              <div key={field.id} className="bg-muted rounded-lg p-3">
                {/* The collapsed face of the line, on a phone only. */}
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleLine(field.id)}
                  className="flex w-full items-center gap-3 text-left sm:hidden"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {values.name || `Line ${index + 1}`}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {Number.isFinite(values.quantity)
                        ? quantityText(toQuantityMilli(values.quantity))
                        : '—'}{' '}
                      × {money(toMinor(values.unitPrice ?? 0, currency), currency)}
                      {values.categoryId ? '' : ' · needs a category'}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {money(lineTotalMinor(values), currency)}
                  </span>
                  <ChevronDown
                    className={cn('size-4 shrink-0 transition-transform', isOpen && 'rotate-180')}
                    aria-hidden
                  />
                </button>

                <div
                  className={cn(
                    'grid gap-3 sm:grid-cols-12',
                    isOpen ? 'max-sm:mt-3' : 'max-sm:hidden',
                  )}
                >
                  <div className="grid gap-2 sm:col-span-5">
                    <Label htmlFor={`line-name-${index}`} className="text-xs">
                      Item
                    </Label>
                    <Input id={`line-name-${index}`} {...form.register(`lines.${index}.name`)} />
                  </div>

                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor={`line-qty-${index}`} className="text-xs">
                      Qty
                    </Label>
                    {/* Not a number input: a weight is typed "1,5", which a browser
                      whose locale uses a dot would reject outright. */}
                    <Controller
                      control={form.control}
                      name={`lines.${index}.quantity`}
                      render={({ field: qtyField }) => (
                        <DecimalInput
                          id={`line-qty-${index}`}
                          fractionDigits={QUANTITY_FRACTION_DIGITS}
                          minFractionDigits={0}
                          name={qtyField.name}
                          value={qtyField.value}
                          onChange={qtyField.onChange}
                          onBlur={qtyField.onBlur}
                        />
                      )}
                    />
                  </div>

                  <div className="grid gap-2 sm:col-span-5">
                    <Label htmlFor={`line-price-${index}`} className="text-xs">
                      Unit price
                    </Label>
                    <Controller
                      control={form.control}
                      name={`lines.${index}.unitPrice`}
                      render={({ field: priceField }) => (
                        <CurrencyInput
                          id={`line-price-${index}`}
                          currency={currency}
                          value={priceField.value}
                          onChange={priceField.onChange}
                          onBlur={priceField.onBlur}
                        />
                      )}
                    />
                  </div>

                  <div className="grid gap-2 sm:col-span-8">
                    <Label htmlFor={`line-category-${index}`} className="text-xs">
                      Category
                    </Label>
                    <Controller
                      control={form.control}
                      name={`lines.${index}.categoryId`}
                      render={({ field: categoryField }) => (
                        <Select
                          value={categoryField.value || undefined}
                          onValueChange={categoryField.onChange}
                          disabled={expenseCategories.length === 0}
                        >
                          <SelectTrigger id={`line-category-${index}`}>
                            <SelectValue placeholder="Pick a category" />
                          </SelectTrigger>
                          <SelectContent>
                            {expenseCategories.map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <div className="flex items-end justify-between gap-2 sm:col-span-4">
                    <span className="text-sm tabular-nums">
                      {money(lineTotalMinor(values), currency)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${field.name}`}
                      onClick={() => lines.remove(index)}
                    >
                      <Trash2 />
                    </Button>
                  </div>

                  {/* Full width, below the line it belongs to: several discounts stacked
                in a two-column cell would have nowhere to put their labels, and
                the order they are listed in is what the money depends on. */}
                  <div className="grid gap-2 sm:col-span-12">
                    <Label className="text-xs">Discounts</Label>
                    <Controller
                      control={form.control}
                      name={`lines.${index}.discounts`}
                      render={({ field: discountsField }) => (
                        <LineDiscountsField
                          rows={discountsField.value as DiscountRow[]}
                          onChange={discountsField.onChange}
                          currency={currency}
                          idPrefix={`line-discount-${index}`}
                          compact
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {form.formState.errors.lines?.message ? (
            <p className="text-destructive text-xs">{form.formState.errors.lines.message}</p>
          ) : null}

          {expenseCategories.length === 0 ? (
            <p className="text-destructive text-xs">{noCategoriesOfKindReason('EXPENSE')}</p>
          ) : null}
        </div>

        {charges.fields.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Charges</h3>

            {charges.fields.map((field, index) => (
              <div key={field.id} className="bg-muted grid gap-3 rounded-lg p-3 sm:grid-cols-12">
                <div className="grid gap-2 sm:col-span-6">
                  <Label htmlFor={`charge-name-${index}`} className="text-xs">
                    Charge
                  </Label>
                  <Input id={`charge-name-${index}`} {...form.register(`charges.${index}.name`)} />
                </div>

                <div className="grid gap-2 sm:col-span-4">
                  <Label htmlFor={`charge-amount-${index}`} className="text-xs">
                    Amount
                  </Label>
                  <Controller
                    control={form.control}
                    name={`charges.${index}.amount`}
                    render={({ field: amountField }) => (
                      <CurrencyInput
                        id={`charge-amount-${index}`}
                        currency={currency}
                        value={amountField.value}
                        onChange={amountField.onChange}
                        onBlur={amountField.onBlur}
                      />
                    )}
                  />
                </div>

                <div className="flex items-end justify-end sm:col-span-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${field.name}`}
                    onClick={() => charges.remove(index)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* The one thing a reviewer cannot check by eye: whether the parts add up to
          the figure the receipt itself prints. A mismatch names the gap rather
          than blocking the save — the printed total can be the thing misread. */}
        {printedTotalMinor !== null && difference !== 0 ? (
          <div className="border-destructive/40 flex items-start gap-2 rounded-lg border p-3">
            <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-xs">
              These lines come to {money(derivedTotalMinor, currency)}, but the receipt prints{' '}
              {money(printedTotalMinor, currency)} — a gap of{' '}
              {money(Math.abs(difference), currency)}. Check the highlighted figures before saving.
            </p>
          </div>
        ) : null}
      </DialogBody>

      {/* `flex-col`, not the footer's default `flex-col-reverse`: the total is
          what the buttons are agreeing to, so it has to read above them. */}
      <DialogFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <span className="text-muted-foreground">Total</span>{' '}
          <span className="font-medium tabular-nums">{money(derivedTotalMinor, currency)}</span>
          {missingCategoryCount > 0 ? (
            <span className="text-muted-foreground block text-xs">
              {missingCategoryCount} line{missingCategoryCount === 1 ? '' : 's'} still need a
              category.
            </span>
          ) : null}
        </div>

        <div className="flex gap-2 *:flex-1 sm:*:flex-none">
          <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
            Retake
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || missingCategoryCount > 0 || lines.fields.length === 0}
          >
            {isSubmitting ? 'Saving…' : 'Save receipt'}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
};
