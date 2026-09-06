'use client';

import { getCurrencyFractionDigits } from '@myfinance/shared';

import { DecimalInput, type DecimalInputProps } from '@/components/forms/decimal-input';

export interface CurrencyInputProps extends Omit<
  DecimalInputProps,
  'fractionDigits' | 'minFractionDigits' | 'prefix'
> {
  /** ISO 4217 code. Drives both the prefix and the number of decimals accepted. */
  currency: string;
}

/**
 * A money field that reads the way money is written: grouped digits, the
 * currency's own precision, and the currency code beside it.
 *
 * All of the behaviour is `DecimalInput`'s; this only says what money's
 * precision is. Padded to it on blur, so "1,5" settles as "1,50" — unlike a
 * quantity, which keeps whatever places were typed.
 */
export const CurrencyInput = ({ currency, ...rest }: CurrencyInputProps) => (
  <DecimalInput {...rest} fractionDigits={getCurrencyFractionDigits(currency)} prefix={currency} />
);
