/** Thousandths in one whole unit — 1.5 kg is 1_500, two tins are 2_000. */
export const QUANTITY_SCALE = 1_000;

/** Decimals a quantity may carry, which is what `QUANTITY_SCALE` is ten to. */
export const QUANTITY_FRACTION_DIGITS = 3;

/**
 * Convert a human-entered quantity (1.5) into the integer thousandths we persist
 * (1500). Rounds half away from zero, matching `toMinor`.
 *
 * Three decimals because that is what a shop scale prints: grams against a
 * per-kilo price, millilitres against a per-litre one. An integer for the same
 * reason money is one — a stored 0.1 drifts, and this number gets multiplied by
 * a price.
 *
 * @param quantity The quantity as a human writes it, in whole units.
 * @returns The quantity in thousandths of a unit.
 * @throws TypeError when handed something that is not a finite number.
 */
export const toQuantityMilli = (quantity: number): number => {
  if (!Number.isFinite(quantity)) {
    throw new TypeError(`toQuantityMilli: quantity must be a finite number, received ${quantity}`);
  }

  return Math.round(quantity * QUANTITY_SCALE);
};

/** Convert persisted thousandths (1500) back to whole units (1.5). */
export const fromQuantityMilli = (quantityMilli: number): number => quantityMilli / QUANTITY_SCALE;
