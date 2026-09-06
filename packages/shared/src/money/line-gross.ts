import { QUANTITY_SCALE } from '../quantity/quantity-scale';

/**
 * What a line comes to before its discounts: quantity × unit price.
 *
 * The two operands are integers on different scales, so the division is the
 * **last** step and the rounding happens exactly once. 1.5 kg of watermelon at
 * Rp 40.000/kg is `1_500 × 40_000 / 1_000` — precisely 60_000, where multiplying
 * a float quantity by a price and rounding after would be a number that usually
 * agrees.
 *
 * One helper rather than the arithmetic in four places: the API derives a stored
 * line with it, the receipt scanner prices a draft with it, and both web editors
 * preview with it, so what is shown before saving is what gets stored. Same
 * argument that already put `cascadeDiscounts` here, which takes this as its
 * `grossMinor`.
 *
 * @param quantityMilli The quantity in thousandths of a unit (1.5 is 1_500).
 * @param unitPriceMinor Price for one whole unit, in minor units.
 * @returns The line's gross, in the same minor units.
 */
export const lineGrossMinor = (quantityMilli: number, unitPriceMinor: number): number =>
  Math.round((quantityMilli * unitPriceMinor) / QUANTITY_SCALE);
