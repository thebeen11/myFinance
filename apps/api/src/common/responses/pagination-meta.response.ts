import { ApiProperty } from '@nestjs/swagger';

/**
 * Envelope every paginated response carries. Domain responses extend this and
 * add a typed `data` array so the generated frontend client stays specific.
 */
export class PaginationMetaResponse {
  @ApiProperty({
    description: 'Total rows matching the filter, ignoring limit/offset.',
  })
  total!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}
