import { ApiProperty } from '@nestjs/swagger';

import { CategorySummaryResponse } from '../../categories/models/category-summary.response';

/**
 * One category's worth of a fronted receipt, and which wallet it belongs to.
 *
 * The grain is the category rather than the account because that is what explains
 * the figure — several categories may point at the same wallet, and they are rolled
 * up into one debt in `TransactionSplitResponse.debtors`.
 */
export class TransactionSplitLineResponse {
  @ApiProperty({ type: CategorySummaryResponse })
  category!: CategorySummaryResponse;

  @ApiProperty({ format: 'uuid', description: 'The account this category is paid from.' })
  accountId!: string;

  @ApiProperty({ description: 'Denormalised so the split need not also fetch accounts.' })
  accountName!: string;

  @ApiProperty({ description: 'Sum of the lines filed under this category, in minor units.' })
  itemsMinor!: number;

  @ApiProperty({
    description:
      "This category's share of the receipt's additional charges, prorated by `itemsMinor`.",
  })
  chargeShareMinor!: number;

  @ApiProperty({ description: '`itemsMinor` + `chargeShareMinor`.' })
  owedMinor!: number;
}
