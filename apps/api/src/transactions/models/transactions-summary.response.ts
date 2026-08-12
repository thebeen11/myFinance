import { ApiProperty } from '@nestjs/swagger';

import { CategoryTotalResponse } from './category-total.response';

/** All amounts are integer minor units. Assumes a single currency across accounts. */
export class TransactionsSummaryResponse {
  @ApiProperty({ format: 'date-time' })
  from!: string;

  @ApiProperty({ format: 'date-time' })
  to!: string;

  @ApiProperty()
  incomeMinor!: number;

  @ApiProperty()
  expenseMinor!: number;

  @ApiProperty({ description: 'incomeMinor - expenseMinor' })
  netMinor!: number;

  @ApiProperty({ type: [CategoryTotalResponse] })
  byCategory!: CategoryTotalResponse[];
}
