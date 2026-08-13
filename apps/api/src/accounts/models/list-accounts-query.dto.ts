import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListAccountsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  // Query strings arrive as text, and `Boolean('false')` is `true` — the one
  // conversion that would quietly un-hide every archived account.
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived: boolean = false;
}
