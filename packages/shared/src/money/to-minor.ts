import { getCurrencyFractionDigits } from './currency-fraction-digits';

/**
 * Convert a human-entered major-unit amount (12.34) into the integer minor units
 * we persist (1234). Rounds half away from zero at the currency's precision.
 */
export const toMinor = (amount: number, currency: string): number => {
  if (!Number.isFinite(amount)) {
    throw new TypeError(`toMinor: amount must be a finite number, received ${amount}`);
  }

  const factor = 10 ** getCurrencyFractionDigits(currency);
  return Math.round(amount * factor);
};
