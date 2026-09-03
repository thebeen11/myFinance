import { ApiProperty } from '@nestjs/swagger';

/**
 * One fronted receipt behind an outstanding reimbursement.
 *
 * Enough to name the receipt and link to it — the figures it is made of stay on
 * the transaction's own split, which is derived there on every read.
 */
export class OutstandingReceiptResponse {
  @ApiProperty({ format: 'uuid' })
  transactionId!: string;

  @ApiProperty({
    nullable: true,
    description: 'What the receipt was described as, if anything.',
  })
  description!: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'Where it was paid. The client names a receipt by its description and falls back to this, ' +
      'the same order the transaction list uses.',
  })
  merchantName!: string | null;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ description: "This account's share of this one receipt, in minor units." })
  owedMinor!: number;
}
