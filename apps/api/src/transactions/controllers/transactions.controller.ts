import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CreateTransactionDto } from '../models/create-transaction.dto';
import { PaginatedTransactionsResponse } from '../models/paginated-transactions.response';
import { QuerySummaryDto } from '../models/query-summary.dto';
import { QueryTransactionsDto } from '../models/query-transactions.dto';
import { TransactionResponse } from '../models/transaction.response';
import { TransactionsSummaryResponse } from '../models/transactions-summary.response';
import { UpdateTransactionDto } from '../models/update-transaction.dto';
import { TransactionsService } from '../services/transactions.service';

@ApiTags('transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({ summary: 'List transactions, newest first.' })
  findAll(
    @CurrentUser() userId: string,
    @Query() query: QueryTransactionsDto,
  ): Promise<PaginatedTransactionsResponse> {
    return this.transactionsService.findAll(userId, query);
  }

  // Declared before :id so "summary" is not parsed as a UUID.
  @Get('summary')
  @ApiOperation({
    summary: 'Income/expense totals and per-category breakdown for a window.',
  })
  summarise(
    @CurrentUser() userId: string,
    @Query() query: QuerySummaryDto,
  ): Promise<TransactionsSummaryResponse> {
    return this.transactionsService.summarise(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single transaction.' })
  findOne(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TransactionResponse> {
    return this.transactionsService.findOne(userId, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Record a transaction. Currency is inherited from the account.',
  })
  create(
    @CurrentUser() userId: string,
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionResponse> {
    return this.transactionsService.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a transaction.' })
  update(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
  ): Promise<TransactionResponse> {
    return this.transactionsService.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a transaction.' })
  remove(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.transactionsService.remove(userId, id);
  }
}
