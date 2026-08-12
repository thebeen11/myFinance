import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * One additional charge on a receipt.
 *
 * `percentBasisPoints` records how `amountMinor` was arrived at, not a rule that
 * maintains it: the amount is edited to match the printed receipt afterwards, so
 * the two are free to disagree.
 */
export class TransactionChargeResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Service charge' })
  name!: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 1100,
    description: 'Basis points (11% is 1100). Null when the amount was typed directly.',
  })
  percentBasisPoints!: number | null;

  @ApiProperty({ example: 6_930 })
  amountMinor!: number;

  @ApiProperty({ description: 'Order on the receipt.' })
  position!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
