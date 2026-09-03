import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@myfinance/shared';

import { PrismaService } from '../../database/prisma.service';
import { CreateSettlementDto } from '../models/create-settlement.dto';
import { OutstandingCurrencyTotalResponse } from '../models/outstanding-currency-total.response';
import { OutstandingReimbursementResponse } from '../models/outstanding-reimbursement.response';
import { OutstandingReimbursementsResponse } from '../models/outstanding-reimbursements.response';
import { TransactionResponse } from '../models/transaction.response';

import { assertNotSettlementPosting } from './assert-not-settlement-posting';
import { computeSplit } from './compute-split';
import { transactionInclude } from './transaction-include';
import { TransactionsService } from './transactions.service';

/**
 * Reimbursements: recording that one account paid back its share of a receipt
 * another account fronted, and posting the money that moved.
 *
 * The split itself is derived on every read by `computeSplit` and stores nothing.
 * This service owns the one thing that *is* stored — the settlement row — and the
 * pair of transactions it posts: an INCOME on the account that paid the receipt and
 * an EXPENSE on the account that owed. Both hang off it and cascade from it, so
 * undoing a reimbursement is a single delete.
 *
 * The stored identifiers still read `settlement` / `owedAccountId`; the product
 * language is **reimbursement**, and every string a user can see says so. Renaming
 * the columns would buy consistency at the price of a migration and a client
 * regeneration, and was deliberately not taken.
 *
 * Like the item endpoints, every method returns the whole parent
 * `TransactionResponse`, so the receipt re-renders from one reply.
 */
