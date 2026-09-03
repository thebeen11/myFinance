import { ApiProperty } from '@nestjs/swagger';

import { OutstandingReceiptResponse } from './outstanding-receipt.response';

/**
 * Everything one wallet still owes another, across every receipt it was fronted on.
 *
 * The grain is the **pair** of accounts plus the currency, not the owing account
 * alone: one wallet may have been covered by two different payers, and a
 * reimbursement moves money between exactly two of them. Currency is part of the
 * key because nothing in the system holds an FX rate — `TransactionSplitsService.settle`
 * refuses a cross-currency repayment outright, so a total spanning currencies would
 * be a figure nothing could ever pay.
 */
export class OutstandingReimbursementResponse {
  @ApiProperty({ format: 'uuid', description: 'The wallet that owes.' })
  owedAccountId!: string;

  @ApiProperty()
  owedAccountName!: string;

  @ApiProperty({ format: 'uuid', description: 'The wallet that fronted the money.' })
  paidByAccountId!: string;

  @ApiProperty()
  paidByAccountName!: string;

  @ApiProperty({ description: "ISO 4217 code of the receipts, which is the paying account's." })
  currency!: string;

  @ApiProperty({
    description:
      'Sum of the unreimbursed shares, in minor units of `currency`. Derived on every read, so ' +
      'editing a receipt moves it.',
  })
  owedMinor!: number;

  @ApiProperty({ description: 'How many receipts the figure is made of.' })
  receiptCount!: number;

  @ApiProperty({ format: 'date-time', description: 'When the oldest of them was paid.' })
  oldestOccurredAt!: string;

  @ApiProperty({ type: [OutstandingReceiptResponse], description: 'Newest first.' })
  receipts!: OutstandingReceiptResponse[];
}
