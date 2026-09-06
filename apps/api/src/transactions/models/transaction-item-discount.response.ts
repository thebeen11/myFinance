import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * One discount off a line, as stored.
 *
 * `amountMinor` is what this row actually came to after the rows above it had
 * their turn — the discounts cascade, so the same 5% is worth less at the bottom
 * of the list than at the top.
 */
export class TransactionItemDiscountResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Member' })
  name!: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 500,
    description: 'Basis points off the running remainder (5% is 500). Null for a typed lump sum.',
  })
  basisPoints!: number | null;

  @ApiProperty({ example: 2_200, description: 'What this row came to, in minor units.' })
  amountMinor!: number;

  @ApiProperty({ description: 'Order on the line, which is the order the cascade applies in.' })
  position!: number;
}
