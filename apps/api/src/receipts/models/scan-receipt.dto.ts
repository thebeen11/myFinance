import { ApiProperty } from '@nestjs/swagger';
import { IsBase64, IsIn, IsString, IsUUID, MaxLength } from 'class-validator';

/** What Gemini accepts inline, narrowed to what the web app actually sends. */
const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Roughly 2.2 MB once decoded. The browser downscales before sending, so a photo
 * arrives well under this; the cap is here so a hand-rolled caller cannot push a
 * 20 MB original through the JSON body parser.
 */
const MAX_BASE64_LENGTH = 3_000_000;

export class ScanReceiptDto {
  /**
   * Required, and not a convenience: the account owns the currency, and reading
   * `12.500` into a zero-decimal IDR account and a two-decimal USD one differ by
   * a factor of 100. Naming the account up front makes the scale provable instead
   * of assumed.
   */
  @ApiProperty({ format: 'uuid', description: 'The account this receipt will be paid from.' })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ enum: SUPPORTED_MIME_TYPES, example: 'image/jpeg' })
  @IsIn(SUPPORTED_MIME_TYPES)
  mimeType!: string;

  @ApiProperty({
    description: 'The photo, base64 encoded, without a data: URL prefix.',
    maxLength: MAX_BASE64_LENGTH,
  })
  @IsString()
  @MaxLength(MAX_BASE64_LENGTH)
  @IsBase64()
  imageBase64!: string;
}
