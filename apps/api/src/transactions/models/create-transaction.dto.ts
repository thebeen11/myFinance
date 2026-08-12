import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '@myfinance/shared';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * One transaction, entered two different ways depending on its `type`.
 *
 * An **expense** is a receipt header and only a header: no amount and no
 * category, because the amount is the sum of its line items and category lives
 * on those lines — one receipt from one shop routinely spans several of them.
 *
 * **Income** has no receipt to itemise, so it is posted to the account as a
 * single figure: `amountMinor` and `categoryId` are both required, and it never
 * gets lines at all.
 *
 * Which fields are required is therefore decided by `type`, and that rule lives
 * in TransactionsService rather than in conditional decorators here — it needs to
 * run identically on create and update, and it has to resolve the category to
 * check its kind either way.
 */
export class CreateTransactionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  accountId!: string;

  /**
   * Optional. A transaction with no merchant is perfectly valid.
   *
   * `null` and absent are not the same thing and must stay distinguishable all the
   * way to Prisma: absent means "leave the link alone", `null` means "clear it".
   */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  merchantId?: string | null;

  @ApiProperty({ enum: TransactionType, enumName: 'TransactionType' })
  @IsEnum(TransactionType)
  type!: TransactionType;

  /**
   * Income only, where it is required. Minor units of the account's currency,
   * always positive — the sign comes from `type`.
   *
   * Rejected on an expense, whose total is the API's to derive from its lines.
   */
  @ApiPropertyOptional({
    example: 8_000_000,
    minimum: 1,
    description: "Required on INCOME, rejected on EXPENSE. Minor units of the account's currency.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  amountMinor?: number;

  /**
   * Income only, where it is required and must be an `INCOME` category.
   *
   * Rejected on an expense, which is classified line by line instead.
   *
   * `null` and absent are not the same thing, same as `merchantId`.
   */
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Required on INCOME and must be an INCOME category. Rejected on EXPENSE.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-08-10T00:00:00.000Z' })
  @IsDateString()
  occurredAt!: string;

  @ApiPropertyOptional({ example: 'Weekly groceries' })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
