import { ApiProperty } from '@nestjs/swagger';
import { AccountType } from '@myfinance/shared';

/** Just enough account to render a transaction row without a second request. */
export class TransactionAccountResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: AccountType, enumName: 'AccountType' })
  type!: AccountType;
}
