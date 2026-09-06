import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** One additional charge read off the receipt, in the account's minor units. */
export class ReceiptDraftChargeResponse {
  @ApiProperty({ example: 'PPN 11%' })
  name!: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 1100,
    description: 'Basis points (11% is 1100), when the receipt printed a rate.',
  })
  percentBasisPoints!: number | null;

  @ApiProperty({ example: 6_930 })
  amountMinor!: number;
}
