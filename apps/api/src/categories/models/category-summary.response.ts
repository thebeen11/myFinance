import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoryKind } from '@myfinance/shared';

/**
 * Just enough category to render something that *has* one — a receipt line, a
 * product — without a second request.
 *
 * Lives here rather than in either consumer because both need the same four
 * fields: the domain owns the shape, and a forked copy per consumer would drift.
 */
export class CategorySummaryResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: CategoryKind, enumName: 'CategoryKind' })
  kind!: CategoryKind;

  @ApiPropertyOptional({ type: String, nullable: true })
  color!: string | null;
}
