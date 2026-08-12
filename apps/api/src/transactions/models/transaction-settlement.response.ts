import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * A share of a receipt that has been paid back, and the two rows that moved it.
 *
 * `settledMinor` is what was owed when it was settled, not what is owed now. The
 * money has already moved, so a later edit to the receipt cannot rewrite it —
 * `isStale` is how the disagreement is surfaced instead of being papered over.
 */
export class TransactionSettlementResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: 89_930,
    description: 'What was owed at the moment it was settled, in minor units.',
  })
  settledMinor!: number;

  @ApiProperty({ format: 'date-time' })
  settledAt!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The INCOME posted to the account that fronted the receipt.',
  })
  inboundTransactionId!: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The EXPENSE posted to the account that owed the share.',
  })
  outboundTransactionId!: string | null;

  @ApiProperty({
    description:
      'True when the receipt has been edited since, so what is owed now no longer matches ' +
      'what was paid back. Nothing is corrected automatically — the difference is the ' +
      "user's to settle or ignore.",
  })
  isStale!: boolean;
}
