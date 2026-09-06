import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { TransactionResponse } from '../../transactions/models/transaction.response';
import { CreateReceiptDto } from '../models/create-receipt.dto';
import { ReceiptDraftResponse } from '../models/receipt-draft.response';
import { ScanReceiptDto } from '../models/scan-receipt.dto';
import { ReceiptScanService } from '../services/receipt-scan.service';
import { ReceiptsService } from '../services/receipts.service';

/**
 * Reading a receipt, in two deliberate halves.
 *
 * `POST /receipts/scan` only *proposes*: it writes nothing, so a misread line
 * never reaches a balance. `POST /receipts` is the reviewed result being
 * committed. Keeping them apart is what makes the model's output correctable
 * rather than authoritative.
 */
@ApiTags('receipts')
@ApiBearerAuth()
@Controller('receipts')
export class ReceiptsController {
  constructor(
    private readonly receiptScanService: ReceiptScanService,
    private readonly receiptsService: ReceiptsService,
  ) {}

  @Post('scan')
  // 200, not the POST default 201: nothing was created, and a client that treats
  // 201 as "it is saved" would be wrong about the only thing that matters here.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read a receipt photo into a draft. Writes nothing.',
    description:
      'Extracts the merchant, date, lines and charges, resolves them against the ' +
      'catalogue, and returns both the printed total and the derived one so the ' +
      'reviewer can see whether anything was misread.',
  })
  scan(@CurrentUser() userId: string, @Body() dto: ScanReceiptDto): Promise<ReceiptDraftResponse> {
    return this.receiptScanService.scan(userId, dto);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an expense with all its lines and charges in one atomic write.',
  })
  create(
    @CurrentUser() userId: string,
    @Body() dto: CreateReceiptDto,
  ): Promise<TransactionResponse> {
    return this.receiptsService.create(userId, dto);
  }
}
