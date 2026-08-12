import type { CategoryKind, CategoryResponse } from '@/api';

/**
 * The categories a line may be filed under.
 *
 * Mirrors `TransactionItemsService.getCategoryOrThrow`: direction is the only
 * rule, so an expense cannot take an income category. Where a category is
 * *bound* — its `accountId` — is a label on the categories list, not a
 * restriction, so a receipt paid from any wallet may use any of them.
 *
 * Kept in one place because it is a copy of a server rule: offering anything else
 * puts a value in front of the user that the API then refuses.
 */
export const categoriesOfKind = (
  categories: CategoryResponse[],
  kind: CategoryKind,
): CategoryResponse[] => categories.filter((category) => category.kind === kind);

/**
 * Why a picker came back empty.
 *
 * Only reachable when there is not a single category of this direction — a
 * dropdown that opens on nothing looks broken rather than empty, so it says what
 * is missing and where to add it.
 */
export const noCategoriesOfKindReason = (kind: CategoryKind): string =>
  `No ${kind === 'INCOME' ? 'income' : 'expense'} categories yet. Add one on the Categories page.`;
