import { ApiProperty } from '@nestjs/swagger';

/** All amounts are integer minor units of `currency`. */
export class AccountBalanceResponse {
  @ApiProperty({ format: 'uuid' })
  accountId!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  openingBalanceMinor!: number;

  @ApiProperty()
  incomeMinor!: number;

  @ApiProperty()
  expenseMinor!: number;

  @ApiProperty({
    description: 'openingBalanceMinor + incomeMinor - expenseMinor',
  })
  balanceMinor!: number;
}
