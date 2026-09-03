import { ApiProperty } from '@nestjs/swagger';

import { OutstandingCurrencyTotalResponse } from './outstanding-currency-total.response';
import { OutstandingReimbursementResponse } from './outstanding-reimbursement.response';

/**
 * Who still owes whom, across every receipt.
 *
 * Unpaginated on purpose, unlike the list endpoints: this is an aggregate, bounded
 * by how many pairs of accounts have ever shared a receipt, not by how many rows
 * exist. `/transactions/summary` is the same shape of thing.
 */
export class OutstandingReimbursementsResponse {
  @ApiProperty({
    type: [OutstandingReimbursementResponse],
    description: 'Largest debt first.',
  })
  data!: OutstandingReimbursementResponse[];

  @ApiProperty({ type: [OutstandingCurrencyTotalResponse] })
  totalsByCurrency!: OutstandingCurrencyTotalResponse[];
}
