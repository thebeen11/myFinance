import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/**
 * One additional charge on a receipt — tax, service charge, delivery, packaging.
 *
 * `amountMinor` is what the row is worth and is always required, even when a
 * percentage is given. The percentage is what the client used to *arrive* at that
 * figure, recorded so the row can show its working; the API never derives one
 * from the other, because a receipt rounds where it likes and the printed figure
 * wins.
 */
export class CreateTransactionChargeDto {
  @ApiProperty({ example: 'Service charge' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  /**
   * Basis points — 11% is 1100 — so the percentage stays an integer for the same
   * reason money does. Absent or null means the amount was typed straight in.
   */
  @ApiPropertyOptional({
    example: 1100,
    minimum: 0,
    maximum: 100_000,
    nullable: true,
    description: 'Basis points (11% is 1100). The percentage that produced `amountMinor`, if any.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  percentBasisPoints?: number | null;

  @ApiProperty({
    example: 6_930,
    minimum: 0,
    description: "What the charge came to, in minor units of the transaction's currency.",
  })
  @IsInt()
  @Min(0)
  amountMinor!: number;
}
