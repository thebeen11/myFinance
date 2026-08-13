# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**The owner, plus people the owner invites.** Erumah is a private, invite-only tool. There is a public
registration _page_, but it is gated on a shared invite code the owner hands out, so nobody arrives
without being let in deliberately and there is no audience to acquire.

Each invited person is a **separate tenant with their own data** (see Capabilities). Being invited grants
entry to the app, not access to anyone else's money.

The owner is an expert daily user. Invited members may not be, and may use the app rarely — so the
entry flow cannot assume the fluency the owner has, even though nothing needs a marketing funnel.

Two distinct situations, both first-class:

- **Phone, in the moment.** Logging a purchase seconds after paying — possibly one-handed, standing,
  outdoors, in daylight. The job is _capture without friction_.
- **Desktop, on review.** Sitting down to check where money went, correct entries, and maintain master
  data. The job is _scanning and judgment_.

Neither device is a resized version of the other; they serve different jobs for the same person.

## Product Purpose

Track personal money across every place it actually lives — cash, bank, e-wallets, credit cards,
investments — and keep the record complete enough to be trusted.

The record is only useful if it is complete, and it is only complete if logging is effortless. So the
product's real work is removing the cost of entry.

Success is a month with no missing transactions and no manual re-categorising.

## Positioning

**Merchant and product master data that resolves payment routing before the user is asked.**

The mechanism, confirmed with the user:

1. **Merchants** are master data. Each merchant has **products**.
2. Each product is bound to a **wallet** — a budget envelope (see Capabilities) — so the product itself
   carries the answer to "which envelope pays for this."
3. Each product **remembers its last price**, stored on the product master record and prefilled at
   entry.
4. Entering a purchase means picking a merchant and its products. A basket of several products is
   **grouped by wallet and posted as one transaction per wallet** — the split is derived, never asked.

A bank app cannot do this: it sees one institution and learns nothing about what was bought. A
spreadsheet cannot do this: it has no master data, so every row is retyped and re-classified. The
value is that by the time the user is entering a purchase, the app already knows who is paying.

## Operating Context

- **Currency is IDR by default** (`DEFAULT_CURRENCY`), which has **zero fraction digits** — amounts are
  whole rupiah and read as large numbers. Anything that assumes two decimal places or short numerals is
  wrong here. Currency belongs to the account; a transaction inherits it.
- **Indonesian money is multi-rail.** Cash, bank transfer, and e-wallets (`EWALLET`) are all routine, and
  a single merchant visit can be paid from any of them. This is why the account roster matters and why a
  single-institution view is insufficient.
- Real merchant visits are **baskets**, not single amounts. One receipt spans several products, which may
  legitimately belong to different budget envelopes.
- Local development runs two processes: API on **8001**, web on **3000**. Web reaches the API only over
  REST; it holds no database credentials. Hosted Supabase is used as managed Postgres (no Docker on this
  machine, so no local stack).

## Capabilities and Constraints

### Built today

- **Accounts** — name, `type` (`CASH`, `BANK`, `EWALLET`, `CREDIT_CARD`, `INVESTMENT`), `currency`,
  `openingBalanceMinor`, soft archive via `archivedAt`. Balance is computed per account.
- **Categories** — `name` + `kind` (`INCOME` / `EXPENSE`), unique on the pair, with an optional hex
  `color` the UI is expected to use.
- **Transactions** — `type`-signed (`INCOME` / `EXPENSE`) with an **always-positive** `amountMinor`;
  `occurredAt`, optional `description`, `notes`, optional category. Created, edited and deleted from the
  web app.
- **Additional charges** — tax, service charge, delivery: money on an expense that was paid but not
  bought, named by hand and counted into the derived total alongside the line items. A percentage may be
  typed to _seed_ the amount off the running total, but the amount is then edited to match the receipt —
  the printed figure wins over the arithmetic. Charges carry no category, so they are absent from the
  summary's per-category breakdown.
