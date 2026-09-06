import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';
import { TransactionResponse } from '../../transactions/models/transaction.response';
import { TransactionItemsService } from '../../transactions/services/transaction-items.service';
import { TransactionsService } from '../../transactions/services/transactions.service';
import { CreateReceiptDto } from '../models/create-receipt.dto';

/**
 * Posts a whole reviewed receipt in one atomic write.
 *
 * The header, its charges and every line commit together: entering the same
 * receipt through `POST /transactions` plus one call per line would leave a real
 * transaction with a partial total behind any request that failed halfway, and a
 * scanned basket is routinely fifteen lines long.
 *
 * The total is still derived rather than accepted — `recomputeTotal` runs inside
 * the same transaction, so this path cannot become a way to write an expense
 * total by hand.
 */
@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionsService: TransactionsService,
    private readonly transactionItemsService: TransactionItemsService,
  ) {}

  async create(userId: string, dto: CreateReceiptDto): Promise<TransactionResponse> {
    // The account owns the currency; a transaction never sets its own.
    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, userId },
      select: { id: true, currency: true },
    });

    if (!account) {
      throw new NotFoundException(`Account ${dto.accountId} not found`);
    }

    await this.assertMerchantOwned(userId, dto.merchantId ?? undefined);

    const charges = dto.charges ?? [];

    const transactionId = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          userId,
          accountId: account.id,
          merchantId: dto.merchantId ?? null,
          type: TransactionType.EXPENSE,
          // Derived a few lines below, once the rows it sums exist.
          amountMinor: 0,
          currency: account.currency,
          occurredAt: new Date(dto.occurredAt),
          description: dto.description ?? null,
          notes: dto.notes ?? null,
          charges: {
            create: charges.map((charge, position) => ({
              userId,
              name: charge.name,
              percentBasisPoints: charge.percentBasisPoints ?? null,
              amountMinor: charge.amountMinor,
              position,
            })),
          },
        },
        select: { id: true, type: true, currency: true },
      });

      await this.transactionItemsService.createManyInTransaction(
        tx,
        userId,
        transaction,
        dto.items,
      );

      await this.transactionsService.recomputeTotal(tx, transaction.id);

      return transaction.id;
    });

    return this.transactionsService.findOne(userId, transactionId);
  }

  /**
   * A merchant link is optional, but a present one has to be ours — otherwise
   * this is a way to learn that another tenant's merchant exists.
   */
  private async assertMerchantOwned(userId: string, merchantId: string | undefined): Promise<void> {
    if (!merchantId) return;

    const merchant = await this.prisma.merchant.findFirst({
      where: { id: merchantId, userId },
      select: { id: true },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant ${merchantId} not found`);
    }
  }
}
