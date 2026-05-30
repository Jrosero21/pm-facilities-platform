# Phase 9 — Aggregator Dashboard & Analytics MVP · System Workflows

How Phase 9's pieces compose into operational flows. Each flow **cites** the rules (`06-business-rules.md`), decisions (`02-decisions.md`), and route behavior (`09-api-routes.md`) it's built from — it does not re-derive them. Phase 9 establishes **no new rules here**; anything rule-shaped lives in `06`.

## §1 — Dashboard composition flow (`GET /dashboard`)

1. **Auth/role resolution** — `requireTenant()` → `{ tenantId, roleKeys, isSuperAdmin }`. The `cookies()` read makes the route dynamic (no static cache — `02-decisions.md §E`).
2. **Role gates** — `showOps = canSeeOperations(ctx)` (`operator | tenant_admin | super_admin`); `showFin = canSeeFinancials(ctx)` (`accounting | tenant_admin | super_admin`, the read-vs-write asymmetry, `06 §10`). If **neither**, render the no-visible-section `EmptyState` and stop.
3. **Parallel fetch** — one `Promise.all`, each entry gated `cond ? reader(...) : null`: the eight operational readers under `showOps` (`countStalledJobs`, `operationalQueue(tid,20)`, `countOpenJobsByStatus`, `countOpenJobsByPriority`, `topClientsByOpenJobs(tid,5)`, `topTradesByOpenJobs(tid,5)`, `timeInStatusDistribution`, `timeToDispatchDistribution`) and `countPendingInvoices` under `showFin`. A non-financial user's payload never carries financial figures.
4. **Render** — the 9 panels in the §2 layout order (`9e-manifest.md §2`), each on `gate && data`. Counts operate on the open population (`06 §1`); zero-count status/priority cards still render (never null-for-empty); colors per `06 §8`.
5. **Link-throughs** — status card → `/jobs?status={statusId}`; priority card → `/jobs?priority={priorityId}`; queue row → `/jobs/{jobId}`.

Cross-ref: `02-decisions.md §E`; `06 §1/§7/§8/§10`; `09-api-routes.md`.

## §2 — Operational-queue classification flow

1. **Base query** (`operational-queue.ts`) — open population (`06 §1`); per-row computed fields: `currentStatusEnteredAt` (`MAX(history.created_at)` COALESCE `jobs.created_at`), `ageInCurrentStatusSeconds` (`TIMESTAMPDIFF` vs `NOW()`), `assignmentCount`, `checkInCount` (via `vendor_check_ins → job_vendor_assignments` on `assignment_id`), and the `SCHEDULED`-branch scheduled-start inputs.
2. **App-side classification** (`06 §7`, first-match precedence): `isStalled` (the shared predicate, `06 §4/§5`) → `isOverdue` (`dueAt` non-null AND `dueAt < now`) → `isUnassignedHighPriority` (`priorityRank ≤ 2` AND `assignmentCount === 0`) → else `aged`.
3. **Sort + slice** — tier index ascending → `ageInCurrentStatusSeconds` descending → `createdAt` ascending; slice to `limit` (20).

Why app-side rather than nested SQL `CASE`: the multi-signal precedence is more legible and testable in TS, and volume is small post-filter (`02-decisions.md §C`, documented deviation).

## §3 — Job-detail aging classification flow (`GET /jobs/[id]`)

1. The existing page's parallel batch adds `isJobStalled(tenantId, jobId)`.
2. `isJobStalled` (`stalled-jobs.ts`) runs the **same query shape as `countStalledJobs`** but `WHERE jobs.id = ? AND jobs.tenant_id = ?`; returns **null** for missing / cross-tenant / terminal-status jobs.
3. The header renders a red **"Stalled"** badge iff `aging?.isStalled === true`.

Because the badge shares the predicate + query with the queue (the paired aggregate+single-row reader pattern, `02-decisions.md §F`), the two surfaces classify **identically** — verified at 9f by 5-case cross-surface consistency. Cross-ref: `06 §4/§5`; `09-api-routes.md`.

