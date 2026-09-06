import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DIRECT_URL / DATABASE_URL is not set — copy .env.example to apps/api/.env');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * One-off: gives every already-discounted line the discount row it implies.
 *
 * A line used to carry its single discount in its own columns. Now the discounts
 * are rows that cascade, and `TransactionItem.discountBasisPoints` is the derived
 * effective rate rather than the input — so an old line with no rows would read
 * as undiscounted the first time anything re-derived it, and the next edit would
 * silently drop what the receipt said.
 *
 * The figures are copied rather than recomputed: what was stored is what was
 * paid, and a single rate over the same gross re-derives to itself anyway.
 *
 * Idempotent: lines that already have discount rows are skipped. Run it right
 * after the `db push` that adds `transaction_item_discounts`.
 */
const main = async (): Promise<void> => {
  const items = await prisma.transactionItem.findMany({
    where: { discountBasisPoints: { gt: 0 }, discounts: { none: {} } },
    select: { id: true, userId: true, discountBasisPoints: true, discountMinor: true },
  });

  if (items.length === 0) {
    console.log('Nothing to backfill — every discounted line already has its rows.');
    return;
  }

  await prisma.transactionItemDiscount.createMany({
    data: items.map((item) => ({
      userId: item.userId,
      transactionItemId: item.id,
      name: null,
      basisPoints: item.discountBasisPoints,
      amountMinor: item.discountMinor,
      position: 0,
    })),
  });

  console.log(`Backfilled ${items.length} discount rows.`);
};

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
