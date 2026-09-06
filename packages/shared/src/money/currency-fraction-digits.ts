/**
 * Currencies whose minor unit is not the two decimal places of the majority.
 *
 * Hand-held on purpose, and generated from a full-ICU Node rather than typed
 * from memory. This used to be resolved through `Intl` at runtime, until a phone
 * whose ICU data answered `2` for IDR — where CLDR overrides ISO 4217 down to
 * `0` — rendered every rupiah figure a hundred times small and, through
 * `toMinor`, persisted amounts a hundred times large. The scale of a stored
 * integer is a property of the data, so it cannot depend on which ICU data the
 * runtime reading it happens to ship.
 *
 * `apps/api/src/common/currency-fraction-digits.spec.ts` re-derives these from
 * `Intl` and fails if CLDR moves under us.
 */
const NO_MINOR_UNIT = [
  'ADP',
  'AFN',
  'ALL',
  'BIF',
  'BYR',
  'CLP',
  'COP',
  'DJF',
  'ESP',
  'GNF',
  'HUF',
  'IDR',
  'IQD',
  'IRR',
  'ISK',
  'ITL',
  'JPY',
  'KMF',
  'KPW',
  'KRW',
  'LAK',
  'LBP',
  'LUF',
  'MGA',
  'MGF',
  'MMK',
  'MRO',
  'PKR',
  'PYG',
  'RWF',
  'SLL',
  'SOS',
  'STD',
  'SYP',
  'TMM',
  'TRL',
  'UGX',
  'UYI',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
  'YER',
  'ZMK',
  'ZWD',
] as const;

/** Mostly the Gulf dinars, which divide into 1000. */
const THREE_DECIMAL = ['BHD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'] as const;

/** Accounting units rather than cash: Chile's UF and Uruguay's indexed peso. */
const FOUR_DECIMAL = ['CLF', 'UYW'] as const;

const withDigits = (codes: readonly string[], digits: number): [string, number][] =>
  codes.map((code) => [code, digits]);

/** Every currency that is not two decimal places, by ISO 4217 code. */
export const CURRENCY_FRACTION_DIGITS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries([
    ...withDigits(NO_MINOR_UNIT, 0),
    ...withDigits(THREE_DECIMAL, 3),
    ...withDigits(FOUR_DECIMAL, 4),
  ]),
);

/**
 * Number of decimal places a currency uses (USD -> 2, IDR -> 0, KWD -> 3).
 *
 * @param currency ISO 4217 code, in any case.
 * @returns The currency's scale; 2 for anything unlisted, which is both the
 *   majority and what an unknown code should fall back to.
 */
export const getCurrencyFractionDigits = (currency: string): number =>
  CURRENCY_FRACTION_DIGITS[currency.toUpperCase()] ?? 2;
