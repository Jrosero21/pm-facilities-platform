# Phase 10 — Vendor Portal MVP · Admin SOP

For the operator (Jonny) running migrations, seeds, and regression checks. Concrete commands; the **why** is in `02-decisions.md`.

## §1 — Sandbox-env-override pattern (inherited, Phase 9 §1)

The repo's `DATABASE_URL` (`.env.local`) points to **production**. Sandbox work derives the sandbox URL by swapping the db name:

```
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2- | sed -E 's#/jonnyrosero_pm(\?|$)#/jonnyrosero_pm_sandbox\1#')" <cmd>
```

Required only for **direct consumers** (`db:migrate`, `npm run dev`). The seed + harness **self-derive** the sandbox internally (guard refuses to run against a non-`_sandbox` URL), so they run with the plain `.env.local`.

## §2 — Running migrations (`0025`, `0026`)

Sandbox first, then prod (the standing cadence):

```
# generate (chained — see §8) after editing a drizzle schema file:
npm run db:generate
# sandbox apply:
DATABASE_URL="…_sandbox…" npm run db:migrate
# prod apply (plain .env.local):
npm run db:migrate
```

Phase 10 added `0025` (vendor_users) and `0026` (job_notes.origin). Prod `__drizzle_migrations` is at **27** entries (`0000`–`0026`) at close.

## §3 — Running the seed (Phase 9 + Phase 10 fixture)

```
npx tsx --env-file=.env.local --conditions=react-server scripts/seed-sandbox-phase9.ts
```

Self-targets the sandbox; idempotent (resets the `phase9-seed-tenant` and rebuilds). It now seeds the Phase-10 surface too: a vendor user (`vendor@phase9seed.test`), a `vendor_users` mapping to CoolAir, one SENT assignment, 4 notes, 2 photo placeholders, and 1 `vendor_portal` invoice. (The fixture file is still named `seed-sandbox-phase9*` — rename deferred, `FB-10p.1`.)

## §4 — Running the vendor-predicates harness (61 assertions)

```
npm run db:check:vendor-predicates
```

Covers: pure predicates, `getVendorScope` (structural + fixture-derived), the assignment-list reader, `acceptDispatch` transition smoke, the notes/attachments/invoice visibility filters, and the invoice write smoke. Expect **`passed: 61, failed: 0, OK`**.

## §5 — The harness is seed-dependent AND destructive

Fixture-derived assertions require the seed to have run. Several assertions **write** (acceptDispatch flips the SENT assignment; placeholder + invoice write smokes land rows). So it is **one-shot post-seed**: to re-run, **re-seed first** (`§3`), then run the harness. Running it twice without re-seeding fails the "exactly 1 SENT assignment" / fixture-count assertions (stale state, not a regression).

## §6 — Dynamic-import-after-env-swap rule (load-bearing)

Any **seed or harness** code that calls into `src/server/billing/*` (e.g. `recordVendorInvoice`) **must dynamic-import it after the `process.env.DATABASE_URL` swap** — not at the top of the file. Those modules statically `import { db }`, so a top-level import binds the db client to **prod** before the sandbox swap. The 10n seed does:

```
process.env.DATABASE_URL = SANDBOX_URL;
const { db } = await import("@/server/db");
const { recordVendorInvoice } = await import("@/server/billing/vendor-invoices"); // post-swap
```

## §7 — `mysql -e` vertical output: use `-E`, not `\G`

This MariaDB client rejects `\G` inside `-e "…\G"` ("Unknown command '\G'"). For vertical output use the `-E` flag: `mysql … -E -e "SHOW CREATE TABLE x;"`.

## §8 — `db:generate` is a chain

`npm run db:generate` = `drizzle-kit generate && node scripts/fix-mysql-engine.mjs && node scripts/check-migration-identifiers.mjs`. The post-processors add the `ENGINE=InnoDB` clause where drizzle omits it and verify all identifiers are ≤ 64 chars. Read the generated `db/migrations/NNNN_*.sql` before applying (the halt-gate-#1 discipline).

## §9 — Populated-table additive-default migration (the 10l pattern)

`0026` was the first Phase-10 migration to touch a **populated** prod table (`job_notes`, 3 rows). The `ADD COLUMN ... NOT NULL DEFAULT 'operator'` backfilled those rows at column-add. **Verify after prod apply:** `SELECT COUNT(*) total, SUM(origin='operator') ok, SUM(origin IS NULL) nul FROM job_notes;` must show `total = ok`, `nul = 0`. (DoR-10b.2.)

## §10 — Tool-output reliability (inherited, Phase 9 §10)

Long batched tool calls occasionally buffer/garble terminal output mid-run and flush later. If a command's output looks empty or stale, re-run the single command in isolation; do not assume failure. (Observed again during 10n-inspect; resolved on flush.)
