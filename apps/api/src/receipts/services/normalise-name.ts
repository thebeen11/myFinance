/**
 * A name reduced to what two spellings of the same thing have in common.
 *
 * Receipt printers abbreviate, strip accents, pad with double spaces and wrap
 * words in brackets, so comparing raw strings misses matches a person makes at a
 * glance. Punctuation goes entirely because "Indomie Goreng (Jumbo)" and
 * "Indomie Goreng Jumbo" are one product.
 *
 * The combining marks left by `NFKD` are removed *before* the punctuation pass,
 * not by it: turning them into spaces would read "cafe" and "café" as
 * different words rather than the same one.
 */
export const normaliseName = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
