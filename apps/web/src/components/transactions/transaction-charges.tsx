'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BASIS_POINTS_SCALE, applyBasisPoints, fromMinor, toMinor } from '@myfinance/shared';
import { Pencil, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { transactionsUpdate } from '@/api';
import type { TransactionResponse } from '@/api';
import { CurrencyInput } from '@/components/forms/currency-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TableCell, TableFooter, TableRow } from '@/components/ui/table';
import { money } from '@/lib/format';

const schema = z.object({
  charges: z.array(
    z.object({
      name: z.string().min(1, 'Name the charge').max(80),
      /**
       * Percent as a human types it — 11, not 1100. `valueAsNumber` keeps it a
       * number and an emptied field arrives as NaN, which the union turns into
       * "no percentage" rather than a type error.
       */
      percent: z.union([z.number(), z.undefined()]).optional(),
      /** Major units, converted on submit like every other money field. */
      amount: z
        .union([z.number(), z.undefined()])
        .refine((value): value is number => value !== undefined, 'Enter an amount')
        .refine((value) => value >= 0, 'Amount cannot be negative'),
    }),
  ),
});

type FormValues = z.input<typeof schema>;

/**
 * The percentage a row was seeded from, as a whole percent for the form.
 * Basis points are the wire format; nobody types "1100" for eleven percent.
 */
const toPercent = (basisPoints: number | null | undefined): number | undefined =>
  basisPoints == null ? undefined : basisPoints / 100;

const toBasisPoints = (percent: number | undefined): number | null =>
  percent === undefined || !Number.isFinite(percent)
    ? null
    : Math.round((percent * BASIS_POINTS_SCALE) / 100);

/** The form's view of the server's rows — the shape the effect and Cancel both reset to. */
const toFormValues = (transaction: TransactionResponse | undefined): FormValues => ({
  charges: (transaction?.charges ?? []).map((charge) => ({
    name: charge.name,
    percent: toPercent(charge.percentBasisPoints),
    amount: fromMinor(charge.amountMinor, transaction?.currency ?? 'IDR'),
  })),
});

/**
 * Tax, service charge, delivery — what a receipt adds on top of what was bought.
 *
 * Saved as a whole set rather than a row at a time, because that is how they are
 * read off a receipt: all of them, once, after the lines are in. The API has no
 * per-charge endpoint either — a submit replaces the entire array.
 *
 * The percentage only ever *seeds* the amount, and seeds it once — off the items
 * subtotal plus every charge above it, the way a receipt stacks tax on top of a
 * service charge. From there the amount is yours: real receipts round where they
 * like, and the printed figure is the one that has to be recorded, so this never
 * re-derives an amount behind your back.
 *
 * State lives in a hook rather than the component because the "Add charge" button
 * sits in the page's section header, next to "Add line", while the rows it appends
 * render in the lines table's footer.
 */
export const useTransactionCharges = (transaction: TransactionResponse | undefined) => {
  const queryClient = useQueryClient();

  // Hidden until someone actually writes: the inputs and the save button are the
  // only things on this section that cost vertical space, so they are not offered
  // until asked for.
  const [isEditing, setIsEditing] = useState(false);

  const subtotalMinor = (transaction?.items ?? []).reduce(
    (total, item) => total + item.lineTotalMinor,
    0,
  );
  const currency = transaction?.currency ?? 'IDR';

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { charges: [] },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'charges' });

  // Re-seed whenever the server's copy changes — a save returns the rows with
  // their new ids, and an edit elsewhere must not be overwritten by a stale form.
  useEffect(() => {
    form.reset(toFormValues(transaction));
  }, [transaction, form]);

  // `useWatch`, not `form.watch()` — the React Compiler lint rule rejects the latter.
  const charges = useWatch({ control: form.control, name: 'charges' });

  const chargesMinor = (charges ?? []).reduce(
    (total, charge) => total + toMinor(charge?.amount ?? 0, currency),
    0,
  );

  /** What a percentage on `index` applies to: the lines, plus the charges above it. */
  const baseFor = (index: number): number =>
    (charges ?? [])
      .slice(0, index)
      .reduce((total, charge) => total + toMinor(charge?.amount ?? 0, currency), subtotalMinor);

  const handlePercentChange = (index: number, percent: number): void => {
    if (!Number.isFinite(percent)) return;

    // Same helper a line's discount derives with, so the two percentage fields on
    // this page cannot round differently — only *when* they apply differs.
    const seeded = applyBasisPoints(baseFor(index), toBasisPoints(percent) ?? 0);
    form.setValue(`charges.${index}.amount`, fromMinor(seeded, currency));
  };

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!transaction) return;

      const parsed = schema.parse(values);

      return transactionsUpdate({
        path: { id: transaction.id },
        body: {
          charges: parsed.charges.map((charge) => ({
            name: charge.name,
            percentBasisPoints: toBasisPoints(charge.percent),
            amountMinor: toMinor(charge.amount, transaction.currency),
          })),
        },
        throwOnError: true,
      });
    },
    onSuccess: async () => {
      // The receipt total moved, so the list, the dashboard and the balances all did.
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setIsEditing(false);
      toast.success('Charges saved');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Could not save the charges');
    },
  });

  const addCharge = useCallback((): void => {
    setIsEditing(true);
    append({ name: '', percent: undefined, amount: undefined });
  }, [append]);

  const startEditing = useCallback((): void => setIsEditing(true), []);

  const cancel = useCallback((): void => {
    form.reset(toFormValues(transaction));
    setIsEditing(false);
  }, [form, transaction]);

  return {
    form,
    fields,
    remove,
    isEditing,
    addCharge,
    startEditing,
    cancel,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    isPending: mutation.isPending,
    subtotalMinor,
    chargesMinor,
    handlePercentChange,
  };
};

