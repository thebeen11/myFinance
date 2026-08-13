import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Min, MaxLength, MinLength } from 'class-validator';

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

  /**
   * The merchant's own SKU, unique within that merchant. Optional: plenty of
   * things you buy have no printed code, and an empty string clears one that
   * was set rather than storing a blank.
   */
  @ApiPropertyOptional({ example: 'IDM-001' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

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
