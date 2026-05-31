# Phase 12 — 12a Inspection Report (External Integration Substrate)

**Branch:** `phase-12-external-portal-integrations` @ `c4eaba5` · **Date:** 2026-05-30 · **Mode:** read-only.

## Evidence-source note (read this first)

The live DB was **not** queried in this sweep: `MYSQL_PWD` does not persist across the harness's per-call shells and `read -s` needs a TTY this executor does not drive (tunnel port 3307 was confirmed OPEN; `mysql` client present). Findings below are therefore derived from the **authoritative repo sources** — the Drizzle schema under `src/server/schema/` and the migration journal `db/migrations/meta/_journal.json`. This is sound for 12a because: (a) every migration `0000–0027` was empirically verified against prod at its closeout, and (b) CF-8b.1 proved a from-scratch `0000→0027` replay reproduces the live schema with zero divergence. **Two items are flagged for a live confirm in 12b** (live value sets of the reference tables; live `SHOW TABLES LIKE 'external_%'`) — both are near-certain from source but should be eyeballed against prod before the 0028 migration. Captured outputs: `/tmp/12a_git.txt`, `/tmp/12a_cj_loc.txt`, `/tmp/12a_wrappers.txt`.

## Env state (Step 1 — `/tmp/12a_git.txt`)
- Branch: `phase-12-external-portal-integrations` ✓
- HEAD: `c4eaba5` (Phase 12 handoff) ✓
- Tree: clean after restoring the build-generated `next-env.d.ts` (`git checkout -- next-env.d.ts`; it is a Next.js-generated artifact, never a source change). ✓ No stop-trigger.

## S1 — `jobs.source_type` enum (THE load-bearing invariant) — **GREEN**
`src/server/schema/jobs.ts:67–78`, the live 8-value enum (default `manual`):
```
source_type ENUM(
  'manual', 'internal_client_portal', 'external_client_portal',
  'email_ingestion', 'forwarded_email', 'api',
  'preventative_maintenance', 'snow_event'
) NOT NULL DEFAULT 'manual'
```
**`external_client_portal` is a LIVE enum value** (present since Phase 4 migration `0000`; Phase 11 pinned its sibling `internal_client_portal`). The framework's load-bearing value exists — **no migration needed to add it.**

Supporting columns already on `jobs` (no migration needed):
- `source_external_id varchar(255)` (nullable, **no uniqueness** — jobs.ts:79; the schema comment at `:24–29` explicitly states "duplicate detection is **Phase 12's linking-table concern**").
- `index jobs_tenant_source_idx (tenant_id, source_type)` (jobs.ts:113) — external-WO queries are already indexed.

The jobs.ts header comment (`:26–27`) is a **forward-declaration of this very phase**: *"ServiceChannel … maps to external_client_portal, with the specific system recorded later via Phase 12's `external_systems` / `external_work_order_links` (D-4.9)."*

## S2 — existing integration scaffolding — **net-new confirmed**
- `src/lib/integrations/` — **does not exist** (`ls` → No such file or directory).
- `src/server/schema/index.ts` exports **33 schema modules**; **none** is named `external*` / `integration*` / `adapter*` / `sync*`. The complete module list: auth, tenants, roles, audit-logs, clients, client-details, trades, vendors, vendor-coverage, vendor-details, job-reference, jobs, job-history, job-details, dispatch-reference, dispatch-assignments, dispatch-comms, dispatch-presence, communications, portal-updates, agents-substrate, agents-rewriter, client-updates, agents-config, scope-templates, scope-generation, billing-config, proposals, change-orders, vendor-invoices, client-invoices, payments, billing-events.
- Migration set is `0000–0027` (journal idx 0–27); **no `external_*` / `sync_*` / `payload_log` table** in any migration.
- The grep hits for `external_`/`integration`/`adapter`/`sync` are all **incidental**: `source_external_id` columns (`jobs`, `vendor_invoices`), the `external`/`external_portal` *channel* enum values in `communications.ts`, the `integration` substring in unrelated prose, and `sync` in unrelated identifiers. No integration substrate exists.

→ **All `external_*` tables and `src/lib/integrations/` are net-new.** (12b should still run `SHOW TABLES LIKE 'external\_%'` live as a belt-and-suspenders zero-row confirm before `0028`.)

## S3 — `createJob` wrap target (inbound-mapper precedent) — **matches handoff**
`src/server/jobs.ts:236` — `export async function createJob(input: CreateJobInput): Promise<JobRow>`.

**`CreateJobInput`** (jobs.ts:208–222) — **accepts `sourceType?: JobSourceType` and `sourceExternalId?: string | null`** (both optional; default `sourceType='manual'`). Other fields: `tenantId`, `clientId`, `clientLocationId` (req), `primaryTradeId?`, `priorityId?`, `problemDescription` (req), `scopeOfWork?`, `notToExceedAmount?`, `createdByUserId` (req).

