import { applyBasisPoints, BASIS_POINTS_SCALE } from './basis-points';

/** One discount as a caller states it: a rate, or a lump sum, never both. */
export interface LineDiscountInput {
  /** Basis points off what is left at this point in the cascade. Null for a lump sum. */
  basisPoints: number | null;
  /** A typed lump sum in minor units. Null when the rate above derives it. */
  amountMinor: number | null;
}

/** The same discount once the cascade has priced it. */
export interface CascadedDiscount {
  basisPoints: number | null;
  /** What this row actually came to, in minor units. */
  amountMinor: number;
}

export interface CascadedDiscounts {
  /** One per input, in the same order, each carrying the money it came to. */
  discounts: CascadedDiscount[];
  /** Everything taken off the line. Exactly the sum of `discounts`. */
  discountMinor: number;
  /**
   * What is left. **May be negative** when the rows take off more than the line
   * is worth — the caller decides whether that is an error or a preview.
   */
  lineTotalMinor: number;
  /** What the whole cascade comes to as one rate, for a headline figure. */
  effectiveBasisPoints: number;
}

/**
 * Prices a line's discounts, each one off what the ones above it left behind.
 *
 * Cascading, not additive, because that is what a receipt prints: 55_000 with a
 * 20% promo and then a 5% member discount comes to 11_000 and 2_200, since the
 * member rate is read against the 44_000 the promo left — not 2_750.
 *
 * Rates round with `applyBasisPoints`, once each, against the running remainder.
 * That is why `allocateProportionally` is deliberately not used here: nothing is
 * being divided into shares of one total, and every part is subtracted as it is
 * computed, so the parts add back to `discountMinor` by construction.
 *
 * A lump sum is a lump off the **line**, not off a unit: it does not move when
 * the quantity does, which is the whole difference between a voucher and a rate.
 *
 * @param grossMinor quantity × unit price, in minor units.
 * @param discounts The rows in the order they apply. Order changes the answer.
 * @returns The priced rows and the totals derived from them.
 */
export const cascadeDiscounts = (
  grossMinor: number,
  discounts: LineDiscountInput[],
): CascadedDiscounts => {
  let remaining = grossMinor;

  const priced = discounts.map((discount) => {
    const amountMinor =
      discount.basisPoints !== null
        ? applyBasisPoints(remaining, discount.basisPoints)
        : (discount.amountMinor ?? 0);

    remaining -= amountMinor;

    return { basisPoints: discount.basisPoints, amountMinor };
  });

  const discountMinor = grossMinor - remaining;

  return {
    discounts: priced,
    discountMinor,
    lineTotalMinor: remaining,
    effectiveBasisPoints:
      grossMinor > 0 ? Math.round((discountMinor * BASIS_POINTS_SCALE) / grossMinor) : 0,
  };
};
