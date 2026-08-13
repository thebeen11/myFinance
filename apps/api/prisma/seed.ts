import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { DEFAULT_CATEGORIES } from '../src/common/constants/default-categories';
import { PrismaClient } from '../src/generated/prisma/client';

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DIRECT_URL / DATABASE_URL is not set — copy .env.example to apps/api/.env');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * Restores the default categories and a Cash wallet for one user.
 *
 * Registration already does this for every new account, so seeding is now a
 * repair tool rather than a first-run step. It targets SEED_USER_USERNAME, or
 * the oldest user when that is unset. Every row needs an owner, so there is
 * nobody to seed for until someone has registered.
 */
const main = async (): Promise<void> => {
  const username = process.env.SEED_USER_USERNAME?.toLowerCase();

  const user = username
    ? await prisma.user.findUnique({ where: { username } })
    : await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });

  if (!user) {
    console.log(
      username
        ? `No user named ${username}. Register at http://localhost:3000/register first.`
        : 'No users yet — register at http://localhost:3000/register first, which seeds these defaults automatically.',
    );
    return;
  }

  // The wallet first: a missing category is created against it, and a category
  // cannot name an account that does not exist yet.
  const cash =
    (await prisma.account.findFirst({ where: { userId: user.id, name: 'Cash' } })) ??
    (await prisma.account.create({
      data: {
        userId: user.id,
        name: 'Cash',
        type: 'CASH',
        currency: 'IDR',
        openingBalanceMinor: 0,
      },
    }));

  for (const category of DEFAULT_CATEGORIES) {
    // Matched on name and kind alone, deliberately ignoring the account. Repairing
    // a user's defaults must not duplicate a category they have already filed
    // under some other wallet, nor quietly drag it back to Cash.
    const existing = await prisma.category.findFirst({
      where: { userId: user.id, name: category.name, kind: category.kind },
    });

    if (existing) {
      await prisma.category.update({ where: { id: existing.id }, data: { color: category.color } });
    } else {
      await prisma.category.create({ data: { ...category, userId: user.id, accountId: cash.id } });
    }
  }

  const [categories, accounts] = await Promise.all([
    prisma.category.count({ where: { userId: user.id } }),
    prisma.account.count({ where: { userId: user.id } }),
  ]);

  console.log(`Seed complete for ${user.username}: ${categories} categories, ${accounts} accounts.`);
};

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
