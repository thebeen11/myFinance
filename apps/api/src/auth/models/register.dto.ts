import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  // Letters, digits, dot, underscore and hyphen. Matched case-insensitively —
  // AuthService lowercases before storing, so casing cannot fork an account.
  @ApiProperty({ example: 'bagus', minLength: 3, maxLength: 32, pattern: '^[a-z0-9._-]{3,32}$' })
  @IsString()
  @Matches(/^[a-z0-9._-]{3,32}$/i, {
    message: 'username must be 3-32 characters of letters, digits, dot, underscore or hyphen',
  })
  username!: string;

  @ApiProperty({ minLength: 8, description: 'Stored only as an argon2 hash.' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ example: 'Bagus' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @ApiProperty({ description: 'Shared invite code. Registration is closed without it.' })
  @IsString()
  @MinLength(1)
  inviteCode!: string;
}
