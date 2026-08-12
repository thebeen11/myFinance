import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { TransactionSettlementResponse } from './transaction-settlement.response';

/**
 * One wallet's total share of a fronted receipt.
 *
 * This is the grain a debt is settled at, even though it is shown broken down by
 * category: a repayment covers everything one wallet owed on one receipt, not a
 * category at a time.
 */
export class TransactionSplitDebtorResponse {
  @ApiProperty({ format: 'uuid' })
  accountId!: string;

  @ApiProperty()
  accountName!: string;

  @ApiProperty({
    description:
      'What this wallet owes as the receipt currently stands, in minor units. Recomputed on ' +
      'every read, so it moves when the receipt is edited — including after it was settled.',
  })
  owedMinor!: number;

  @ApiPropertyOptional({
    type: TransactionSettlementResponse,
    nullable: true,
    description: 'Null while the share is still outstanding.',
  })
  settlement!: TransactionSettlementResponse | null;
}
