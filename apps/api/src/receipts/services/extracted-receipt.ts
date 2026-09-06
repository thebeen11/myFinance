/**
 * What the model reports it can see on a receipt photo, before anything is
 * resolved against the user's own data.
 *
 * **Every amount here is in major units, exactly as printed** — 12500 rupiah is
 * `12500`, $4.99 is `4.99`. Converting to the minor units everything else in this
 * codebase speaks needs the account's currency, which the model has no business
 * knowing, so it happens one layer up in `ReceiptScanService`.
 *
 * Every field is nullable because a crease, a thumb or a faded thermal print is
 * routine: a `null` the user fills in beats a plausible number they never check.
 */
export interface ExtractedReceipt {
  merchantName: string | null;
  /** As printed, `YYYY-MM-DD`. Null when the receipt shows no legible date. */
  purchasedOn: string | null;
  lines: ExtractedLine[];
  charges: ExtractedCharge[];
  /** The total the receipt itself prints, used to check the lines add up. */
  grandTotal: number | null;
}

/** One thing that was bought. */
export interface ExtractedLine {
  /** The shop's own SKU, when the receipt prints one beside the name. */
  code: string | null;
  name: string;
  quantity: number;
  /** Per unit, not the line total. */
  unitPrice: number;
  /** Every discount printed under this line, in the order printed. */
  discounts: ExtractedDiscount[];
}

/**
 * One discount printed under a line.
 *
 * Either a percentage or an amount, whichever the receipt prints — never both,
 * because they cascade and a printed pair could only disagree once anything above
 * it changes. `ReceiptScanService` prices the cascade.
 */
export interface ExtractedDiscount {
  /** The label beside it — "Member", "Promo". Null when it prints only a figure. */
  name: string | null;
  /** The rate as printed, where 10% is 10. Null when it printed an amount. */
  percent: number | null;
  /** The amount as printed, in major units. Null when it printed a rate. */
  amount: number | null;
}

/** Money paid but not bought — tax, service, delivery, packaging. */
export interface ExtractedCharge {
  name: string;
  /** The rate the receipt prints beside it, when it prints one. */
  percent: number | null;
  amount: number;
}
