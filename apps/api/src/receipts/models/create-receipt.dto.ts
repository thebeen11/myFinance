import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { CreateTransactionChargeDto } from '../../transactions/models/create-transaction-charge.dto';
import { CreateTransactionItemDto } from '../../transactions/models/create-transaction-item.dto';

/**
 * A whole receipt, written in one request.
 *
 * This exists because `POST /transactions` takes charges but not line items, so
 * entering a scanned fifteen-line receipt through the normal path is sixteen
 * requests — and a failure at request nine leaves half a receipt in the ledger
 * with a total that is real but wrong. Here the header, its charges and every
 * line commit together or not at all.
 *
 * There is no `type`: a receipt is an expense. Its `amountMinor` is derived from
 * the lines and charges, exactly as it is on every other write path.
 */
export class CreateReceiptDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  accountId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  merchantId?: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-08-10T00:00:00.000Z' })
  @IsDateString()
  occurredAt!: string;

  @ApiPropertyOptional({ example: 'Indomaret' })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  /** Reuses the line shape the per-item endpoints already validate. */
  @ApiProperty({ type: [CreateTransactionItemDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionItemDto)
  items!: CreateTransactionItemDto[];

  @ApiPropertyOptional({ type: [CreateTransactionChargeDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionChargeDto)
  charges?: CreateTransactionChargeDto[];
}