export type TransactionCharges = ReturnType<typeof useTransactionCharges>;

interface TransactionChargesFooterProps {
  transaction: TransactionResponse;
  charges: TransactionCharges;
}

/**
 * The receipt's tail, rendered as the lines table's own footer rather than a
 * second card: subtotal, one row per charge, total. Must be a direct child of
 * `<Table>`.
 */
export const TransactionChargesFooter = ({
  transaction,
  charges,
}: TransactionChargesFooterProps) => {
  const { form, fields, remove, isEditing, startEditing, cancel } = charges;
  const savedCharges = transaction.charges;
  const totalMinor = charges.subtotalMinor + charges.chargesMinor;

  // An empty receipt already says so in the table body; a footer under it would
  // only be a Total of nothing.
  if (transaction.items.length === 0 && savedCharges.length === 0 && !isEditing) return null;

  const hasChargeRows = savedCharges.length > 0 || isEditing;

  return (
    <TableFooter>
      {hasChargeRows ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={5} className="text-muted-foreground pl-5 font-normal">
            Subtotal from lines
          </TableCell>
          <TableCell className="text-right font-normal tabular-nums">
            {money(charges.subtotalMinor, transaction.currency)}
          </TableCell>
          <TableCell className="pr-5" />
        </TableRow>
      ) : null}

      {isEditing
        ? null
        : savedCharges.map((charge) => (
            <TableRow key={charge.id} className="hover:bg-transparent">
              <TableCell colSpan={5} className="pl-5 font-normal">
                {charge.name}
                {charge.percentBasisPoints == null ? null : (
                  <span className="text-muted-foreground ml-2 text-xs">
                    {charge.percentBasisPoints / 100}%
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right font-normal tabular-nums">
                {money(charge.amountMinor, transaction.currency)}
              </TableCell>
              <TableCell className="py-1 pr-5 text-right">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${charge.name}`}
                  onClick={startEditing}
                >
                  <Pencil />
                </Button>
              </TableCell>
            </TableRow>
          ))}

      {isEditing ? (
        <TableRow className="hover:bg-transparent">
          {/* One cell, because a <form> may not span several <tr>s — inside a <td>
              it is valid, so the whole field array submits as one form. */}
          <TableCell colSpan={7} className="p-0 whitespace-normal">
            <form className="space-y-4 p-5" onSubmit={charges.submit}>
              <ul className="space-y-3">
                {fields.map((field, index) => (
                  <li
                    key={field.id}
                    className="grid grid-cols-[1fr_5rem_9rem_auto] items-end gap-2"
                  >
                    <div className="grid gap-2">
                      {/* Labelled once, on the first row: repeating them down the list
                          is noise, but a screen reader still needs every field named. */}
                      <Label
                        htmlFor={`charge-name-${index}`}
                        className={index === 0 ? undefined : 'sr-only'}
                      >
                        Charge
                      </Label>
                      <Input
                        id={`charge-name-${index}`}
                        placeholder="Service charge"
                        autoComplete="off"
                        {...form.register(`charges.${index}.name`)}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label
                        htmlFor={`charge-percent-${index}`}
                        className={index === 0 ? undefined : 'sr-only'}
                      >
                        %
                      </Label>
                      <Controller
                        control={form.control}
                        name={`charges.${index}.percent`}
                        render={({ field: percentField }) => (
                          <Input
                            id={`charge-percent-${index}`}
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            placeholder="—"
                            value={percentField.value ?? ''}
                            onBlur={percentField.onBlur}
                            onChange={(event) => {
                              const percent = event.target.valueAsNumber;
                              percentField.onChange(Number.isFinite(percent) ? percent : undefined);
                              charges.handlePercentChange(index, percent);
                            }}
                          />
                        )}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label
                        htmlFor={`charge-amount-${index}`}
                        className={index === 0 ? undefined : 'sr-only'}
                      >
                        Amount
                      </Label>
                      <Controller
                        control={form.control}
                        name={`charges.${index}.amount`}
                        render={({ field: amountField }) => (
                          <CurrencyInput
                            id={`charge-amount-${index}`}
                            currency={transaction.currency}
                            name={amountField.name}
                            value={amountField.value}
                            onChange={amountField.onChange}
                            onBlur={amountField.onBlur}
                            aria-invalid={Boolean(form.formState.errors.charges?.[index]?.amount)}
                          />
                        )}
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="mb-1"
                      aria-label={`Remove charge ${index + 1}`}
                      onClick={() => remove(index)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={cancel}>
                  Cancel
                </Button>
                <Button type="submit" disabled={charges.isPending || !form.formState.isDirty}>
                  {charges.isPending ? 'Saving…' : 'Save charges'}
                </Button>
              </div>
            </form>
          </TableCell>
        </TableRow>
      ) : null}

      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={5} className="pl-5 font-semibold">
          Total
        </TableCell>
        <TableCell className="text-right font-semibold tabular-nums">
          {money(totalMinor, transaction.currency)}
        </TableCell>
        <TableCell className="pr-5" />
      </TableRow>
    </TableFooter>
  );
};
