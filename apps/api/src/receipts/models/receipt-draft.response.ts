import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ReceiptDraftChargeResponse } from './receipt-draft-charge.response';
import { ReceiptDraftLineResponse } from './receipt-draft-line.response';
import { ReceiptDraftMerchantResponse } from './receipt-draft-merchant.response';

/**
 * What a receipt photo appears to say, as a proposal.
 *
 * **Nothing here has been written.** The scan is deliberately read-only: the
 * reviewer corrects this draft and posts it back to `POST /receipts`, so a
 * misread line never reaches the ledger or a balance. See PRODUCT.md — the
 * derived answer is shown and correctable, never applied silently.
 */
export class ReceiptDraftResponse {
  @ApiProperty({ format: 'uuid', description: 'The account the amounts below were scaled for.' })
  accountId!: string;

  @ApiProperty({
    example: 'IDR',
    description: "The account's currency. Every *Minor field is in it.",
  })
  currency!: string;

  @ApiProperty({ type: ReceiptDraftMerchantResponse })
  merchant!: ReceiptDraftMerchantResponse;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-08-10T00:00:00.000Z',
    description: 'The printed date at UTC midnight, or null when the receipt showed none.',
  })
  occurredAt!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Seeded from the merchant name, so the transaction row reads as something.',
  })
  description!: string | null;

  @ApiProperty({ type: [ReceiptDraftLineResponse] })
  lines!: ReceiptDraftLineResponse[];

  @ApiProperty({ type: [ReceiptDraftChargeResponse] })
  charges!: ReceiptDraftChargeResponse[];

  /**
   * The two totals are reported side by side rather than reconciled, because the
   * gap between them is the only cheap signal that the scan misread something.
   * Silently trusting either one would hide exactly the error worth catching.
   */
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 69_930,
    description: 'The grand total as printed on the receipt. Null when it was unreadable.',
  })
  printedTotalMinor!: number | null;

  @ApiProperty({
    example: 69_930,
    description:
      'The sum of the lines and charges above. Disagreement means something was misread.',
  })
  derivedTotalMinor!: number;
}
