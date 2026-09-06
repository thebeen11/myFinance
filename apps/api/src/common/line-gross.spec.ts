import {
  formatQuantity,
  fromQuantityMilli,
  lineGrossMinor,
  toQuantityMilli,
} from '@myfinance/shared';

/**
 * `@myfinance/shared` has no test runner of its own, so the quantity rules are
 * pinned from here — the same arrangement `cascade-discounts.spec.ts` uses.
 *
 * IDR figures throughout: with no minor unit, every rounding decision is visible
 * in the number rather than hidden in a cent.
 */
describe('lineGrossMinor', () => {
  it('prices a whole quantity exactly', () => {
    expect(lineGrossMinor(2_000, 3_500)).toBe(7_000);
  });

  it('prices a weighed line at what the receipt says', () => {
    // The case this was built for: 1,5 kg of watermelon at Rp 40.000/kg.
    expect(lineGrossMinor(toQuantityMilli(1.5), 40_000)).toBe(60_000);
  });

  it('carries a three-decimal weight without losing a gram', () => {
    // 0,825 kg at Rp 12.000/kg — 9_900 exactly, not 9_899.999…
    expect(lineGrossMinor(825, 12_000)).toBe(9_900);
  });

  it('rounds a fraction of a minor unit once, at the end', () => {
    // 0,333 kg at Rp 1.000/kg is 333 rupiah; the division is the last step, so
    // the half-rupiah never reaches the caller.
    expect(lineGrossMinor(333, 1_000)).toBe(333);
    // 1,5 units at Rp 3.333 — 4_999,5, rounded half away from zero like `toMinor`.
    expect(lineGrossMinor(1_500, 3_333)).toBe(5_000);
  });

  it('works the same on a two-decimal currency, whose scale it never sees', () => {
    // $4.99/kg × 2.5 kg = $12.475, which is 1_248 cents.
    expect(lineGrossMinor(2_500, 499)).toBe(1_248);
  });

  it('is zero for a free line rather than NaN', () => {
    expect(lineGrossMinor(1_500, 0)).toBe(0);
  });
});

describe('toQuantityMilli', () => {
  it('scales a typed quantity to thousandths', () => {
    expect(toQuantityMilli(1.5)).toBe(1_500);
    expect(toQuantityMilli(0.825)).toBe(825);
    expect(toQuantityMilli(2)).toBe(2_000);
  });

  it('rounds half away from zero, matching toMinor', () => {
    expect(toQuantityMilli(0.0005)).toBe(1);
    expect(toQuantityMilli(1.23456)).toBe(1_235);
  });

  it('refuses a non-finite quantity rather than storing NaN', () => {
    expect(() => toQuantityMilli(Number.NaN)).toThrow(TypeError);
  });

  it('round-trips through fromQuantityMilli', () => {
    expect(fromQuantityMilli(toQuantityMilli(1.5))).toBe(1.5);
  });
});

describe('formatQuantity', () => {
  it('drops the trailing zeros a money field would keep', () => {
    // "2,000" would read as two thousand in id-ID, which is the whole reason
    // this does not reuse the money formatter.
    expect(formatQuantity(2_000)).toBe('2');
  });

  it('renders a weight with the locale decimal separator', () => {
    expect(formatQuantity(1_500)).toBe('1,5');
    expect(formatQuantity(825)).toBe('0,825');
  });
});
