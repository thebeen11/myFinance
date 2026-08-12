import { ApiProperty } from '@nestjs/swagger';

/** Just enough merchant to render a transaction row without a second request. */
export class TransactionMerchantResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}
