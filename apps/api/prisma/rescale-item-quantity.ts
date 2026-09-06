import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DIRECT_URL / DATABASE_URL is not set — copy .env.example to apps/api/.env');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * One-off: turns `transaction_items.quantity` into `quantityMilli`.
 *
 * A quantity used to be whole units, so a weighed item could not be entered as
 * what the receipt says — 1.5 kg of watermelon at Rp 40.000/kg had to be typed as
 * one unit at Rp 60.000, a price that is not the shelf price and which then got
 * written back to the catalogue as one. It is now thousandths of a unit, so every
 * stored row is worth a thousand times what its integer says.
 *
 * Run this **before** `pnpm db:push`, not after: `db push` implements a rename as
 * a drop and an add, which would take every existing quantity with it. Doing the
 * rename and the rescale here leaves the push with nothing to apply, which is the
 * confirmation that the two agree. Same arrangement as
 * `backfill-transaction-items.ts`, which also runs between pushes.
 *
 * Idempotent: it keys off whether the old column is still there, so a second run
 * reports that there is nothing to do rather than multiplying by a thousand twice.
 */
const main = async (): Promise<void> => {
  // Raw SQL throughout: this runs while the database still has the old column and
  // the Prisma model has already let it go, so a typed read has nothing to hit.
  const [existing] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transaction_items'
      AND column_name = 'quantity'
  `;

  if (!existing || existing.count === 0n) {
    console.log('Nothing to rescale — transaction_items.quantity is already quantityMilli.');
    return;
  }

  // One transaction: a rename that landed without its rescale would leave every
  // line reading as a thousandth of what was bought, with nothing to detect it.
  await prisma.$transaction([
    prisma.$executeRawUnsafe(
      'ALTER TABLE transaction_items RENAME COLUMN "quantity" TO "quantityMilli"',
    ),
    prisma.$executeRawUnsafe(
      'UPDATE transaction_items SET "quantityMilli" = "quantityMilli" * 1000',
    ),
    prisma.$executeRawUnsafe(
      'ALTER TABLE transaction_items ALTER COLUMN "quantityMilli" SET DEFAULT 1000',
    ),
  ]);

  const [rescaled] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count FROM transaction_items
  `;

  console.log(`Rescaled ${rescaled?.count ?? 0n} line quantities to thousandths of a unit.`);
};

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
