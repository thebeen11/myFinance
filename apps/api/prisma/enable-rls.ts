import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';

// DDL through a transaction pooler is unreliable, so this runs on DIRECT_URL
// (session pooler, 5432) the way the other prisma/ scripts do.
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DIRECT_URL / DATABASE_URL is not set — copy .env.example to apps/api/.env');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * Turns row level security on for every table this connection owns in `public`,
 * with **no policies attached**, and strips the grants Supabase hands PostgREST.
 *
 * Supabase's Data API serves `public` as the `anon` / `authenticated` roles.
 * That path never reaches the Nest API, so neither `JwtAuthGuard` nor the
 * `userId` filters — the only tenant isolation this system has — apply to it.
 * RLS with zero policies denies those roles outright.
 *
 * It costs the app nothing: Prisma connects as the role that owns these tables,
 * and a table owner bypasses its own RLS. `FORCE ROW LEVEL SECURITY` is
 * deliberately NOT used — it would remove that bypass and break every query.
 *
 * Idempotent, and it discovers tables rather than listing them, so re-running it
 * after a `db push` that added a table is all it takes. Prisma does not model
 * RLS, so new tables always arrive with it off.
 */
const main = async (): Promise<void> => {
  // One DO block rather than a statement per table: the table list and the DDL
  // stay on the server, so this is a single round trip.
  await prisma.$executeRawUnsafe(`
    do $$
    declare t record;
    begin
      for t in
        select tablename from pg_tables
        where schemaname = 'public' and tableowner = current_user
      loop
        execute format('alter table public.%I enable row level security', t.tablename);
      end loop;
    end $$;
  `);

  // Defense in depth: with no privilege at all, a policy added by accident later
  // still grants nothing.
  await prisma.$executeRawUnsafe(
    'revoke all on all tables in schema public from anon, authenticated;',
  );
  await prisma.$executeRawUnsafe(
    'revoke all on all sequences in schema public from anon, authenticated;',
  );
  await prisma.$executeRawUnsafe(
    'alter default privileges in schema public revoke all on tables from anon, authenticated;',
  );

  const tables = await prisma.$queryRaw<{ name: string; isProtected: boolean }[]>`
    select c.relname as "name", c.relrowsecurity as "isProtected"
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and pg_get_userbyid(c.relowner) = current_user
    order by c.relname
  `;

  const unprotected = tables.filter((table) => !table.isProtected).map((table) => table.name);

  console.log(
    `RLS enabled on ${tables.length - unprotected.length}/${tables.length} tables in public` +
      (unprotected.length ? `; still unprotected: ${unprotected.join(', ')}` : '.'),
  );
};

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
