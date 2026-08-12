import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoryKind } from '@myfinance/shared';
import {
  IsEnum,
  IsHexColor,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Groceries' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  /**
   * The account this category is paid from. Optional — an unassigned category can
   * be used on any account.
   *
   * `null` and absent are not the same thing and must stay distinguishable all the
   * way to Prisma: absent means "leave the link alone", `null` means "clear it".
   */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  accountId?: string | null;

  @ApiProperty({ enum: CategoryKind, enumName: 'CategoryKind' })
  @IsEnum(CategoryKind)
  kind!: CategoryKind;

  @ApiPropertyOptional({
    example: '#22c55e',
    description: 'Hex swatch used by the UI.',
  })
  @IsOptional()
  @IsHexColor()
  color?: string;
}
