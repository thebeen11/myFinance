import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class LoginDto {
  // No format rule here on purpose. The charset is enforced where accounts are
  // made (RegisterDto); on sign-in it would only turn a wrong username into a
  // 400 that contradicts the deliberate "Invalid username or password" 401.
  @ApiProperty({ example: 'bagus' })
  @IsString()
  @MaxLength(32)
  username!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  password!: string;
}