- **Line discounts** — a promo or member price on one line, entered as a **percentage**. The rate is
  what is stored; the API derives the money and the net line total from it, so changing the quantity
  later re-applies the rate rather than leaving a figure that describes the price the line used to be.
  This is deliberately the **opposite rule** from an additional charge — a charge is a figure printed on
  the receipt and recorded verbatim, a discount is a rate applied to a gross the app already knows. The
  catalogue keeps the undiscounted price: a one-off promotion belongs to that receipt, not to the product.
- **Split bill** — a receipt one account paid for several. A line filed under a category linked to a
  _different_ account is money this account covered for that one; the app already permits that mismatch,
  and the split is simply it read back out. Nothing is entered: the rows are **per category**, because
  that is what explains the figure, while the amount to be repaid is **per account**, because that is
  how repayment happens. Additional charges belong to nobody in particular and are **prorated by each
  participant's share of the lines**, distributed so the parts always add back to the receipt exactly.
  **Both accounts are always named** — "owes you" would be meaningless when every account is yours, so
  the app says _"Bank BCA reimburses Cash"_, naming the account that owed and the one that paid.
- **Reimbursing a share** — records that an account paid its share back, and posts the money: an income
  on the account that covered the receipt, an expense on the account that owed. Both are
  **uncategorised** — the spending was already classified on the receipt, and repeating it would count
  the same money twice — and both are refused every edit, since their amount is authoritative rather
  than derived. Undoing a reimbursement removes the pair together. The amount is **snapshotted**:
  editing the receipt afterwards changes what is owed now without rewriting what was actually repaid,
  and the difference is shown rather than silently reconciled. Reimbursing across currencies is refused
  outright; nothing holds an FX rate.
- **Monthly summary** — income, expense, net. Reimbursement postings are **excluded**: both legs sit
  inside the same person's accounts, so counting them would book a repayment as fresh income and fresh
  spending for money that never entered or left. Balances do count them, which is the whole point of
  posting them.
- **Transaction list** — free-text search over description/notes, filter by account and type, paginated
  25 at a time.
- **Dashboard** — month summary, per-account balances, five most recent transactions.

### Confirmed direction, not yet modelled

These are agreed product facts with no schema or UI behind them yet. Design must leave room for them
rather than paint them out:

- **Merchant** — master data, the entry point for a purchase.
- **Product** — belongs to a merchant; carries its wallet binding and its **last known price**.
- **Wallet (budget envelope)** — a named allocation layer **above** real accounts. A product maps to an
  envelope; an envelope draws from an account. Confirmed as a new concept, distinct from `Account`.
- **Basket entry** — a purchase is a set of line items, grouped by wallet, posting **one transaction per
  wallet**.

### Built as part of authentication

- **User + authentication** — username and password, argon2-hashed, with a **JWT issued by Nest**. Not
  Supabase Auth, not a third-party identity provider, no OAuth, no passkeys. A 15-minute access token
  plus a rotating, revocable refresh token.
- **Per-user data ownership** — every `Account`, `Category` and `Transaction` is owned by a user, with
  isolation **enforced in the API** (there is no RLS; Prisma queries are the only boundary). Full tenant
  isolation, not a shared dataset behind a login gate. Future `Merchant`, `Product` and `Wallet` rows
  must follow the same rule.
- **Invitation** — registration is open at `/register` but refused without the shared `INVITE_CODE`. The
  first account to register adopts every row that predates authentication.

### Hard technical constraints

- **Every amount is an integer in minor units** (`amountMinor`, `openingBalanceMinor`, `totalMinor`)
  paired with an ISO 4217 currency. Never a float, never a `Decimal`. Convert only at the edges with
  `toMinor` / `fromMinor`; render with `formatMoney`.
- The API is the only thing that talks to the database. The web app has no Supabase client.
- `apps/web/src/api/` is generated from the OpenAPI schema and must never be hand-edited.
- **Supabase is managed Postgres only** — no Supabase Auth, no `supabase-js`, no RLS, and Prisma owns
  the `public` schema. Tenant isolation therefore has no database-level safety net; a query that forgets
  its user filter leaks data silently. `userId` is `NOT NULL` on every owned table, so a row can never
  again exist without an owner.

### Explicitly undecided

