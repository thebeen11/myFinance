import { ApiProperty } from '@nestjs/swagger';

export class MerchantResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    description:
      'How many transactions point at this merchant. Deleting it detaches them, not deletes them.',
  })
  transactionCount!: number;

  @ApiProperty({
    description: 'How many products this merchant sells. Deleting it deletes them too.',
  })
  productCount!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
