# Phase 9 — Aggregator Dashboard & Analytics MVP · Admin SOP

For tenant admins, super admins, and developers. Operational procedures with runnable command forms. Sources: `9b-schema-manifest.md §6`, `9d-manifest.md §2/§4/§5/§7`, `9e-manifest.md §11`, `05-system-workflows.md §5/§6`.

All commands assume the SSH tunnel is up (`ssh -p 21098 -L 3307:127.0.0.1:3306 jonnyrosero@host62.registrar-servers.com`) and the working dir is the repo root.

## §1 — Sandbox-targeting `DATABASE_URL` override (the foundational pattern)

The dev DB defaults to **production** (`.env.local` → `jonnyrosero_pm`). To target the **sandbox** (`jonnyrosero_pm_sandbox`), derive the URL by swapping the DB name (the password is never echoed). Inline env wins over `.env.local` (Next + Node `--env-file` do not override an already-set var):

```bash
export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2- | sed -E 's#/jonnyrosero_pm(\?|$)#/jonnyrosero_pm_sandbox\1#')"
echo "DATABASE_URL target: ${DATABASE_URL##*@}"   # verify it ends in /jonnyrosero_pm_sandbox before proceeding
```

**This override is REQUIRED only for commands that read `DATABASE_URL` directly with no internal swap:**
- `npm run db:migrate` (standalone sandbox migration replay)
- `npm run dev` (dev server against sandbox data, §4)

**The retained scripts self-target the sandbox** (they derive the sandbox URL internally + refuse a non-`_sandbox` target), so **run them with the plain command — no override needed**: the seed (§2) and the harness (§3). The override is harmless if also set, but unnecessary.

## §2 — Running the sandbox seed

**When:** setting up the sandbox for development; resetting after iteration. **No npm alias** (run via `tsx`); the script self-targets the sandbox.

```bash
npx tsx --env-file=.env.local --conditions=react-server scripts/seed-sandbox-phase9.ts
```

Three stages run automatically (`05 §5`): schema replay → global reference seeds → operational seed. **Idempotent** — a re-run resets the seed tenant's data (slug `phase9-seed-tenant`) without disturbing other sandbox tenants/data. Expected outcome (`9d-manifest §5`): **35 jobs** (19 open across the 5 non-terminal statuses + 16 closed), 4 clients / 7 locations / 3 vendors, 23 invoices (12 AP + 11 AR), 3 seed users (`admin@`/`operator@`/`accounting@phase9seed.test`, password `Phase9-Seed-Pw!`).

## §3 — Running the analytics-readers harness

**When:** after touching any `src/server/analytics/` code; after re-seeding; as a periodic regression check. Self-targets the sandbox.

```bash
pnpm db:check:analytics-readers      # = tsx --env-file=.env.local --conditions=react-server scripts/check-analytics-readers.ts
```

Expected: **23/23 PASS** against the seeded sandbox. **Co-versioning contract:** if you change the seed, update the fixture's oracle helpers (`seed-sandbox-phase9-fixture.ts`) in the **same change** — the harness's expected values derive from the fixture, never magic numbers.

## §4 — Development against the sandbox

**When:** building/testing UI that consumes the analytics readers. Run `npm run dev` with the §1 override exported, then visit `http://localhost:3000`:

```bash
export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2- | sed -E 's#/jonnyrosero_pm(\?|$)#/jonnyrosero_pm_sandbox\1#')"
npm run dev
```

Log in as a seeded user (e.g. `admin@phase9seed.test` / `Phase9-Seed-Pw!`; `admin` is `tenant_admin` → all panels). The dev server reads `DATABASE_URL` **at startup** — do **not** switch databases mid-session; kill and restart.

## §5 — Manual sandbox reset (DROP + replay escape hatch)

**When:** a full nuke — the seed's tenant-scoped reset isn't enough, or the sandbox got contaminated. **Not** the default path (the seed's built-in idempotency handles routine resets).

1. Drop all tables in `jonnyrosero_pm_sandbox` (table-by-table inside `SET FOREIGN_KEY_CHECKS=0`; the 9b post-housekeeping pattern).
2. Re-run the seed (§2) — its Stage 1 replays the schema from scratch.

## §6 — Cascade-completeness pre-check (before relying on `DELETE FROM tenants` in future work)

Any future code that leans on a single `DELETE FROM tenants WHERE id=…` to collapse the operational graph **must verify the FK chain empirically first**. **The 9d.5 lesson:** a `tenant_id`-FK survey is *necessary but not sufficient* — inter-child RESTRICT FKs (e.g. `jobs.client_location_id → client_locations`, NO ACTION) block the single DELETE (`ER_ROW_IS_REFERENCED_2`).

```sql
SELECT TABLE_NAME, DELETE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = '<db>' AND REFERENCED_TABLE_NAME = 'tenants';
-- and survey inter-child FKs among the tenant-scoped tables (REFERENCED_TABLE_NAME <> 'tenants')
```

If any blocking rule isn't CASCADE: use **explicit ordered deletes** inside `FOREIGN_KEY_CHECKS=0` (`05 §5`; `9d-manifest §4`).

## §7 — Matcher-facet pre-extraction (when seeding Phase 5+ tables)

Before writing INSERT logic against Phase 5+ tables — especially `job_vendor_assignments` — **pre-extract the full required-column set**. **The 9d.4 lesson:** `job_vendor_assignments` has mandatory matcher-facet columns (`matchedTradeId`, `matchedTradeWasPrimary`, `tightestGeoAtDispatch`, `matchedGeoTypesAtDispatch`, `complianceStatusAtDispatch`) that aren't obvious from a partial schema mental model.

```sql
SHOW COLUMNS FROM <table>;   -- confirm every NOT NULL column is accounted for before writing the INSERT
```

Applies to any future seed, fixture, or factory work.

## §8 — Dynamic-import sandbox-guard pattern (future late-bound-DB scripts)

Any script that swaps `DATABASE_URL` at runtime (before the DB connection binds) must **dynamic-import** the DB-binding modules:

1. derive the sandbox URL; 2. `process.env.DATABASE_URL = <sandbox>`; 3. **assert** it ends in `_sandbox` (hard guard); 4. **then** `await import("@/server/db")` / `await import("@/server/auth")`.

Schema-table imports (no DB binding) stay static at top-of-file for typing. This is the canonical pattern for the Phase 14 PM seed, Phase 15 snow seed, and future chatbot data scripts.

## §9 — Threshold-boundary coverage discipline (future seed strengthening)

Deliberately place test data **at threshold boundaries**, not just well-into / well-out-of range. **The 9d.6 lesson:** the TZ-skew bug surfaced *only* because §5 coverage put 6h-old NEW jobs against a 4h threshold (a 2h margin that flipped under the ~3h skew); a "NEW: 1h fresh, 24h stalled" spec would have hidden it indefinitely. Applies to every future seed (Phase 14 PM, Phase 15 snow, Phase 16 chatbot training data).

## §10 — Tool-output reliability discipline

Three intermittent tool-output anomalies recurred during Phase 9 construction: (1) format-string interpolation on raw `%` in inline SQL; (2) empty-stdout race on fast-exiting commands; (3) cross-file output bleed in the tool-output channel. Discipline that proved reliable:
- **File-capture** (`> file.out`, then read the file) for load-bearing assertions — never trust inline stdout for a load-bearing claim.
- **Grep against committed text** for doc verification.
- **Re-probe with corrected inputs** when a feature-test returns an ambiguous failure (e.g. the `PERCENTILE_CONT` varchar type-rejection that first read as "unsupported").
