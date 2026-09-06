import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BASIS_POINTS_SCALE } from '@myfinance/shared';

/**
 * One discount off a line.
 *
 * Exactly one of `basisPoints` and `amountMinor` is given, and which one decides
 * how the row behaves for the rest of its life: a rate is re-applied whenever the
 * line's quantity or price moves, a typed amount is a lump sum that does not. The
 * service enforces the either/or, so the message can name the line it is on.
 *
 * Order matters — the discounts cascade, each off what the ones before it left —
 * so the array position is the receipt's own order and is stored.
 */
export class TransactionItemDiscountDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Member',
    description: 'As printed. Null when the receipt only prints a figure.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string | null;

  /**
   * Capped at 100%, unlike a charge's percentage: over that the cascade would run
   * past the line and `Transaction.amountMinor` is always positive.
   */
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 2_000,
    minimum: 0,
    maximum: BASIS_POINTS_SCALE,
    description:
      'Basis points off what is left at this point in the cascade (20% is 2000). ' +
      'The API derives the money from it. Omit when giving an amount instead.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(BASIS_POINTS_SCALE)
  basisPoints?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 10_000,
    minimum: 0,
    description:
      'A lump sum off the line — a voucher — in minor units. Unaffected by the ' +
      'quantity. Omit when giving a rate instead.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  amountMinor?: number | null;
}
