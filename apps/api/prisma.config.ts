// Prisma 7 config. This file configures the Prisma CLI only — `datasource.url`
// is what `db push` / `migrate` / `studio` connect with. The running app never
// reads it: PrismaService builds its own pg driver adapter from DATABASE_URL.
//
// .env is no longer loaded automatically in v7, hence the explicit dotenv import.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // DDL must not go through a transaction pooler, so the CLI uses DIRECT_URL.
    url: env('DIRECT_URL'),
  },
});