@Injectable()
export class TransactionSplitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionsService: TransactionsService,
  ) {}

  /**
   * Records one account reimbursing its whole share of one receipt.
   *
   * The amount is not the caller's to choose: it is whatever the split says is owed
   * at this moment, snapshotted so that editing the receipt afterwards cannot
   * rewrite what was actually paid back.
   */
  async settle(
    userId: string,
    transactionId: string,
    dto: CreateSettlementDto,
  ): Promise<TransactionResponse> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId },
      include: transactionInclude,
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
    }

    assertNotSettlementPosting(transaction, 'split');

    const debtor = computeSplit(transaction)?.debtors.find(
      (row) => row.accountId === dto.owedAccountId,
    );

    if (!debtor) {
      throw new NotFoundException(
        `Account ${dto.owedAccountId} has no share of transaction ${transactionId} to reimburse. ` +
          'An account has a share only when a line is filed under a category linked to it.',
      );
    }

    if (debtor.owedMinor <= 0) {
      throw new BadRequestException(
        `${debtor.accountName} has no share of this receipt to reimburse.`,
      );
    }

    const owedAccount = await this.getAccountOrThrow(userId, dto.owedAccountId);

    // No FX rate exists anywhere in the system, so a cross-currency repayment could
    // only be posted by pretending the two scales are the same.
    if (owedAccount.currency !== transaction.currency) {
      throw new BadRequestException(
        `Cannot reimburse across currencies: this receipt is in ${transaction.currency} but ` +
          `${owedAccount.name} is in ${owedAccount.currency}.`,
      );
    }

    const settledAt = dto.settledAt ? new Date(dto.settledAt) : new Date();
    const receiptLabel = transaction.description ?? 'a shared receipt';

    await this.prisma.$transaction(async (tx) => {
      const settlement = await tx.transactionSettlement.create({
        data: {
          userId,
          transactionId,
          owedAccountId: owedAccount.id,
          settledMinor: debtor.owedMinor,
          settledAt,
        },
      });

      // Written straight through Prisma rather than TransactionsService.create,
      // which would refuse both legs: an expense may not be given an amount
      // directly (it is derived from its lines) and income may not be left
      // uncategorised. Those rules protect hand-entered receipts; a system-posted
      // pair is neither, and `settlementId` is what keeps the exemption contained —
      // every write path refuses to touch a row that carries one.
      //
      // Both legs are deliberately uncategorised. The spending was already
      // classified line by line on the receipt itself; repeating those categories
      // here would count the same money twice in the summary's breakdown. A
      // settlement is a movement between wallets, not new spending.
      await tx.transaction.createMany({
        data: [
          {
            userId,
            accountId: transaction.accountId,
            type: TransactionType.INCOME,
            amountMinor: debtor.owedMinor,
            currency: transaction.currency,
            occurredAt: settledAt,
            settlementId: settlement.id,
            description: `Reimbursement from ${owedAccount.name} — ${receiptLabel}`,
          },
          {
            userId,
            accountId: owedAccount.id,
            type: TransactionType.EXPENSE,
            amountMinor: debtor.owedMinor,
            currency: transaction.currency,
            occurredAt: settledAt,
            settlementId: settlement.id,
            description: `Reimbursement to ${transaction.account.name} — ${receiptLabel}`,
          },
        ],
      });
    });

    return this.transactionsService.findOne(userId, transactionId);
  }

  /**
   * Undoes a settlement, taking both postings with it.
   *
   * One delete: the postings hang off the settlement with `onDelete: Cascade`, so
   * there is no window in which the record is gone but the money it moved is not.
   */
  async unsettle(
    userId: string,
    transactionId: string,
    owedAccountId: string,
  ): Promise<TransactionResponse> {
    const settlement = await this.prisma.transactionSettlement.findFirst({
      where: { userId, transactionId, owedAccountId },
      select: { id: true },
    });

    if (!settlement) {
      throw new NotFoundException(
        `Account ${owedAccountId} has not reimbursed anything on transaction ${transactionId}`,
      );
    }

    await this.prisma.transactionSettlement.delete({ where: { id: settlement.id } });

    return this.transactionsService.findOne(userId, transactionId);
  }

  /**
   * Every share still owed, across every receipt, rolled up per pair of wallets.
   *
   * The dashboard's question — "who has not paid me back?" — which no per-receipt
   * read can answer. The split is derived, so there is no debt table to query: the
   * receipts that could carry someone else's line are loaded and run through the
   * same `computeSplit` the transaction endpoints use. Reimplementing the
   * arithmetic here would let this figure disagree with the one on the receipt.
   *
   * Deliberately unpaginated: the result is bounded by how many pairs of accounts
   * have ever shared a receipt, not by how many rows exist.
   */
  async listOutstanding(userId: string): Promise<OutstandingReimbursementsResponse> {
    const receipts = await this.prisma.transaction.findMany({
      where: {
        userId,
        type: TransactionType.EXPENSE,
        // A settlement posting is the repayment itself, not a receipt to split.
        settlementId: null,
        // Only a line filed under a category linked to *some* account can be owed.
        // Prisma cannot compare that account to the receipt's own, so `computeSplit`
        // does the exact filtering; this only narrows the scan to receipts that
        // could possibly qualify.
        items: { some: { category: { accountId: { not: null } } } },
      },
      include: transactionInclude,
      orderBy: { occurredAt: 'desc' },
    });

    const rows = new Map<string, OutstandingReimbursementResponse>();

    for (const receipt of receipts) {
      const split = computeSplit(receipt);

      if (!split) continue;

      for (const debtor of split.debtors) {
        // A settled share is not owed. A zero share is a settlement that was later
        // edited off the receipt — `computeSplit` keeps that row so its postings can
        // still be undone, but it is not a live debt.
        if (debtor.settlement || debtor.owedMinor <= 0) continue;

        // Currency belongs in the key, not just the payload: `settle` refuses a
        // cross-currency repayment, so two currencies are two debts.
        const key = `${debtor.accountId}:${receipt.accountId}:${receipt.currency}`;
        const occurredAt = receipt.occurredAt.toISOString();

        const row = rows.get(key) ?? {
          owedAccountId: debtor.accountId,
          owedAccountName: debtor.accountName,
          paidByAccountId: receipt.accountId,
          paidByAccountName: receipt.account.name,
          currency: receipt.currency,
          owedMinor: 0,
          receiptCount: 0,
          oldestOccurredAt: occurredAt,
          receipts: [],
        };

        row.owedMinor += debtor.owedMinor;
        row.receiptCount += 1;
        row.receipts.push({
          transactionId: receipt.id,
          description: receipt.description,
          merchantName: receipt.merchant?.name ?? null,
          occurredAt,
          owedMinor: debtor.owedMinor,
        });
        // Newest first out of the database, so each receipt reached is older than
        // the last and the final one to land here is the oldest.
        row.oldestOccurredAt = occurredAt;

        rows.set(key, row);
      }
    }

    const data = [...rows.values()].sort(
      (a, b) =>
        b.owedMinor - a.owedMinor ||
        a.owedAccountName.localeCompare(b.owedAccountName) ||
        a.paidByAccountName.localeCompare(b.paidByAccountName),
    );

    return { data, totalsByCurrency: this.rollUpByCurrency(data) };
  }

  /**
   * `findFirst`, not `findUnique`: the id alone is unique, but a lookup that ignores
   * `userId` would happily settle against someone else's wallet.
   */
  private async getAccountOrThrow(userId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({ where: { id: accountId, userId } });

    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    return account;
  }

  /** One total per currency, in the order the largest debts appear. */
  private rollUpByCurrency(
    rows: readonly OutstandingReimbursementResponse[],
  ): OutstandingCurrencyTotalResponse[] {
    const totals = new Map<string, number>();

    for (const row of rows) {
      totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.owedMinor);
    }

    return [...totals.entries()].map(([currency, owedMinor]) => ({ currency, owedMinor }));
  }
}