**Error set** (jobs.ts:239–256, verbatim throws): `CLIENT_NOT_FOUND`, `LOCATION_NOT_FOUND`, **`LOCATION_CLIENT_MISMATCH`** (`location.clientId !== input.clientId`), `PRIORITY_NOT_FOUND` (if priority given), `TRADE_NOT_FOUND` (if trade given), `STATUS_NOT_FOUND` (defensive).

**Behaviour:** parent-in-tenant guards (read-only) → ONE transaction: ensure+lock `tenant_job_sequences`, insert job @ allocated `job_number` + **hardcoded initial status NEW** (`INITIAL_STATUS_CODE="NEW"` via `getJobStatusByCode`), bump counter, write `job_status_history` (null→NEW), `job_events` (`job.created`), `audit_logs` row — **all audit in-txn** (D-4.x). Returns the full `JobRow`.

→ Live matches the handoff prose exactly. **An external inbound mapper wraps `createJob` with `sourceType='external_client_portal'` + `sourceExternalId=<external WO id>`**, mirroring how `createClientJob` pins `internal_client_portal`. No change to `createJob` needed.

**Wrapper precedents** (`/tmp/12a_wrappers.txt`): `src/server/client/create-client-job.ts` (`createClientJob` — the scope-pin + delegate shape), `src/server/billing/vendor-invoices.ts` (`recordVendorInvoice`), `src/server/vendor/submit-vendor-invoice.ts`. The Phase-11 `createClientJob` is the closest structural template for an external-WO ingest wrapper.

## S4 — mapping-target reference tables
All three exist; PK shape + tenant-scoping + the value set external codes map TO:

**`trades`** (`trades.ts`) — **GLOBAL** (no `tenant_id`, deliberate per the header comment: keeps `external_trade_mappings` a 2-D matrix `external_system × trade`, not 3-D). PK `id` varchar(36) uuidv7; `name` unique, **`code` varchar(32) unique** (uppercased — the stable join key the comment names for `external_trade_mappings`); `status` enum(active/inactive/archived). **15 seeded codes** (`db/seeds/trades.ts`): PLUMB, HVAC, ELEC, CARP, LOCK, ROOF, CLEAN, LAND, PEST, GLASS, PAINT, FLOOR, DOOR, APPL, HANDY.

**`job_statuses`** (`job-reference.ts:67`) — **GLOBAL** (no `tenant_id`, mirrors trades). PK `id`; `code` varchar(32) **globally unique**; `category` enum(open/in_progress/on_hold/completed/cancelled); `sort_order`; `is_terminal`. **9 seeded codes** (`db/seeds/job-reference.ts`): NEW, SCHEDULED, DISPATCHED, IN_PROGRESS, ON_HOLD, COMPLETED, CANCELLED, CLOSED, CLOSED_BILLED. The schema comment (`priorities.code` `:42–43`) names **`external_priority_mappings` (Phase 12)** as the join consumer.

**`priorities`** (`job-reference.ts:27`) — **TENANT-SCOPED** (the deliberate inversion: `tenant_id` NOT NULL, FK→tenants cascade; each tenant owns its set). PK `id`; **`code` varchar(32)** uppercased, **unique per `(tenant_id, code)`**; `name` unique per tenant; `rank` (lower = more urgent); `status` enum. **5 seeded codes** per tenant (`db/seeds/job-reference.ts`): EMERGENCY, URGENT, HIGH, ROUTINE, SCHEDULED.

→ **Mapping-table design consequence:** `external_trade_mappings` and `external_status_mappings` target GLOBAL ref data → keyed `(external_system_id, external_code) → trade_id / job_status_id`, no tenant dimension on the *target* side. `external_priority_mappings` targets TENANT-SCOPED `priorities` → must carry the tenant dimension (the external_system is per-tenant, so this resolves naturally, but the mapping row references a tenant-scoped `priority_id`). All three join on the uppercased `code` columns the schema comments already earmarked. **Live value sets to eyeball in 12b** (seed values are the source-of-truth, but a tenant may have added priorities).

## S5 — audit / logging patterns to mirror
**`audit_logs`** (`audit-logs.ts`) — confirms the Phase-10 note: `id`, `tenant_id` (FK set-null), `user_id` (FK set-null), `actor_label varchar(128)`, `action varchar(128)`, **`target_type varchar(64)` + `target_id varchar(36)` + `metadata json`**, `ip_address`, `user_agent`, `created_at`. Indexes on tenant/user/action/created_at. The generic `targetType/targetId/metadata` shape is the audit primitive every write uses.

