import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountType, DEFAULT_CURRENCY } from '@myfinance/shared';
import { IsEnum, IsInt, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class CreateAccountDto {
  @ApiProperty({ example: 'BCA Payroll' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ enum: AccountType, enumName: 'AccountType' })
  @IsEnum(AccountType)
  type!: AccountType;

  @ApiPropertyOptional({
    default: DEFAULT_CURRENCY,
    description: 'ISO 4217 code.',
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({
    default: 0,
    description: 'Balance before the first tracked transaction, in minor units.',
  })
  @IsOptional()
  @IsInt()
  openingBalanceMinor?: number;
}
