import { normaliseName } from './normalise-name';

/** Just enough of a merchant row to recognise it in a receipt header. */
export interface CatalogueMerchant {
  id: string;
  name: string;
}

/**
 * Shorter than this, a substring match is noise: "AB" is inside half a catalogue.
 */
const MIN_SUBSTRING_LENGTH = 3;

/**
 * The user's merchant that a scanned receipt header refers to, or `undefined`.
 *
 * Deliberately conservative, and deliberately never creates anything: a wrong
 * merchant silently mis-routes a whole basket through the product catalogue,
 * which is worse than no merchant at all. When nothing matches, the caller keeps
 * the scanned name as a label and lets the user pick.
 *
 * Longest candidate first on the substring pass, because a receipt header
 * carries extra words ("PT INDOMARCO PRISMATAMA — CABANG DEPOK") and the longest
 * catalogue name inside it is the most specific reading.
 */
export const matchMerchant = (
  scannedName: string | null,
  merchants: CatalogueMerchant[],
): CatalogueMerchant | undefined => {
  const scanned = scannedName ? normaliseName(scannedName) : '';

  if (!scanned) return undefined;

  const exact = merchants.find((merchant) => normaliseName(merchant.name) === scanned);

  if (exact) return exact;

  return [...merchants]
    .sort((a, b) => normaliseName(b.name).length - normaliseName(a.name).length)
    .find((merchant) => {
      const candidate = normaliseName(merchant.name);

      if (candidate.length < MIN_SUBSTRING_LENGTH) return false;

      return scanned.includes(candidate) || candidate.includes(scanned);
    });
};
