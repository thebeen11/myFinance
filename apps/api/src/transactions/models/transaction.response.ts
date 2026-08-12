import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '@myfinance/shared';

import { CategorySummaryResponse } from '../../categories/models/category-summary.response';

import { TransactionAccountResponse } from './transaction-account.response';
import { TransactionChargeResponse } from './transaction-charge.response';
import { TransactionItemResponse } from './transaction-item.response';
import { TransactionMerchantResponse } from './transaction-merchant.response';
import { TransactionSplitResponse } from './transaction-split.response';

export class TransactionResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: TransactionType, enumName: 'TransactionType' })
  type!: TransactionType;

  @ApiProperty({
    description:
      'Positive integer in minor units; sign comes from `type`. On an EXPENSE it is derived — ' +
      'the sum of `items[].lineTotalMinor` plus `charges[].amountMinor`, so a receipt with ' +
      'nothing on it yet reads zero. On an INCOME it is the figure that was entered, and there ' +
      'are neither items nor charges.',
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

  @ApiProperty({
    type: [TransactionChargeResponse],
    description:
      'Tax, service charge and the like — money paid on top of what was bought, in receipt ' +
      'order. Counts towards `amountMinor` but carries no category, so it is absent from the ' +
      "summary's per-category breakdown. Always empty on income.",
  })
  charges!: TransactionChargeResponse[];

  @ApiPropertyOptional({
    type: TransactionSplitResponse,
    nullable: true,
    description:
      'How this receipt divides between the account that paid it and accounts it was partly ' +
      "paid for — derived from each line's category and the account that category is linked " +
      'to. Null when nothing is owed to anyone else, and on every income row.',
  })
  split!: TransactionSplitResponse | null;

  @ApiProperty({
    description:
      'True when this row was posted by settling a split rather than entered by hand. Such a ' +
      'row is not editable: its amount is authoritative, and the API refuses every write to ' +
      'it so the expense recompute can never reach it. Undo it by unsettling instead.',
  })
  isSettlement!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
