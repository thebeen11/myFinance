import { Module } from '@nestjs/common';

import { TransactionsModule } from '../transactions/transactions.module';

import { ReceiptsController } from './controllers/receipts.controller';
import { ReceiptScanService } from './services/receipt-scan.service';
import { ReceiptsService } from './services/receipts.service';

/**
 * Depends on TransactionsModule and nothing depends on it, so the arrow points
 * one way and neither side needs `forwardRef`.
 */
@Module({
  imports: [TransactionsModule],
  controllers: [ReceiptsController],
  providers: [ReceiptScanService, ReceiptsService],
})
export class ReceiptsModule {}
