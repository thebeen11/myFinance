import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * One discount read off a line, in the shape the confirm will send back.
 *
 * Exactly one of `basisPoints` and `amountMinor` is set, matching
 * `TransactionItemDiscountDto` — the draft is a pre-filled form body, not a
 * stored row, so what each one came to is not repeated here. The reviewer's
 * browser prices the cascade with the same helper the API does.
 */
export class ReceiptDraftDiscountResponse {
  @ApiPropertyOptional({ type: String, nullable: true, example: 'Member' })
  name!: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 500,
    description: 'Basis points off the running remainder (5% is 500).',
  })
  basisPoints!: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 10_000,
    description: 'A lump sum off the line, in minor units, when the receipt printed one.',
  })
  amountMinor!: number | null;
}
