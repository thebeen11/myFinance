import { Module } from '@nestjs/common';

import { TransactionItemsController } from './controllers/transaction-items.controller';
import { TransactionSettlementsController } from './controllers/transaction-settlements.controller';
import { TransactionsController } from './controllers/transactions.controller';
import { TransactionItemsService } from './services/transaction-items.service';
import { TransactionSplitsService } from './services/transaction-splits.service';
import { TransactionsService } from './services/transactions.service';

@Module({
  controllers: [
    TransactionsController,
    TransactionItemsController,
    TransactionSettlementsController,
  ],
  providers: [TransactionsService, TransactionItemsService, TransactionSplitsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
