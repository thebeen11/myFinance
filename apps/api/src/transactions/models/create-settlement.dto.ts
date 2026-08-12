import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

/**
 * Records that a wallet paid back its share of a fronted receipt.
 *
 * There is no amount to send: a settlement always covers the whole of what that
 * wallet owes as the receipt currently stands, and the figure is snapshotted so a
 * later edit cannot rewrite what was actually repaid. Partial repayment is not
 * modelled.
 */
export class CreateSettlementDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The wallet that owed a share of this receipt and has now paid it back.',
  })
  @IsUUID()
  owedAccountId!: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'When the money moved. Defaults to now, which is also when the rows are posted.',
  })
  @IsOptional()
  @IsISO8601()
  settledAt?: string;
}
