import { ApiProperty } from '@nestjs/swagger';

import { PaginationMetaResponse } from '../../common/responses/pagination-meta.response';
import { TransactionResponse } from './transaction.response';

export class PaginatedTransactionsResponse extends PaginationMetaResponse {
  @ApiProperty({ type: [TransactionResponse] })
  data!: TransactionResponse[];
}