**Closest structural analog for sync/payload logging — `communication_logs`** (`communications.ts:93`). This is the strongest template for `external_sync_runs` / `_events` / `_payload_logs`:
- **"Unifying log spine" (6a Option B):** one denormalized row per event over polymorphic detail, linked by `source_type` + `source_id` (no FK) — directly analogous to a sync_event referencing whatever external payload produced it.
- **Append-on-create with a MUTABLE delivery tail** (`delivery_status` enum draft→queued→sent→delivered→failed/bounced + `sent_at`/`delivered_at`/`read_at`) — the exact shape a `sync_run` needs (a run starts, progresses through states, terminalizes), distinct from `job_events`' strict immutability.
- **Polymorphic + JSON** precedents: `json` columns (`audit_logs.metadata`, `email_templates.applicable_channels`) for raw payloads — **⚠ carry the MariaDB-JSON-parse-at-read-boundary gotcha** (drizzle returns the raw string; parse at the read layer — see `reference-drizzle-sql-fragment-gotchas`).
- **FK-prefix convention** (`cl_*` for communication_logs) — Phase 12 tables should adopt their own prefixes (e.g. `es_`/`ewol_`/`esr_`).

Other analogs present: `*_status_history` tables (typed `from→to` transition rows — the immutable-history pattern), `job_events` (milestone log). For **sync orchestration** the `communication_logs` mutable-tail-on-a-run model fits best; for **per-status-transition** of a synced WO, the `*_status_history` immutable model fits.

## Latest migration / next free (Step 7)
- Journal `db/migrations/meta/_journal.json`: latest entry **idx 27**, tag `0027_cloudy_squirrel_girl` (client_users). ✓
- Latest `.sql`: `0027_cloudy_squirrel_girl.sql`. **Next free migration number = `0028`.**

## Stop-trigger summary
None fired. S1 GREEN (enum value live). S2 net-new (no integration substrate). S3 matches (createJob accepts sourceType/sourceExternalId; full error set + in-txn audit + hardcoded NEW confirmed). The only deviation from the spec's procedure: **DB queries deferred to 12b** for the two flagged live confirms (reference value sets; `SHOW TABLES LIKE 'external_%'`), derived instead from authoritative schema/seed source.

## Live-confirms C1–C4 — discharged 2026-05-30 (12a.1)
DB access established TTY-free via `mysql --defaults-extra-file="$HOME/.pm_db.cnf"` (non-secret skeleton + Jonny-appended password; file is 0600, at `$HOME`, outside the repo). **All four GREEN against live prod `jonnyrosero_pm` (28 migrations, 0000–0027):**
- **C1 — `SHOW TABLES LIKE 'external\_%'` → EMPTY.** Zero external_* tables; net-new confirmed live.
- **C2 — `source_type` enum live:** `enum('manual','internal_client_portal','external_client_portal','email_ingestion','forwarded_email','api','preventative_maintenance','snow_event')` NOT NULL DEFAULT 'manual'. `external_client_portal` present. GREEN.
- **C3 — ref tables match the 12a derivation exactly:** `trades` GLOBAL (no tenant_id col), **15** rows (APPL/CARP/CLEAN/DOOR/ELEC/FLOOR/GLASS/HANDY/HVAC/LAND/LOCK/PAINT/PEST/PLUMB/ROOF); `job_statuses` GLOBAL (no tenant_id), **9** rows (NEW/SCHEDULED/DISPATCHED/IN_PROGRESS/ON_HOLD/COMPLETED/CANCELLED/CLOSED/CLOSED_BILLED); `priorities` TENANT-SCOPED (tenant_id present), **5** rows across **1** tenant (EMERGENCY/HIGH/ROUTINE/SCHEDULED/URGENT). Matches "trades+statuses global, priorities tenant-scoped, 15/9/5 seeded".
- **C4 — logging analogs live:** `audit_logs` carries `target_type` varchar + `target_id` varchar + `metadata` json (the generic audit primitive); `communication_logs` present with the full mutable-tail log-spine shape (channel/direction/source_type/source_id/visibility/delivery_status + sent_at/delivered_at/read_at + status) — the chosen template for `external_sync_runs/_events/_payload_logs`.

**Migrate credential source (Step 4):** `drizzle.config.ts` loads `.env.local` via `dotenv` and reads `dbCredentials.url = process.env.DATABASE_URL` — so `db:migrate` is unattended-capable from `.env.local` (which holds `DATABASE_URL`), **independent** of this `.pm_db.cnf` (the cnf is only for the read-only `mysql` CLI in harness/inspection contexts). No secret values inspected.

**Incidental finding (no action):** a bare `mysql` connection via the cnf lands on the user's `jonnyrosero_march_madness` DB (a server/login-path default overrides the cnf's `database=` line); all PM queries therefore pass `jonnyrosero_pm` explicitly. The PM data is correct and untouched — `client_users` + `jobs` present, 28 migrations. The `_sandbox` twin (`jonnyrosero_pm_sandbox`) is also present, as expected.
