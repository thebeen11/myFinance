import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { TransactionItemDiscountDto } from './transaction-item-discount.dto';

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
   * Every discount on this line, in the order the receipt prints them.
   *
   * The order is the answer, not a display preference: they **cascade**, each one
   * off what the ones above it left behind. 55_000 at 20% and then 5% comes to
   * 11_000 and 2_200, because the second rate reads against the 44_000 the first
   * left — swapping the two changes both figures.
   *
   * The API derives `discountMinor` and `lineTotalMinor` from them, the same way
   * it already owns the line total. Absent means no discount; on an update, an
   * empty array clears the ones that are there while absent leaves them alone.
   */
  @ApiPropertyOptional({ type: [TransactionItemDiscountDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TransactionItemDiscountDto)
  discounts?: TransactionItemDiscountDto[];
}
