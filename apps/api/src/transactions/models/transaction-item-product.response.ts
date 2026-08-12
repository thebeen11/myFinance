import { ApiProperty } from '@nestjs/swagger';

/** Just enough product to show which catalogue entry a line was bought as. */
export class TransactionItemProductResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'IDM-001' })
  code!: string;

  @ApiProperty({ example: 'Indomie Goreng' })
  name!: string;
}
