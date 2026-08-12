import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountType } from '@myfinance/shared';

export class AccountResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: AccountType, enumName: 'AccountType' })
  type!: AccountType;

  @ApiProperty({ description: 'ISO 4217 code.' })
  currency!: string;

  @ApiProperty()
  openingBalanceMinor!: number;

  @ApiProperty({
    description: 'Categories paid from this account. Deleting it leaves them unassigned.',
  })
  categoryCount!: number;

  @ApiProperty({ description: 'Transactions posted here. Deleting the account deletes them.' })
  transactionCount!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  archivedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
