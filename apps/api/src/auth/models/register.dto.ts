import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ format: 'email', example: 'you@example.com' })
  @IsEmail()
  @MaxLength(160)
  email!: string;

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
