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

/**
 * Basis points as a human reads them — 1_100 is 11.
 *
 * Basis points are the wire format because a stored 0.11 drifts; nobody types
 * "1100" for eleven percent, so every form converts at its edges.
 *
 * @param basisPoints The stored rate, or null/undefined for "no rate at all".
 * @returns The percent, or `undefined` when there was no rate — which is what an
 *   empty field holds, and is not the same as a typed zero.
 */
export const basisPointsToPercent = (
  basisPoints: number | null | undefined,
): number | undefined => (basisPoints == null ? undefined : basisPoints / 100);

/**
 * The inverse: a typed percent back to the integer that gets stored.
 *
 * An emptied number input arrives as `NaN`, which is "no rate", not zero — a
 * typed 0% is an instruction and has to stay distinguishable from an untouched
 * field.
 *
 * @param percent The percent as typed, where 11 is 11%.
 * @returns The rate in basis points, or `null` when nothing usable was typed.
 */
export const percentToBasisPoints = (percent: number | null | undefined): number | null =>
  percent == null || !Number.isFinite(percent)
    ? null
    : Math.round((percent * BASIS_POINTS_SCALE) / 100);