## §4 — `/jobs` filter-resolution flow (`GET /jobs?status=&priority=`)

1. **searchParams** — async `Promise<{ status?, priority? }>` (`02-decisions.md §E`), awaited.
2. **`resolveJobsFilters(tenantId, params)`** — `status` looked up in `job_statuses` (global); `priority` in `priorities WHERE tenant_id = ?` (tenant-scoped). A resolving id is kept; a **non-resolving id is dropped** (graceful fallthrough — urls are hand-typed / bookmarked / shared, so degradation beats a hard 404).
3. **`listJobs(tenantId, { statusId?, priorityId? })`** — the inventory query with the optional `eq()` conditions appended over the preserved `is_archived=false` base, so the filtered list and a status card's count agree (`06 §1`).
4. **Active-filter indicator** — count + Clear-filters (the chip-vs-count decision, `9e-manifest.md §6`).

Cross-ref: `06 §1`; `02-decisions.md §E`; `09-api-routes.md`.

## §5 — Sandbox seed pipeline flow (admin operation)

A three-stage, re-runnable pipeline (`scripts/seed-sandbox-phase9.ts`); a **hard guard** at the top refuses any non-`_sandbox` `DATABASE_URL`.

1. **Stage 1 — schema replay:** `drizzle-kit migrate` against the sandbox; idempotent (applies only pending migrations; a re-run at `0024` is a no-op).
2. **Stage 2 — global reference seeds:** shell out to `db:seed:trades` + `db:seed:dispatch-reference` with the sandbox `DATABASE_URL` in the child env.
3. **Stage 3 — operational seed (in-process):**
   - **3a Idempotency reset** — explicit per-table tenant-scoped deletes in child→parent order inside `SET FOREIGN_KEY_CHECKS=0` (sandbox-only), then `DELETE FROM tenants …`. **Why ordered deletes, not a single tenant-cascade:** inter-child RESTRICT FKs (`jobs.client_location_id → client_locations`) block a single `DELETE FROM tenants` — a `tenant_id`-FK cascade survey is necessary but not sufficient (caught at 9d.5; `02-decisions.md §D`). Deleting `audit_logs` explicitly avoids SET-NULL orphans.
   - **3b** create the seed tenant; **3c** shell out to the tenant-scoped `job-reference` seeder (priorities + sequence); **3d** user-upsert-by-email + `tenant_users` + `user_roles`; **3e** insert the ~35-job coverage matrix (`9d-manifest.md §5`).
   - **TZ-safety:** every backdated timestamp uses `` sql`NOW() - INTERVAL n SECOND` `` via the `agoSql` helper — server-anchored to avoid the mysql2 client-tz vs DB-tz skew (`02-decisions.md §D`).

Cross-ref: `02-decisions.md §D`; `04-admin-sop.md` (the runnable SOP form); `9d-manifest.md §2/§4/§5`.

## §6 — Reader-exercise harness flow (verification artifact)

`scripts/check-analytics-readers.ts` (`pnpm db:check:analytics-readers`); sandbox guard mirrors the seed.

1. Imports the fixture (`seed-sandbox-phase9-fixture.ts`) and computes **expected** values via trivial JS filters — independent of the readers' SQL (the fixture-derived oracle, `02-decisions.md §D`).
2. Calls each reader with the seed tenant id and asserts actual vs expected: counts **exact**; distribution percentiles **±2s**; queue **tier sequence + per-job classification** vs the fixture's ground-truth labels.
3. **23 assertions across the readers.** `isJobStalled` (the 10th reader, added at 9f) is **not yet covered** — banked as a harness gap (`10-known-limitations.md`; `closeout-carryforwards.md`).

**Co-versioning contract:** seed + fixture + harness move in one commit; expectations derive from the fixture, never hardcoded magic numbers. Cross-ref: `02-decisions.md §D`; `9d-manifest.md §7`.
