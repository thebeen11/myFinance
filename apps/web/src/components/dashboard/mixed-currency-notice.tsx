import { CircleAlert } from 'lucide-react';

/**
 * Shown in place of a figure when accounts span several currencies.
 *
 * `/transactions/summary` groups by category and type but not by currency, so it
 * adds unlike minor units into one integer, and nothing in the system holds an
 * exchange rate. Rendering that sum — even labelled, even with a caveat — would
 * state a number that is simply not true. Withholding it is the honest option,
 * and it is what "totals must be unambiguous about whose they are" implies.
 */
export const MixedCurrencyNotice = ({ currencies }: { currencies: readonly string[] }) => (
  <div className="text-muted-foreground flex items-start gap-2 text-sm">
    <CircleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
    <p>
      Unavailable while accounts span {currencies.join(' and ')}. These totals are not converted
      between currencies, so combining them would not be a real figure.
    </p>
  </div>
);
