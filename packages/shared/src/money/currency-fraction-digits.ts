const cache = new Map<string, number>();

/**
 * Number of decimal places a currency uses (USD -> 2, IDR -> 0, JPY -> 0).
 * Resolved through Intl so we do not hand-maintain a currency table.
 */
export const getCurrencyFractionDigits = (currency: string): number => {
  const code = currency.toUpperCase();
  const cached = cache.get(code);
  if (cached !== undefined) return cached;

  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    // Unknown code: fall back to the 2-decimal majority.
  }

  cache.set(code, digits);
  return digits;
};
