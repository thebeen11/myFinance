import { ApiProperty } from '@nestjs/swagger';

/**
 * Everything outstanding in one currency.
 *
 * Same rule as `AccountCurrencyTotalResponse`: amounts are only ever summed
 * *within* a currency, because a total across them would not be money.
 */
export class OutstandingCurrencyTotalResponse {
  @ApiProperty({ description: 'ISO 4217 code.' })
  currency!: string;

  @ApiProperty({ description: 'Integer minor units of `currency`.' })
  owedMinor!: number;
}
