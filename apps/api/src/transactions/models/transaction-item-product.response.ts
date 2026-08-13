import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Just enough product to show which catalogue entry a line was bought as. */
export class TransactionItemProductResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'IDM-001' })
  code!: string | null;

  @ApiProperty({ example: 'Indomie Goreng' })
  name!: string;
}
