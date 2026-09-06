'use client';

import { basisPointsToPercent, fromMinor, percentToBasisPoints, toMinor } from '@myfinance/shared';
import { Plus, X } from 'lucide-react';

import { CurrencyInput } from '@/components/forms/currency-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * One discount as the form holds it.
 *
 * `kind` is what makes the two boxes one field rather than two: a row is a rate
 * **or** a lump sum, and which one it is decides how it behaves for the rest of
 * its life — a rate re-derives when the line moves, a voucher does not. Keeping
 * both in one `value` is what stops a row claiming to be both.
 */
export interface DiscountRow {
  name: string;
  kind: 'percent' | 'amount';
  /** A percent when `kind` is percent, major units when it is amount. */
  value?: number;
}

/** The wire shape, which is also what `cascadeDiscounts` prices. */
interface DiscountBody {
  name: string | null;
  basisPoints: number | null;
  amountMinor: number | null;
}

const emptyRow: DiscountRow = { name: '', kind: 'percent', value: undefined };

/**
 * A stored or drafted row, which the generated client types loosely: a nullable
 * field the API always sends is still optional on the wire.
 */
interface StoredDiscount {
  name?: string | null;
  basisPoints?: number | null;
  amountMinor?: number | null;
}

/**
 * The stored or drafted rows as the form holds them.
 *
 * @param discounts Rows carrying exactly one of `basisPoints` and `amountMinor`.
 * @param currency The line's currency, for scaling a lump sum to major units.
 */
export const toDiscountRows = (discounts: StoredDiscount[], currency: string): DiscountRow[] =>
  discounts.map((discount) => ({
    name: discount.name ?? '',
    kind: discount.basisPoints == null ? 'amount' : 'percent',
    value:
      discount.basisPoints == null
        ? fromMinor(discount.amountMinor ?? 0, currency)
        : basisPointsToPercent(discount.basisPoints),
  }));

/**
 * The form's rows as the API takes them — and as the preview prices them.
 *
 * A row with nothing typed in it is dropped rather than sent as a zero: an empty
 * row is someone part-way through adding one, not an instruction to take nothing
 * off. Order is preserved, because order is the arithmetic.
 */
export const toDiscountBodies = (rows: DiscountRow[], currency: string): DiscountBody[] =>
  rows
    .filter((row) => row.value !== undefined && Number.isFinite(row.value))
    .map((row) => ({
      name: row.name.trim() || null,
      basisPoints: row.kind === 'percent' ? percentToBasisPoints(row.value) : null,
      amountMinor: row.kind === 'amount' ? toMinor(row.value as number, currency) : null,
    }));

interface LineDiscountsFieldProps {
  rows: DiscountRow[];
  onChange: (rows: DiscountRow[]) => void;
  currency: string;
  /** Prefix for the generated input ids, so several lines can share a page. */
  idPrefix: string;
  /** Compact drops the labels, for a row inside a table. */
  compact?: boolean;
}

/**
 * The discounts on one line, in the order they apply.
 *
 * They **cascade** — each one comes off what the ones above it left — so the
 * order is data and the rows are dragged into it by adding them in the order the
 * receipt prints. That is also why there is no total here: what each row is worth
 * depends on the rows above it, and the caller already renders the breakdown
 * beside the line total it feeds.
 *
 * Controlled rather than a `useFieldArray` of its own, so the two callers keep
 * owning their forms and this stays the same field in both.
 */
export const LineDiscountsField = ({
  rows,
  onChange,
  currency,
  idPrefix,
  compact = false,
}: LineDiscountsFieldProps) => {
  const update = (index: number, patch: Partial<DiscountRow>): void =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  return (
    <div className="grid gap-2">
      {rows.map((row, index) => (
        // Index as the key: these rows have no identity of their own and are
        // never reordered, only appended to and removed from the end inwards.
        // `w-24` + `w-32` of fixed columns left the label field ~60px inside a
        // 358px dialog, so below `sm` the label takes its own row and the kind
        // and value share the next.
        <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:flex">
          <div className="col-span-3 grid min-w-0 gap-1.5 sm:col-span-1 sm:flex-1">
            {!compact && index === 0 ? (
              <span className="text-muted-foreground text-xs">Label</span>
            ) : null}
            <Input
              id={`${idPrefix}-name-${index}`}
              placeholder="Member"
              value={row.name}
              onChange={(event) => update(index, { name: event.target.value })}
            />
          </div>

          <div className="grid gap-1.5 sm:w-24 sm:shrink-0">
            {!compact && index === 0 ? (
              <span className="text-muted-foreground text-xs">Off by</span>
            ) : null}
            <Select
              value={row.kind}
              onValueChange={(kind) =>
                // The typed figure means something different under each: 20 as a
                // percent is not 20 as money, so switching clears it rather than
                // reinterpreting it.
                update(index, { kind: kind as DiscountRow['kind'], value: undefined })
              }
            >
              <SelectTrigger id={`${idPrefix}-kind-${index}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">%</SelectItem>
                <SelectItem value="amount">Amount</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5 sm:w-32 sm:shrink-0">
            {!compact && index === 0 ? (
              <span className="text-muted-foreground text-xs">Value</span>
            ) : null}
            {row.kind === 'percent' ? (
              <Input
                id={`${idPrefix}-value-${index}`}
                type="number"
                min={0}
                max={100}
                step="any"
                inputMode="decimal"
                placeholder="—"
                value={row.value ?? ''}
                onChange={(event) => {
                  const percent = event.target.valueAsNumber;
                  update(index, { value: Number.isFinite(percent) ? percent : undefined });
                }}
              />
            ) : (
              <CurrencyInput
                id={`${idPrefix}-value-${index}`}
                currency={currency}
                value={row.value}
                onChange={(value) => update(index, { value })}
              />
            )}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove discount ${index + 1}`}
            onClick={() => onChange(rows.filter((_, at) => at !== index))}
          >
            <X />
          </Button>
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange([...rows, emptyRow])}
        >
          <Plus />
          Add discount
        </Button>
      </div>
    </div>
  );
};
