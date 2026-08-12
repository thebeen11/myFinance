import { CategoryKind } from '@myfinance/shared';

/**
 * The starting category set. Used by `prisma/seed.ts` for a fresh database and by
 * registration to give every new user something to post against on day one.
 */
export const DEFAULT_CATEGORIES: ReadonlyArray<{
  name: string;
  kind: CategoryKind;
  color: string;
}> = [
  { name: 'Salary', kind: CategoryKind.INCOME, color: '#22c55e' },
  { name: 'Side Income', kind: CategoryKind.INCOME, color: '#16a34a' },
  { name: 'Groceries', kind: CategoryKind.EXPENSE, color: '#f97316' },
  { name: 'Transport', kind: CategoryKind.EXPENSE, color: '#0ea5e9' },
  { name: 'Housing', kind: CategoryKind.EXPENSE, color: '#a855f7' },
  { name: 'Dining Out', kind: CategoryKind.EXPENSE, color: '#ef4444' },
  { name: 'Utilities', kind: CategoryKind.EXPENSE, color: '#eab308' },
  { name: 'Health', kind: CategoryKind.EXPENSE, color: '#14b8a6' },
];
