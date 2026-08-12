import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '@myfinance/shared';

/** One slice of the summary breakdown. `categoryId` is null for uncategorised rows. */
export class CategoryTotalResponse {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  categoryId!: string | null;

  @ApiProperty()
  categoryName!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  color!: string | null;

  @ApiProperty({ enum: TransactionType, enumName: 'TransactionType' })
  type!: TransactionType;

  @ApiProperty()
  totalMinor!: number;
}
