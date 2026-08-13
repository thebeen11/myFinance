# myFinance

Personal finance tracking: a NestJS REST API over Supabase Postgres, and a Next.js web client.

```
apps/api      NestJS 11 + Prisma 7   -> http://localhost:8001  (Swagger at /api)
apps/web      Next.js 16 App Router  -> http://localhost:3000
packages/shared  enums + money helpers shared by both
```

The web app never talks to the database — the API is the only writer. Supabase is used as managed
Postgres. Sign-in is email + password with a JWT issued by the API; registration is invite-only and
every row is scoped to its owner.

## Setup

Requires Node 20+ and pnpm 10.

```bash
pnpm install
```

### 1. Point at a Supabase project

Create a project at [supabase.com](https://supabase.com), then in the dashboard go to
**Project Settings → Database → Connection string** and copy the **session pooler** URL (port 5432).

```bash
cp .env.example apps/api/.env          # fill in DATABASE_URL and DIRECT_URL
echo 'NEXT_PUBLIC_API_URL="http://localhost:8001"' > apps/web/.env.local
```

Use the `…pooler.supabase.com` host, not `db.<project-ref>.supabase.co` — the direct host is
IPv6-only on new projects and usually will not resolve.

### 2. Create the schema and seed it

```bash
pnpm db:push     # applies prisma/schema.prisma to the database
```

You do not need to seed: registering creates the default categories and a Cash wallet for the new
account. `pnpm db:seed` is a repair tool that restores those defaults for an existing user
(`SEED_USER_EMAIL`, otherwise the oldest).

### 3. Run

```bash
pnpm dev         # both apps, via turbo
```

Open <http://localhost:3000> — you will be sent to `/login`. Create the first account at
`/register` using the `INVITE_CODE` from `apps/api/.env`; that first account also adopts any rows
that already existed before authentication was added.

The API's Swagger UI is at <http://localhost:8001/api> (click **Authorize** to paste a token).

## Everyday commands

| Command                                                     | What it does                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                                                  | Run API and web together                                    |
| `pnpm build` / `pnpm lint` / `pnpm typecheck` / `pnpm test` | Across every package                                        |
| `pnpm generate:api`                                         | Regenerate the frontend's typed client from the running API |
| `pnpm db:push` / `pnpm db:seed` / `pnpm db:studio`          | Schema sync, seed data, Prisma Studio                       |
| `pnpm db:migrate` / `pnpm db:deploy`                        | Emit a SQL migration / apply migrations                     |

After changing any controller, DTO or response class, restart the API and run `pnpm generate:api` —
`apps/web/src/api/` is generated and must not be edited by hand.

## Deploying the API to Vercel

The API runs as a single serverless function that fronts the whole Nest app. `apps/api/api/index.js`
is the entrypoint Vercel picks up; it defers to `dist/vercel.js`, which boots Nest with `app.init()`
(never `app.listen()`) and caches the instance between invocations. `apps/api/vercel.json` rewrites
every path to it, so Nest keeps its own routing.

Create the Vercel project with **Root Directory = `apps/api`**. Everything else comes from
`vercel.json`.

Set these in Project Settings → Environment Variables — the app throws at boot without them, which
surfaces as `FUNCTION_INVOCATION_FAILED` rather than a readable error:

| Variable            | Note                                                                             |
| ------------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`      | **Transaction** pooler (port 6543) — serverless, not the session pooler          |
| `DIRECT_URL`        | Session pooler (5432); read by the Prisma CLI during `prisma generate`           |
| `JWT_ACCESS_SECRET` | Same value as local or the tokens you already issued stop verifying              |
| `INVITE_CODE`       | Unset closes registration                                                        |
| `CORS_ORIGINS`      | The deployed web origin, comma-separated — omitting it blocks every browser call |

`JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_DAYS` and `DATABASE_POOL_MAX` are optional. Swagger is
served only when `NODE_ENV !== 'production'`, so `/api` is 404 on a deployment — generate the client
against a local API.

## Data model

`User` owns `Account` → `Transaction` ← `Category`. Every amount is an **integer in minor units** with
an ISO 4217 currency (`amountMinor`, `openingBalanceMinor`); convert with `toMinor`/`fromMinor` from
`@myfinance/shared`. `Transaction.amountMinor` is always positive — the sign comes from its
`type` (`INCOME` / `EXPENSE`). Currency belongs to the account.

`userId` is `NOT NULL` on every owned table and there is no row-level security, so the API's Prisma
filters are the only thing isolating one user's data from another's. See CLAUDE.md before touching a
query.

Merchants, products, budget envelopes, transfers, budgets and recurring rules are not modelled yet.
