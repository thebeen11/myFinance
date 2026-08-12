import { Module } from '@nestjs/common';

import { TransactionItemsController } from './controllers/transaction-items.controller';
import { TransactionsController } from './controllers/transactions.controller';
import { TransactionItemsService } from './services/transaction-items.service';
import { TransactionsService } from './services/transactions.service';

@Module({
  controllers: [TransactionsController, TransactionItemsController],
  providers: [TransactionsService, TransactionItemsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
