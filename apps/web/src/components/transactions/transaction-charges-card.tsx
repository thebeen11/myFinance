'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BASIS_POINTS_SCALE, applyBasisPoints, fromMinor, toMinor } from '@myfinance/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { transactionsUpdate } from '@/api';
import type { TransactionResponse } from '@/api';
import { CurrencyInput } from '@/components/forms/currency-input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

interface TransactionChargesCardProps {
  transaction: TransactionResponse;
}

/**
 * Tax, service charge, delivery — what a receipt adds on top of what was bought.
 *
 * Saved as a whole set rather than a row at a time, because that is how they are
 * read off a receipt: all of them, once, after the lines are in.
 *
 * The percentage only ever *seeds* the amount, and seeds it once — off the items
 * subtotal plus every charge above it, the way a receipt stacks tax on top of a
 * service charge. From there the amount is yours: real receipts round where they
 * like, and the printed figure is the one that has to be recorded, so this never
 * re-derives an amount behind your back.
 */
export const TransactionChargesCard = ({ transaction }: TransactionChargesCardProps) => {
  const queryClient = useQueryClient();

  const subtotalMinor = transaction.items.reduce((total, item) => total + item.lineTotalMinor, 0);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { charges: [] },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'charges' });

  // Re-seed whenever the server's copy changes — a save returns the rows with
  // their new ids, and an edit elsewhere must not be overwritten by a stale form.
  useEffect(() => {
    form.reset({
      charges: transaction.charges.map((charge) => ({
        name: charge.name,
        percent: toPercent(charge.percentBasisPoints),
        amount: fromMinor(charge.amountMinor, transaction.currency),
      })),
    });
  }, [transaction.charges, transaction.currency, form]);

  // `useWatch`, not `form.watch()` — the React Compiler lint rule rejects the latter.
  const charges = useWatch({ control: form.control, name: 'charges' });

  const chargesMinor = (charges ?? []).reduce(
    (total, charge) => total + toMinor(charge?.amount ?? 0, transaction.currency),
    0,
  );

  /** What a percentage on `index` applies to: the lines, plus the charges above it. */
  const baseFor = (index: number): number =>
    (charges ?? [])
      .slice(0, index)
      .reduce(
        (total, charge) => total + toMinor(charge?.amount ?? 0, transaction.currency),
        subtotalMinor,
      );

  const handlePercentChange = (index: number, percent: number): void => {
    if (!Number.isFinite(percent)) return;

    // Same helper a line's discount derives with, so the two percentage fields on
    // this page cannot round differently — only *when* they apply differs.
    const seeded = applyBasisPoints(baseFor(index), toBasisPoints(percent) ?? 0);
    form.setValue(`charges.${index}.amount`, fromMinor(seeded, transaction.currency));
  };

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
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
      toast.success('Charges saved');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Could not save the charges');
    },
  });

  return (
    <Card>
      <form
        className="space-y-4 px-(--card-spacing)"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        {fields.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm font-medium">No charges on this receipt</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Add tax, service charge or delivery — anything paid on top of the lines.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {fields.map((field, index) => (
              <li key={field.id} className="grid grid-cols-[1fr_5rem_9rem_auto] items-end gap-2">
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
                          handlePercentChange(index, percent);
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
        )}

        <div className="bg-muted grid gap-1.5 rounded-xl px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Subtotal from lines</span>
            <span className="tabular-nums">{money(subtotalMinor, transaction.currency)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Additional charges</span>
            <span className="tabular-nums">{money(chargesMinor, transaction.currency)}</span>
          </div>
          <div className="flex items-center justify-between border-t pt-1.5 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">
              {money(subtotalMinor + chargesMinor, transaction.currency)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => append({ name: '', percent: undefined, amount: undefined })}
          >
            <Plus data-icon="inline-start" />
            Add charge
          </Button>
          <Button type="submit" disabled={mutation.isPending || !form.formState.isDirty}>
            {mutation.isPending ? 'Saving…' : 'Save charges'}
          </Button>
        </div>
      </form>
    </Card>
  );
};
