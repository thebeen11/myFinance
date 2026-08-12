import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CategorySummaryResponse } from '../../categories/models/category-summary.response';

export class ProductResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  merchantId!: string;

  @ApiProperty({ description: 'Denormalised so a product list need not also fetch merchants.' })
  merchantName!: string;

  @ApiPropertyOptional({
    type: CategorySummaryResponse,
    nullable: true,
    description: 'Only null for rows that predate categorised products.',
  })
  category!: CategorySummaryResponse | null;

  @ApiProperty({ example: 'IDM-001' })
  code!: string;

  @ApiProperty({ example: 'Indomie Goreng' })
  name!: string;

  @ApiProperty({ example: 3500, description: 'Price last paid, in minor units of `currency`.' })
  lastPriceMinor!: number;

  @ApiProperty({ example: 'IDR', description: 'ISO 4217 code. Always IDR for now.' })
  currency!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
