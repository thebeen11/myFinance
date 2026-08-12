/** Basis points in one whole — 10% is 1_000, 100% is 10_000. */
export const BASIS_POINTS_SCALE = 10_000;

/**
 * A percentage of a minor-unit amount, as minor units.
 *
 * Basis points rather than a float percent for the same reason money is an
 * integer: a stored 0.1 drifts. Rounds half away from zero, matching `toMinor`,
 * so a figure previewed in the browser and the one the API stores are the same
 * number rather than two that usually agree.
 *
 * @param amountMinor Base amount in minor units.
 * @param basisPoints The rate, where 1_000 is 10%.
 * @returns The rate applied to the base, in minor units.
 */
export const applyBasisPoints = (amountMinor: number, basisPoints: number): number =>
  Math.round((amountMinor * basisPoints) / BASIS_POINTS_SCALE);
