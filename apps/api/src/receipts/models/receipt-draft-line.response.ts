import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ReceiptDraftDiscountResponse } from './receipt-draft-discount.response';

/**
 * One line read off the receipt, already resolved against the catalogue.
 *
 * `productId`, `categoryId` and `categoryName` are filled in **by the API**, never
 * by the model: they are looked up among rows already filtered by the signed-in
 * user, so a hallucinated product name can only fail to match — it can never
 * point a line at another tenant's row.
 */
export class ReceiptDraftLineResponse {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The catalogue product this line matched, or null when it is new.',
  })
  productId!: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: "The matched product's category. Null when unmatched — the reviewer picks one.",
  })
  categoryId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Groceries' })
  categoryName!: string | null;

  @ApiProperty({ example: 'Indomie Goreng' })
  name!: string;

  @ApiProperty({
    example: 1_500,
    minimum: 1,
    description: 'Thousandths of a unit — a weighed 1.5 kg line is 1500.',
  })
  quantityMilli!: number;

  @ApiProperty({ example: 3_500, description: "Per unit, in the account's minor units." })
  unitPriceMinor!: number;

  @ApiProperty({
    type: [ReceiptDraftDiscountResponse],
    description: 'Every discount printed under this line, in the order they cascade.',
  })
  discounts!: ReceiptDraftDiscountResponse[];

  @ApiProperty({
    example: 2_400,
    description: 'What the whole cascade comes to as one rate (24% is 2400).',
  })
  discountBasisPoints!: number;

  @ApiProperty({
    example: 41_800,
    description: 'The quantity at the unit price less the discounts, as a saved line derives it.',
  })
  lineTotalMinor!: number;
}
