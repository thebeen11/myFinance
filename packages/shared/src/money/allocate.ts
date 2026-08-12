/**
 * Splits an amount across weighted shares so the parts add back to the whole.
 *
 * Largest remainder: every share is floored, then the minor units those floors
 * left behind are handed out one each, largest fractional remainder first, ties
 * to the lowest index. That last property is what makes the result stable enough
 * to store and to re-derive — a caller that wants a particular share favoured on
 * a tie puts it first.
 *
 * `applyBasisPoints` is the wrong tool for this and deliberately not reused: it
 * rounds each share on its own, so N shares of one total do not add back to it.
 * Three equal shares of an odd total lose or gain a minor unit, and a receipt
 * that has been split would stop reconciling with what was paid.
 *
 * @param totalMinor The amount to divide, in minor units. May be zero.
 * @param weights Non-negative weights, one per share. Their scale is irrelevant;
 *   only their proportions matter.
 * @returns One integer per weight, summing to exactly `totalMinor`. All zero
 *   when the weights are all zero — with nothing to go on, nobody is allocated
 *   a share rather than everybody getting an arbitrary one.
 */
export const allocateProportionally = (totalMinor: number, weights: number[]): number[] => {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  if (totalWeight <= 0) return weights.map(() => 0);

  const shares = weights.map((weight) => (totalMinor * weight) / totalWeight);
  const floors = shares.map(Math.floor);

  let remaining = totalMinor - floors.reduce((sum, share) => sum + share, 0);

  const byRemainder = shares
    .map((share, index) => ({ index, remainder: share - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  const allocated = [...floors];

  for (const { index } of byRemainder) {
    if (remaining <= 0) break;
    allocated[index] += 1;
    remaining -= 1;
  }

  return allocated;
};
