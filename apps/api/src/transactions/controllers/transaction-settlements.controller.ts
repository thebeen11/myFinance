import { Body, Controller, Delete, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CreateSettlementDto } from '../models/create-settlement.dto';
import { TransactionResponse } from '../models/transaction.response';
import { TransactionSplitsService } from '../services/transaction-splits.service';

/**
 * Repayments of a receipt one wallet fronted for another.
 *
 * The split itself has no routes: it is derived and arrives on the transaction. Only
 * settling is a write, and it is addressed by the **owing account** rather than by an
 * id of its own, because that is the grain a debt exists at — one wallet's share of
 * one receipt, settled once.
 *
 * Like the item routes, every method returns the parent transaction, so the receipt
 * re-renders from one reply.
 */
@ApiTags('transaction-settlements')
@ApiBearerAuth()
@Controller('transactions/:transactionId/settlements')
export class TransactionSettlementsController {
  constructor(private readonly transactionSplitsService: TransactionSplitsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Record that a wallet paid back its share of this receipt. Settles the whole of what it ' +
      'currently owes and posts both sides of the money.',
  })
  settle(
    @CurrentUser() userId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() dto: CreateSettlementDto,
  ): Promise<TransactionResponse> {
    return this.transactionSplitsService.settle(userId, transactionId, dto);
  }

  @Delete(':owedAccountId')
  @ApiOperation({
    summary: 'Undo a settlement, removing both transactions it posted.',
  })
  unsettle(
    @CurrentUser() userId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Param('owedAccountId', ParseUUIDPipe) owedAccountId: string,
  ): Promise<TransactionResponse> {
    return this.transactionSplitsService.unsettle(userId, transactionId, owedAccountId);
  }
}
