import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsUUID, Min, MaxLength, MinLength } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ format: 'uuid', description: 'The merchant that sells this product.' })
  @IsUUID()
  merchantId!: string;

  /**
   * How this product is classified by default. Required — but only a default: a
   * line item copies it and may then be changed, so what a receipt says is not
   * bound to what the catalogue says today.
   */
  @ApiProperty({ format: 'uuid', description: 'Must be an EXPENSE category.' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: 'IDM-001', description: "The merchant's own SKU. Unique within it." })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;

  @ApiProperty({ example: 'Indomie Goreng' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  // No `currency` here on purpose: products are IDR, and the column keeps its
  // schema default rather than letting a caller pick a scale for the amount.
  @ApiProperty({ example: 3500, description: 'Price last paid, in IDR minor units.' })
  @IsInt()
  @Min(0)
  lastPriceMinor!: number;
}
