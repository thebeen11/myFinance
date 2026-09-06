import { normaliseName } from './normalise-name';

/** Just enough of a product row to recognise it in a receipt line. */
export interface CatalogueProduct {
  id: string;
  code: string | null;
  name: string;
  categoryId: string | null;
}

/** What a scanned line offers to identify itself with. */
export interface ScannedLine {
  code: string | null;
  name: string;
}

/** See `matchMerchant` — below this, a substring match is noise. */
const MIN_SUBSTRING_LENGTH = 3;

/**
 * The catalogue product a scanned receipt line was bought as, or `undefined`.
 *
 * Callers must pass only products of the *matched merchant*: `Product.code` is
 * unique within a merchant and not globally, so an "A-01" from another shop is a
 * different thing that happens to share a label.
 *
 * The code wins over the name because it is what the shop itself uses to tell two
 * near-identical items apart; a name is what its printer had room for.
 */
export const matchProduct = <T extends CatalogueProduct>(
  line: ScannedLine,
  products: T[],
): T | undefined => {
  const code = line.code?.trim().toLowerCase();

  if (code) {
    const byCode = products.find((product) => product.code?.trim().toLowerCase() === code);

    if (byCode) return byCode;
  }

  const name = normaliseName(line.name);

  if (!name) return undefined;

  const exact = products.find((product) => normaliseName(product.name) === name);

  if (exact) return exact;

  return [...products]
    .sort((a, b) => normaliseName(b.name).length - normaliseName(a.name).length)
    .find((product) => {
      const candidate = normaliseName(product.name);

      if (candidate.length < MIN_SUBSTRING_LENGTH) return false;

      return name.includes(candidate) || candidate.includes(name);
    });
};
