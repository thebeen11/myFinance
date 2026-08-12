import { ApiProperty } from '@nestjs/swagger';

import { TransactionSplitDebtorResponse } from './transaction-split-debtor.response';
import { TransactionSplitLineResponse } from './transaction-split-line.response';

/**
 * How a receipt divides between the wallet that paid it and the wallets it was
 * partly paid *for*.
 *
 * Entirely derived — from each line's category, its linked account, and the
 * receipt's charges — so it can never fall out of step with what is on the
 * receipt. Nothing here is stored except a settlement, which records that a
 * debtor's share was paid back.
 *
 * `ownShareMinor` plus every debtor's `owedMinor` always equals the receipt total.
 */
export class TransactionSplitResponse {
  @ApiProperty({
    description:
      "The paying account's own share: lines whose category is linked to it, or to no " +
      'account at all, plus its prorated part of the charges. An uncategorised line, or one ' +
      'under an unassigned category, cannot be attributed to anyone else and stays here.',
  })
  ownShareMinor!: number;

  @ApiProperty({
    type: [TransactionSplitLineResponse],
    description:
      'One row per category owed to another wallet, largest first. What the figures are ' +
      'made of.',
  })
  lines!: TransactionSplitLineResponse[];

  @ApiProperty({
    type: [TransactionSplitDebtorResponse],
    description:
      '`lines` rolled up per wallet, largest first. Who owes, and what has been settled.',
  })
  debtors!: TransactionSplitDebtorResponse[];
}
