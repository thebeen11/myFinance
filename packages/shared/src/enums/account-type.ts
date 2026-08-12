/** Kind of account money sits in. Mirrored by the `AccountType` enum in schema.prisma. */
export const AccountType = {
  CASH: 'CASH',
  BANK: 'BANK',
  EWALLET: 'EWALLET',
  CREDIT_CARD: 'CREDIT_CARD',
  INVESTMENT: 'INVESTMENT',
} as const;

export type AccountType = (typeof AccountType)[keyof typeof AccountType];
