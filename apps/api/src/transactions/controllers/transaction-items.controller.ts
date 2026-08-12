import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CreateTransactionItemDto } from '../models/create-transaction-item.dto';
import { TransactionResponse } from '../models/transaction.response';
import { UpdateTransactionItemDto } from '../models/update-transaction-item.dto';
import { TransactionItemsService } from '../services/transaction-items.service';

/**
 * The lines of one receipt.
 *
 * Every route returns the **parent transaction**, not the line it changed —
 * touching a line re-derives the receipt total, so the caller needs the header
 * back anyway. That is also why `DELETE` answers 200 with a body rather than the
 * 204 the other controllers use.
 */
@ApiTags('transaction-items')
@ApiBearerAuth()
@Controller('transactions/:transactionId/items')
export class TransactionItemsController {
  constructor(private readonly transactionItemsService: TransactionItemsService) {}

  @Post()
  @ApiOperation({
    summary: 'Add a line to a receipt. Returns the transaction with its new total.',
  })
  create(
    @CurrentUser() userId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() dto: CreateTransactionItemDto,
  ): Promise<TransactionResponse> {
    return this.transactionItemsService.create(userId, transactionId, dto);
  }

  @Patch(':itemId')
  @ApiOperation({ summary: 'Edit one line. Returns the transaction with its new total.' })
  update(
    @CurrentUser() userId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateTransactionItemDto,
  ): Promise<TransactionResponse> {
    return this.transactionItemsService.update(userId, transactionId, itemId, dto);
  }

  @Delete(':itemId')
  @ApiOperation({ summary: 'Remove one line. Returns the transaction with its new total.' })
  remove(
    @CurrentUser() userId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<TransactionResponse> {
    return this.transactionItemsService.remove(userId, transactionId, itemId);
  }
}
