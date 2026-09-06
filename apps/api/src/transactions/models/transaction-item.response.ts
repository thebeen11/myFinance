import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CategorySummaryResponse } from '../../categories/models/category-summary.response';
import { TransactionItemDiscountResponse } from './transaction-item-discount.response';
import { TransactionItemProductResponse } from './transaction-item-product.response';

/**
 * One line on a receipt.
 *
 * `name`, `unitPriceMinor` and `category` are what was recorded at entry time, not
 * what the linked product says today — re-pricing or re-classifying master data
 * never rewrites a receipt.
 */
export class TransactionItemResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Indomie Goreng' })
  name!: string;

  @ApiProperty({
    example: 1_500,
    description: 'Thousandths of a unit — 1.5 kg is 1500, two tins are 2000.',
  })
  quantityMilli!: number;

  @ApiProperty({ example: 3500 })
  unitPriceMinor!: number;

  @ApiProperty({
    type: [TransactionItemDiscountResponse],
    description: 'Every discount off this line, in the order they cascade.',
  })
  discounts!: TransactionItemDiscountResponse[];

  @ApiProperty({
    example: 2400,
    description:
      'What the whole cascade comes to as one rate (24% is 2400), derived by the API. ' +
      'Zero when nothing was discounted.',
  })
  discountBasisPoints!: number;

  @ApiProperty({
    example: 13_200,
    description: 'The sum of `discounts`, derived by the API.',
  })
  discountMinor!: number;

  @ApiProperty({
    example: 41_800,
    description: 'The quantity at the unit price, less discountMinor.',
  })
  lineTotalMinor!: number;

  @ApiProperty({ description: 'Order on the receipt.' })
  position!: number;

  @ApiPropertyOptional({
    type: TransactionItemProductResponse,
    nullable: true,
    description: 'Null for a line typed by hand that is not in the catalogue.',
  })
  product!: TransactionItemProductResponse | null;

  @ApiPropertyOptional({
    type: CategorySummaryResponse,
    nullable: true,
    description: 'Only null for rows that predate categorised lines.',
  })
  category!: CategorySummaryResponse | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
