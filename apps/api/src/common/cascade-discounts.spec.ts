import { cascadeDiscounts } from '@myfinance/shared';

/**
 * `@myfinance/shared` has no test runner of its own, so its money rules are
 * pinned from here — the same arrangement `currency-fraction-digits.spec.ts` uses.
 *
 * IDR throughout: with no minor unit, every rounding decision is visible in the
 * figures rather than hidden in a cent.
 */
describe('cascadeDiscounts', () => {
  const rate = (basisPoints: number) => ({ basisPoints, amountMinor: null });
  const lump = (amountMinor: number) => ({ basisPoints: null, amountMinor });

  it('takes each rate off what the one above it left, not off the gross', () => {
    // The receipt this was built for: 55_000, 20% product promo, 5% member.
    const result = cascadeDiscounts(55_000, [rate(2_000), rate(500)]);

    expect(result.discounts.map((discount) => discount.amountMinor)).toEqual([11_000, 2_200]);
    // 5% of the 44_000 the promo left. Off the gross it would have been 2_750.
    expect(result.discountMinor).toBe(13_200);
    expect(result.lineTotalMinor).toBe(41_800);
  });

  it('reports what the whole cascade comes to as one rate', () => {
    // 24%, not the 25% adding the two rates together would suggest.
    expect(cascadeDiscounts(55_000, [rate(2_000), rate(500)]).effectiveBasisPoints).toBe(2_400);
  });

  it('depends on the order, because that is what cascading means', () => {
    const promoFirst = cascadeDiscounts(55_000, [rate(2_000), lump(10_000)]);
    const voucherFirst = cascadeDiscounts(55_000, [lump(10_000), rate(2_000)]);

    expect(promoFirst.discounts.map((discount) => discount.amountMinor)).toEqual([11_000, 10_000]);
    expect(voucherFirst.discounts.map((discount) => discount.amountMinor)).toEqual([10_000, 9_000]);
    expect(promoFirst.lineTotalMinor).toBe(34_000);
    expect(voucherFirst.lineTotalMinor).toBe(36_000);
  });

  it('leaves a lump sum where it is, whatever the line is worth', () => {
    // A voucher is off the line, not off a unit.
    expect(cascadeDiscounts(7_000, [lump(1_000)]).discountMinor).toBe(1_000);
    expect(cascadeDiscounts(14_000, [lump(1_000)]).discountMinor).toBe(1_000);
  });

  it('rounds each rate once, against the remainder it applies to', () => {
    // 7% of 6_500 is 455, and IDR has no minor unit to hide the remainder in.
    expect(cascadeDiscounts(6_500, [rate(700)]).discountMinor).toBe(455);
    // Then 3% of the 6_045 left is 181.35, which rounds to 181.
    expect(cascadeDiscounts(6_500, [rate(700), rate(300)]).discounts[1].amountMinor).toBe(181);
  });

  it('keeps the parts adding back to the whole', () => {
    const result = cascadeDiscounts(9_999, [rate(3_333), rate(3_333), rate(3_333)]);
    const summed = result.discounts.reduce((total, discount) => total + discount.amountMinor, 0);

    // Each rate is subtracted as it is computed, so nothing is left over to
    // redistribute — which is why `allocateProportionally` is not used here.
    expect(summed).toBe(result.discountMinor);
    expect(result.discountMinor + result.lineTotalMinor).toBe(9_999);
  });

  it('leaves an undiscounted line exactly as it was', () => {
    expect(cascadeDiscounts(7_000, [])).toEqual({
      discounts: [],
      discountMinor: 0,
      lineTotalMinor: 7_000,
      effectiveBasisPoints: 0,
    });
  });

  it('reports an over-discount honestly rather than clamping it', () => {
    // The caller decides whether a negative total is an error or a preview; a
    // clamp here would hide a mistyped receipt from both of them.
    expect(cascadeDiscounts(7_000, [lump(9_000)]).lineTotalMinor).toBe(-2_000);
  });

  it('has no rate to report on a free line', () => {
    // Nothing to take a percentage of, and no division by zero either.
    expect(cascadeDiscounts(0, [rate(2_000)])).toEqual({
      discounts: [{ basisPoints: 2_000, amountMinor: 0 }],
      discountMinor: 0,
      lineTotalMinor: 0,
      effectiveBasisPoints: 0,
    });
  });
});
