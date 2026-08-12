import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

import { CreateAccountDto } from './create-account.dto';

export class UpdateAccountDto extends PartialType(CreateAccountDto) {
  @ApiPropertyOptional({
    description: 'Archive (true) or restore (false) the account.',
  })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
