import { getCurrencyFractionDigits } from './currency-fraction-digits';
import { fromMinor } from './from-minor';

export interface FormatMoneyOptions {
  /** BCP 47 locale. Defaults to `id-ID`. */
  readonly locale?: string;
  /** Prefix positive amounts with `+`. Useful for income rows. */
  readonly signed?: boolean;
}

/** Render persisted minor units as a localized currency string. */
export const formatMoney = (
  amountMinor: number,
  currency: string,
  options: FormatMoneyOptions = {},
): string => {
  const { locale = 'id-ID', signed = false } = options;
  const fractionDigits = getCurrencyFractionDigits(currency);

  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    // Pinned rather than left to the formatter, which would otherwise ask the
    // runtime's own ICU a second time and could disagree with the divisor
    // `fromMinor` just used — the same split that made IDR render as `Rp 5.279,64`.
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(fromMinor(amountMinor, currency));

  return signed && amountMinor > 0 ? `+${formatted}` : formatted;
};
