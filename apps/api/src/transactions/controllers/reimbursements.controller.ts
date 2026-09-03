import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { OutstandingReimbursementsResponse } from '../models/outstanding-reimbursements.response';
import { TransactionSplitsService } from '../services/transaction-splits.service';

/**
 * Reimbursements read across every receipt at once.
 *
 * Top-level rather than nested under a transaction, unlike
 * `TransactionSettlementsController`: the whole point of this route is the debts you
 * would never find by opening one receipt at a time. Sitting outside
 * `/transactions` also keeps it clear of the `:id` route, which `summary` already
 * has to be declared ahead of.
 */
@ApiTags('reimbursements')
@ApiBearerAuth()
@Controller('reimbursements')
export class ReimbursementsController {
  constructor(private readonly transactionSplitsService: TransactionSplitsService) {}

  @Get('outstanding')
  @ApiOperation({
    summary:
      'Every share still owed from one wallet to another, rolled up per pair of wallets and ' +
      'largest first.',
  })
  findOutstanding(@CurrentUser() userId: string): Promise<OutstandingReimbursementsResponse> {
    return this.transactionSplitsService.listOutstanding(userId);
  }
}
