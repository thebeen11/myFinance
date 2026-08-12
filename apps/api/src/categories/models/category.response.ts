import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoryKind } from '@myfinance/shared';

export class CategoryResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The account this category is paid from; null when it is unassigned.',
  })
  accountId!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Denormalised so a category list need not also fetch accounts.',
  })
  accountName!: string | null;

  @ApiProperty({ enum: CategoryKind, enumName: 'CategoryKind' })
  kind!: CategoryKind;

  @ApiPropertyOptional({ type: String, nullable: true })
  color!: string | null;

  @ApiProperty({
    description: 'Receipt lines filed under this category. Deleting it leaves them uncategorised.',
  })
  transactionItemCount!: number;

  @ApiProperty({ description: 'Catalogue products classified by this category.' })
  productCount!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
