import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Who the receipt says sold this, and whether we already know them.
 *
 * `id` and `name` are independent on purpose: a scan of an unknown shop still
 * carries the printed name, so the reviewer can create the merchant instead of
 * losing what the receipt said.
 */
export class ReceiptDraftMerchantResponse {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The matched merchant, or null when nothing in the catalogue matched.',
  })
  id!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Indomaret',
    description: "The merchant's catalogue name when matched, otherwise the name as printed.",
  })
  name!: string | null;
}
