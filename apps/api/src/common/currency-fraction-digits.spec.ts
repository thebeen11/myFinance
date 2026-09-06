import {
  CURRENCY_FRACTION_DIGITS,
  formatMoney,
  fromMinor,
  getCurrencyFractionDigits,
  toMinor,
} from '@myfinance/shared';

describe('getCurrencyFractionDigits', () => {
  it('gives rupiah no minor unit', () => {
    expect(getCurrencyFractionDigits('IDR')).toBe(0);
  });

  it('gives the two-decimal majority two', () => {
    expect(getCurrencyFractionDigits('USD')).toBe(2);
    expect(getCurrencyFractionDigits('EUR')).toBe(2);
  });

  it('gives the Gulf dinars three', () => {
    expect(getCurrencyFractionDigits('KWD')).toBe(3);
  });

  it('accepts a lowercase code', () => {
    expect(getCurrencyFractionDigits('idr')).toBe(0);
  });

  it('falls back to two for a code it does not know', () => {
    expect(getCurrencyFractionDigits('ZZZ')).toBe(2);
  });
});

describe('CURRENCY_FRACTION_DIGITS', () => {
  // The table is hand-held precisely so it cannot follow the runtime, which is
  // what broke on a reduced-ICU phone. This guard is the other half of that
  // bargain: under a full-ICU runtime the table must still equal what CLDR says,
  // so it fails loudly if CLDR moves rather than drifting quietly.
  it.each(Object.keys(CURRENCY_FRACTION_DIGITS))('matches CLDR for %s', (code) => {
    const fromIntl = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
    }).resolvedOptions().maximumFractionDigits;

    expect(CURRENCY_FRACTION_DIGITS[code]).toBe(fromIntl);
  });

  it('lists every currency Intl considers unusual, and no others', () => {
    const unusual: string[] = [];
    for (let a = 0; a < 26; a += 1) {
      for (let b = 0; b < 26; b += 1) {
        for (let c = 0; c < 26; c += 1) {
          const code = String.fromCharCode(65 + a, 65 + b, 65 + c);
          let digits: number | undefined;
          try {
            digits = new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: code,
            }).resolvedOptions().maximumFractionDigits;
          } catch {
            continue;
          }
          if (digits !== 2) unusual.push(code);
        }
      }
    }

    expect(Object.keys(CURRENCY_FRACTION_DIGITS).sort()).toEqual(unusual.sort());
  });
});

describe('formatMoney', () => {
  // The separator Intl emits is U+00A0, spelled out here because a plain space
  // looks identical in an editor and fails with a baffling diff.
  it('renders rupiah minor units as whole rupiah', () => {
    expect(formatMoney(527_964, 'IDR', { locale: 'id-ID' })).toBe('Rp\u00a0527.964');
  });

  it('keeps two decimals for a two-decimal currency', () => {
    expect(formatMoney(123_456, 'USD', { locale: 'en-US' })).toBe('$1,234.56');
  });

  it('signs a positive amount when asked', () => {
    expect(formatMoney(527_964, 'IDR', { locale: 'id-ID', signed: true })).toBe('+Rp\u00a0527.964');
  });
});

describe('minor-unit round trip', () => {
  it('leaves a rupiah amount whole', () => {
    expect(toMinor(527_964, 'IDR')).toBe(527_964);
    expect(fromMinor(527_964, 'IDR')).toBe(527_964);
  });

  it('scales a two-decimal currency by a hundred', () => {
    expect(toMinor(1_234.56, 'USD')).toBe(123_456);
    expect(fromMinor(123_456, 'USD')).toBe(1_234.56);
  });
});
