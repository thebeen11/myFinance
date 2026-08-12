import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ format: 'email', example: 'you@example.com' })
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  password!: string;
}
