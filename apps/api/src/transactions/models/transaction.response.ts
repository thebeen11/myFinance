import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '@myfinance/shared';

import { CategorySummaryResponse } from '../../categories/models/category-summary.response';

import { TransactionAccountResponse } from './transaction-account.response';
import { TransactionItemResponse } from './transaction-item.response';
import { TransactionMerchantResponse } from './transaction-merchant.response';

export class TransactionResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: TransactionType, enumName: 'TransactionType' })
  type!: TransactionType;

  @ApiProperty({
    description:
      'Positive integer in minor units; sign comes from `type`. On an EXPENSE it is derived — ' +
      'the sum of `items[].lineTotalMinor`, so a receipt with nothing itemised yet reads zero. ' +
      'On an INCOME it is the figure that was entered, and there are no items.',
  })
  amountMinor!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({ type: TransactionAccountResponse })
  account!: TransactionAccountResponse;

  @ApiPropertyOptional({ type: TransactionMerchantResponse, nullable: true })
  merchant!: TransactionMerchantResponse | null;

  @ApiPropertyOptional({
    type: CategorySummaryResponse,
    nullable: true,
    description:
      'How an INCOME transaction is classified, since it has no items to carry a category. ' +
      'Always null on an EXPENSE, which is categorised line by line in `items[].category`.',
  })
  category!: CategorySummaryResponse | null;

  @ApiProperty({
    type: [TransactionItemResponse],
    description:
      'What was bought, in receipt order. Empty until an expense is itemised, and always ' +
      'empty on income — the API refuses to write items on an INCOME transaction.',
  })
  items!: TransactionItemResponse[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
