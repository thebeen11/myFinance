import { fromQuantityMilli, QUANTITY_FRACTION_DIGITS } from './quantity-scale';

export interface FormatQuantityOptions {
  /** BCP 47 locale. Defaults to `id-ID`. */
  readonly locale?: string;
}

/**
 * `Intl.NumberFormat` construction is expensive and a receipt renders one of
 * these per line, so cache by locale the way `getCurrencyFractionDigits` does.
 */
const formatters = new Map<string, Intl.NumberFormat>();

const formatter = (locale: string): Intl.NumberFormat => {
  const cached = formatters.get(locale);
  if (cached) return cached;

  const created = new Intl.NumberFormat(locale, {
    // Trailing zeros trimmed, unlike money: a quantity has no fixed precision,
    // and in id-ID a padded "2,000" reads as two thousand rather than two.
    minimumFractionDigits: 0,
    maximumFractionDigits: QUANTITY_FRACTION_DIGITS,
  });

  formatters.set(locale, created);
  return created;
};

/**
 * Render persisted thousandths as the quantity a human wrote — 1_500 is "1,5".
 *
 * @param quantityMilli The stored quantity, in thousandths of a unit.
 * @param options Locale override; defaults to the app's own.
 * @returns The quantity as text, without a unit — a line does not carry one.
 */
export const formatQuantity = (
  quantityMilli: number,
  options: FormatQuantityOptions = {},
): string => formatter(options.locale ?? 'id-ID').format(fromQuantityMilli(quantityMilli));
