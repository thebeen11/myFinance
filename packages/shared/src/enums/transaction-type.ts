/**
 * Direction of a transaction. `amountMinor` is always stored positive; the sign
 * is derived from this type. Mirrored by the `TransactionType` enum in schema.prisma.
 *
 * TRANSFER (paired legs between two accounts) is deliberately out of scope for now.
 */
export const TransactionType = {
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
} as const;

export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];
