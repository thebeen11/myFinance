import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DIRECT_URL / DATABASE_URL is not set — copy .env.example to apps/api/.env');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * One-off: gives every pre-existing transaction the single line item it implies.
 *
 * A transaction used to *be* a line of detail — one amount, one category. Now it
 * is a receipt whose amount is the sum of its items, so a header left with no
 * items would read as zero the first time anything recomputed it, and its
 * category would be gone with the dropped column. This turns each old row into
 * the one-line receipt it always was, carrying its category down to the line.
 *
 * Idempotent: transactions that already have items are skipped, so re-running is
 * safe. Run it between the two `db push` steps — after `transaction_items` exists
 * and before `transactions.category_id` is dropped.
 */
const main = async (): Promise<void> => {
  // `category_id` is read as raw SQL on purpose: this script runs while the
  // column still exists but the Prisma model has already let it go, and once the
  // second db push has dropped it there is nothing left for a typed read to hit.
  const transactions = await prisma.$queryRaw<
    { id: string; userId: string; categoryId: string | null; amountMinor: number; description: string | null }[]
  >`
    SELECT t.id, t."userId", t."categoryId", t."amountMinor", t.description
    FROM transactions t
    WHERE t."amountMinor" <> 0
      AND NOT EXISTS (SELECT 1 FROM transaction_items i WHERE i."transactionId" = t.id)
    ORDER BY t."createdAt" ASC
  `;

  if (transactions.length === 0) {
    console.log('Nothing to backfill — every transaction already has line items.');
    return;
  }

  await prisma.transactionItem.createMany({
    data: transactions.map((transaction) => ({
      userId: transaction.userId,
      transactionId: transaction.id,
      productId: null,
      categoryId: transaction.categoryId,
      name: transaction.description ?? 'Transaction',
      quantityMilli: 1_000,
      unitPriceMinor: transaction.amountMinor,
      lineTotalMinor: transaction.amountMinor,
      position: 0,
    })),
  });

  const uncategorised = transactions.filter((transaction) => !transaction.categoryId).length;

  console.log(
    `Backfilled ${transactions.length} line items (${uncategorised} with no category — those were uncategorised transactions).`,
  );
};

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
