import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'The refresh token from the last token response.' })
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
