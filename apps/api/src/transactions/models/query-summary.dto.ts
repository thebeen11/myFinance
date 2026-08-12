import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class QuerySummaryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Inclusive lower bound. Defaults to the start of the current month.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Exclusive upper bound. Defaults to the start of next month.',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Restrict the summary to one account.',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;
}
