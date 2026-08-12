import { getCurrencyFractionDigits } from './currency-fraction-digits';

/** Convert persisted integer minor units (1234) back to major units (12.34). */
export const fromMinor = (amountMinor: number, currency: string): number => {
  const factor = 10 ** getCurrencyFractionDigits(currency);
  return amountMinor / factor;
};
