import { ApiProperty } from '@nestjs/swagger';

import { PaginationMetaResponse } from '../../common/responses/pagination-meta.response';
import { AccountCurrencyTotalResponse } from './account-currency-total.response';
import { AccountResponse } from './account.response';

export class PaginatedAccountsResponse extends PaginationMetaResponse {
  @ApiProperty({ type: [AccountResponse] })
  data!: AccountResponse[];

  /**
   * Rolled up over the whole filtered set, not the page.
   *
   * Net worth has to stay correct while the list is paged, so the client can
   * never derive it by folding `data` — past the first page that would silently
   * under-count. Ordered by `totalMinor`, largest first.
   */
  @ApiProperty({ type: [AccountCurrencyTotalResponse] })
  totalsByCurrency!: AccountCurrencyTotalResponse[];

  /**
   * Archived accounts matching `search`, counted whether or not
   * `includeArchived` is set — it is what labels the "show archived" toggle,
   * which has to know the count *before* it is switched on.
   */
  @ApiProperty()
  archivedTotal!: number;
}
