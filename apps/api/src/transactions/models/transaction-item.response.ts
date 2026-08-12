import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CategorySummaryResponse } from '../../categories/models/category-summary.response';
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

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({ example: 3500 })
  unitPriceMinor!: number;

  @ApiProperty({
    example: 1000,
    description: 'Basis points off this line (10% is 1000). Zero when nothing was discounted.',
  })
  discountBasisPoints!: number;

  @ApiProperty({
    example: 700,
    description: 'quantity × unitPriceMinor × discountBasisPoints ÷ 10000, derived by the API.',
  })
  discountMinor!: number;

  @ApiProperty({ example: 6300, description: 'quantity × unitPriceMinor − discountMinor.' })
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
