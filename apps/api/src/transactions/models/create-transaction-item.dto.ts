import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BASIS_POINTS_SCALE } from '@myfinance/shared';

export class CreateTransactionItemDto {
  /**
   * Optional link to the catalogue. A line typed by hand has none and needs no
   * product code at all — promoting it to master data is a separate, deliberate step.
   *
   * `null` and absent are not the same thing and must stay distinguishable all the
   * way to Prisma: absent means "leave the link alone", `null` means "clear it".
   */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  productId?: string | null;

  /**
   * Required, unlike the product link: every line is classified, whether or not
   * it came from the catalogue. It is seeded from the product's own category but
   * kept as a snapshot, so the two are free to diverge.
   */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: 'Indomie Goreng' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({
    example: 3500,
    minimum: 0,
    description: "Price for one unit, in minor units of the transaction's currency.",
  })
  @IsInt()
  @Min(0)
  unitPriceMinor!: number;

  /**
   * The rate, not the money: the API derives `discountMinor` and `lineTotalMinor`
   * from it, the same way it already owns the line total. Absent means no discount.
   *
   * Capped at 100%, unlike a charge's percentage, because a larger one would make
   * the line total negative and `Transaction.amountMinor` is always positive.
   */
  @ApiPropertyOptional({
    example: 1000,
    minimum: 0,
    maximum: BASIS_POINTS_SCALE,
    default: 0,
    description: 'Basis points off this line (10% is 1000). The API derives the money from it.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(BASIS_POINTS_SCALE)
  discountBasisPoints?: number;
}