- **Whether budget envelopes replace `Category` or sit alongside it.** Both would classify spending, and
  the current `Category.kind` / `color` fields overlap with what an envelope needs. Not resolved — do not
  assume either answer, and do not quietly merge the two concepts in UI.
- **Whether any data is shared between invited users.** Isolation is confirmed for money — one person's
  transactions are never another's. But the **merchant and product catalogue is expensive master data**,
  and under strict isolation every invited person rebuilds it from zero, which directly undercuts the
  product's whole mechanism. Whether merchants/products are global, owner-owned and readable, or
  duplicated per user is **not decided**. Nor is whether a household can share an account or envelope.
- **Password recovery.** Unsolved and deliberately so: there is no email provider, so a forgotten
  password currently means editing the database by hand. The register screen warns about this.
- **Rotating or revoking an invite code.** `INVITE_CODE` is a single shared secret with no expiry and no
  per-person tracking. Changing it invalidates it for everyone at once.
- Transfers between accounts, recurring rules, and budget periods (weekly/monthly envelope refill) are
  not modelled and not yet specified.
- Multi-currency behaviour beyond "currency belongs to the account" is unspecified.

## Brand Commitments

- The name is **Erumah** — capital `E`, the rest lowercase. It appears in the app header and the auth
  screens, in the page metadata title, and in the Swagger title. It was formerly _myFinance_.
- The rename was deliberately kept to display strings. The `@myfinance/*` package scope and the
  `myfinance.accessToken` / `myfinance.refreshToken` localStorage keys are **not** renamed: the scope is
  an internal identifier with no user-visible surface, and rewriting the storage keys would make every
  live session unreadable and sign everyone out on deploy. Do not "finish the job" on either.
- No logo, wordmark, icon set, illustration, or brand asset file exists in the repository. The mark is a
  lucide `House` glyph on the brand green, isolated in `apps/web/src/components/shell/brand-mark.tsx`.
- No voice or personality has been established or made binding.

## Evidence on Hand

- **Seed data only** (`apps/api/prisma/seed.ts`): eight categories — Salary, Side Income, Groceries,
  Transport, Housing, Dining Out, Utilities, Health, each with a hex color — plus one `Cash` account in
  IDR. This is scaffolding, not real user data.
- No real transaction history, no merchant list, no product catalogue exists yet.
- **Nothing to fabricate.** Beyond the owner and whoever they personally invite there are no users, and
  there are no testimonials, customers, benchmarks, pricing, licensing, or deployment. Future work must
  not invent any of them, and must not write marketing or acquisition copy — this product has no public
  audience to persuade, only people who were let in.

## Product Principles

1. **The master data exists so that entry is tapping, not typing.** Any flow that makes the user supply
   information the merchant or product already knows is a defect in the product, not a UI preference.
2. **Routing is derived, never asked.** If a purchase requires the user to manually choose the paying
   wallet or the category, the master data failed. Show the derived answer and allow correction; do not
   open with a blank question.
3. **Two devices, two jobs.** Phone is for capture under real-world conditions; desktop is for review and
   master-data maintenance. Optimising one at the other's expense is the wrong trade.
4. **Money is exact and legible.** Integer minor units, positive amounts with sign derived from type,
   IDR's zero decimals and long numerals respected everywhere. Never approximate, never truncate a
   figure the user needs to read precisely.
5. **Private, not public — invited, not acquired.** There is no signup funnel and nobody to persuade.
   Density and speed suit the owner, who has seen every screen a hundred times; the cost is that an
   invited member arrives without that fluency, so the way in must be self-explanatory even though
   nothing after it needs to be.
6. **Isolation is a correctness property, not a feature.** One person's money is never visible to
   another, and the API is the only thing enforcing it. Any surface that shows totals, balances, or
   history must be unambiguous about whose they are.

## Accessibility & Inclusion

Derived from the confirmed phone-capture scene rather than a stated standard:

- Entry must work **one-handed** — real touch targets, reachable primary actions, no precision dragging.
- Must stay legible **outdoors in daylight**, which sets a floor on contrast for amounts, and rules out
  encoding income vs. expense in colour alone.
- Large IDR figures must not truncate or wrap awkwardly at small widths.

No formal WCAG level has been set as a requirement.
