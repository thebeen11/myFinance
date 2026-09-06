import { formatMoney, formatQuantity, fromMinor } from '@myfinance/shared';

/**
 * The one locale every money string in this app is rendered for.
 *
 * Shared by display and by entry on purpose: `CurrencyInput` groups digits with
 * this locale's separators, so what a user types back reads exactly like what
 * `money()` printed. Two independent locales here would silently disagree —
 * "1.234" is a thousand in id-ID and 1.234 in en-US.
 */
export const MONEY_LOCALE = 'id-ID';

/** Minor units -> localized currency string. Thin re-export so pages import one module. */
export const money = (amountMinor: number, currency: string, signed = false): string =>
  formatMoney(amountMinor, currency, { locale: MONEY_LOCALE, signed });

/**
 * Persisted thousandths -> the quantity a human wrote: 1_500 is "1,5", 2_000 is
 * "2". Thin re-export so pages import one module, and so the locale matches the
 * money beside it on the same line.
 */
export const quantityText = (quantityMilli: number): string =>
  formatQuantity(quantityMilli, { locale: MONEY_LOCALE });

/**
 * `Intl.NumberFormat` construction is expensive and tick formatters run once per
 * tick per render, so cache the instances the way `getCurrencyFractionDigits` does.
 */
const compactFormatters = new Map<string, Intl.NumberFormat>();

const compactFormatter = (currency: string | null): Intl.NumberFormat => {
  const key = currency ?? '';
  const cached = compactFormatters.get(key);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat(MONEY_LOCALE, {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
    ...(currency ? { style: 'currency' as const, currency } : {}),
  });

  compactFormatters.set(key, formatter);
  return formatter;
};

/**
 * APPROXIMATE money — chart axis labels and legends only.
 *
 * Never render a headline, tile, table cell or tooltip value with this. Those
 * must be exact and use `money`. `1_234_567` becomes "Rp 1,2 jt" here, which is
 * a rounded figure by design, and compact notation also overrides the currency's
 * fraction digits.
 *
 * The Indonesian ladder is rb (10^3) / jt (10^6) / M (10^9, *miliar*) / T (10^12)
 * — note `M` is a *billion*, not a million, which is exactly why this defers to
 * `Intl` rather than a hand-written K/M/B suffix table.
 */
export const compactMoney = (amountMinor: number, currency: string): string =>
  compactFormatter(currency.toUpperCase()).format(fromMinor(amountMinor, currency));

/** As `compactMoney` but without the symbol, for axes where it would repeat on every tick. */
export const compactAmount = (amountMinor: number, currency: string): string =>
  compactFormatter(null).format(fromMinor(amountMinor, currency));

/** ISO timestamp -> "10 Aug 2026". */
export const shortDate = (isoDate: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(isoDate));

/** ISO timestamp -> "10 Aug". Recent activity does not need the year. */
export const dayAndMonth = (isoDate: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(isoDate));

/** ISO timestamp -> "Aug". */
export const shortMonth = (isoDate: string): string =>
  new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(isoDate));

/** ISO timestamp -> "August 2026". */
export const longMonth = (isoDate: string): string =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(isoDate),
  );

/** ISO timestamp -> "2026-08-10", the value shape an <input type="date"> wants. */
export const dateInputValue = (isoDate: string): string => isoDate.slice(0, 10);

/**
 * "3 products", "1 product" — a count with its noun, pluralised.
 *
 * The `${n} thing${n === 1 ? '' : 's'}` shape had been written out eight times
 * before this existed. `plural` is for the nouns English does not form that way.
 */
export const countLabel = (count: number, noun: string, plural = `${noun}s`): string =>
  `${count} ${count === 1 ? noun : plural}`;

/** "Rina Wijaya" -> "RW"; a username splits on its dots too, so "rina.w" -> "RW". */
export const initials = (name: string): string => {
  const words = name
    .trim()
    .split(/[\s@.]+/)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
};
