import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from './query-keys';

/**
 * Refresh everything a category write can change, from any call site.
 *
 * Downstream rows embed a copy of their category rather than referencing it, so a
 * rename, a recolour, a move to another account or a delete strands stale copies
 * in three other caches: `AccountResponse.categoryCount` moves with the link,
 * receipt lines carry their category's name and swatch, and merchant products
 * carry the default they hand to new lines.
 *
 * `['transactions']` is the broad prefix on purpose — see the note in
 * `query-keys.ts`; it is what refreshes the dashboard summaries along with the list.
 */
export const invalidateCategoryDependents = async (queryClient: QueryClient): Promise<void> => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.categories() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts() }),
    queryClient.invalidateQueries({ queryKey: ['transactions'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.merchants() }),
  ]);
};
