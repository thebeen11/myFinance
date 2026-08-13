import { ApiProperty } from '@nestjs/swagger';

/**
 * Balances held in one currency, across every account matching the filter.
 *
 * Amounts are only ever summed *within* a currency: nothing in the system holds
 * an FX rate, so a total across currencies would not be money.
 */
export class AccountCurrencyTotalResponse {
  @ApiProperty({ description: 'ISO 4217 code.' })
  currency!: string;

  @ApiProperty({ description: 'Integer minor units of `currency`.' })
  totalMinor!: number;

  @ApiProperty({ description: 'Accounts denominated in this currency.' })
  accountCount!: number;
}
