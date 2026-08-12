import { Banknote, CreditCard, Landmark, Smartphone, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { AccountResponse } from '@/api';

type AccountType = AccountResponse['type'];

/**
 * The value an account picker uses for "no account".
 *
 * A shadcn `SelectItem` value cannot be `''`, and this sentinel sits in the same
 * list as real account ids, so it needs a form no uuid can take.
 */
export const UNASSIGNED_ACCOUNT = '__none__';

const ICONS: Record<AccountType, LucideIcon> = {
  CASH: Banknote,
  BANK: Landmark,
  EWALLET: Smartphone,
  CREDIT_CARD: CreditCard,
  INVESTMENT: TrendingUp,
};

const LABELS: Record<AccountType, string> = {
  CASH: 'Cash',
  BANK: 'Bank',
  EWALLET: 'E-wallet',
  CREDIT_CARD: 'Credit card',
  INVESTMENT: 'Investment',
};

export const accountIcon = (type: AccountType): LucideIcon => ICONS[type];

/** Indonesian money is multi-rail, so the account's rail is worth naming plainly. */
export const accountTypeLabel = (type: AccountType): string => LABELS[type];
