/** Whether a category groups money coming in or going out. Mirrored in schema.prisma. */
export const CategoryKind = {
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
} as const;

export type CategoryKind = (typeof CategoryKind)[keyof typeof CategoryKind];
