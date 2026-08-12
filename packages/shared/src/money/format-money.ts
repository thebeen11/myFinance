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

  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(fromMinor(amountMinor, currency));

  return signed && amountMinor > 0 ? `+${formatted}` : formatted;
};
