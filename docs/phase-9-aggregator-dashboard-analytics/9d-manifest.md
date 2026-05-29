# Phase 9 — 9d Manifest (sandbox seed + reader-exercise harness)

**Phase:** 9 — Aggregator Dashboard & Analytics MVP
**Sub-batch:** 9d — sandbox seed + retained analytics-reader exercise harness
**Branch:** `phase-9-aggregator-dashboard-analytics` · **HEAD:** `2ae0576` (9c.7)
**Date:** 2026-05-29
**Predecessors:** `01-design-proposal.md §10` (seed strategy approved), `9d-inspection-report.md` (9d.1, approved), `9c-manifest.md` (reader contracts)
**Status:** manifest draft — gates 9d.3. Foundational decisions (a)/(b)/(c) pre-resolved per review; one new fork in §7 (oracle style). Each section ends with a Decision or FORK.

> **Pre-draft inspection (this gate):** seed script names confirmed (`db:seed:trades`, `db:seed:dispatch-reference`, `db:seed:job-reference`, etc.). **`job-reference.ts` targets the tenant in `SEED_TENANT_SLUG` (default `"demo"`) and ABORTS if absent** — it bundles tenant-scoped priorities + global `job_statuses` + `tenant_job_sequences` behind that tenant gate. Tenant creation = direct `db.insert(tenants).values({name, slug, type:"aggregator", status:"active"})` (slug-keyed idempotent). Users = better-auth `auth.api.signUpEmail({body:{email,password,name}})` then `tenant_users` + `user_roles` inserts. **These facts force the pipeline ordering in §2 (job-reference must run AFTER the seed tenant exists).**

---

## Section 1 — Scope statement

9d is the **proving ground**: a retained sandbox seed that builds a deliberately rich, deliberately varied tenant, plus a retained harness that exercises the 9c analytics readers against that seed and asserts deterministic expected aggregations. The seed becomes the project's canonical "what a populated tenant looks like" reference; the harness becomes its first standing regression artifact (partial answer to CF-8c.8.3).

**Two deliverables:** (1) `scripts/seed-sandbox-phase9.ts` — orchestrates the three-stage pipeline (replay → reference-seeds → operational-seed); (2) `scripts/check-analytics-readers.ts` — the retained harness with fixture-derived expected values.

**Non-scope (explicit):** no `/dashboard` UI (9e), no job-detail aging badge (9f), no closeout docs (9g), **no production-touching anything** (sandbox-only; hard guard at the top of every 9d script that refuses to run unless the resolved DB name ends in `_sandbox`).

**Roadmap:** §8 Phase 9 (the metric list the seed must exercise end-to-end), §2.7 (analytics designed from day one — the seed makes the data-blocked metrics light up), §5.5 (preserve auditability via history tables — the seed writes backdated `job_status_history` rows as the dwell substrate).

**Decision:** scope as stated. No fork.

---

## Section 2 — Pipeline architecture (CONFIRMED (a): orchestrate all three)

`seed-sandbox-phase9.ts` is the single entry point. It runs in-process for operational work and **shells out (`child_process`) to the existing reference seeds** — they're top-level executable scripts that call `process.exit`, so they can't be imported safely; shelling out with a sandbox `DATABASE_URL` in the child env is the robust reuse path (and matches the 9b.5.0 sandbox-targeting pattern). Hard sandbox guard runs first in every script.

**Pipeline (the ordering is dependency-driven, per the job-reference tenant gate):**
1. **Stage 1 — Schema replay.** Shell out: `drizzle-kit migrate` with sandbox `DATABASE_URL`. Idempotent (applies only pending migrations via `__drizzle_migrations`); a no-op when already at 0024. **Never drops** on the default path.
2. **Stage 2 — Global reference seeds.** Shell out: `db:seed:trades`, `db:seed:dispatch-reference` (both tenant-independent; idempotent skip-existing). These populate `trades` + `dispatch_assignment_statuses` once.
3. **Stage 3 — Operational seed (in-process), in order:**
   - **3.1 Reset** (idempotency, §4): `DELETE FROM tenants WHERE slug='phase9-seed-tenant'` (cascade) — or the explicit reverse-FK fallback if Gate 1 (§6) finds a non-CASCADE FK.
   - **3.2 Create seed tenant** (`db.insert(tenants)`, slug `phase9-seed-tenant`).
   - **3.3 Tenant reference seed:** shell out to `db/seeds/job-reference.ts` with `env: { …, DATABASE_URL: <sandbox>, SEED_TENANT_SLUG: 'phase9-seed-tenant' }`. The tenant now exists, so this seeds the tenant's 5 priorities + the global `job_statuses` (9 rows, idempotent by code) + `tenant_job_sequences` (next_number=1). **This is the resolved priorities decision — reuse the canonical seeder, zero duplication of the priority/status definitions.**
   - **3.4 Users:** upsert-by-email (§4) for `tenant_admin` / `operator` / `accounting` seed users (signUpEmail if absent) + `tenant_users` membership + `user_roles` (tenant-scoped role keys). These exercise the 9e role-gated dashboard.
   - **3.5 Topology:** clients, client_locations, vendors (+ minimal vendor coverage rows needed for assignments).
   - **3.6 Operational data:** jobs + backdated `job_status_history`, assignments, check-ins, invoices — **direct drizzle inserts** with explicit `createdAt` (Gate 2, §6), self-managing `job_number` (assign 1..N, then set `tenant_job_sequences.next_number = N+1`).

**Decision:** orchestrate-all-three; Stage 2 global-ref via shell-out; **`job-reference` shelled out inside Stage 3 after tenant-create** (priorities/statuses/sequence reused, not duplicated); Stage 3 operational data via direct inserts. No fork.

---

## Section 3 — Seed tenant identity

Single tenant, known identity (the cascade-delete target + the harness's deterministic target):
- **Name:** `Phase 9 Seed Tenant` · **Slug:** `phase9-seed-tenant` · **Type:** `aggregator` · **Status:** `active`.

All operational records scope under it. Any other sandbox tenants are untouched by the reset (slug-filtered delete).

**Decision:** locked single-tenant identity.

---

## Section 4 — Idempotency contract (CONFIRMED (b): tenant-cascade-delete + user-upsert)

- **Explicit ordered-delete reset (REVISED at 9d.5 — the single tenant-cascade does NOT work):** the original contract (`DELETE FROM tenants` cascading all tenant-scoped tables in one statement) was **empirically falsified** by 9d.5's populated-reset test. Gate 1 (§6) confirmed all 66 `tenant_id → tenants` FKs are CASCADE — but it checked **only `tenant_id` FKs**. There are **inter-child RESTRICT FKs** — notably `jobs.client_location_id → client_locations` (`NO ACTION`) — and when a single tenant DELETE cascades to both `jobs` and `client_locations`, InnoDB cannot order the two child-deletes to satisfy that RESTRICT, raising **`ER_ROW_IS_REFERENCED_2` (errno 1451)**. The empty-sandbox first run (9d.4) never exercised the reset, so this only surfaced under a populated re-run — which is exactly what 9d.5 exists to catch. **Working contract:** the reset performs **explicit per-table, tenant-scoped `DELETE`s in child→parent order, wrapped in `SET FOREIGN_KEY_CHECKS = 0 … = 1`** (sandbox-only; makes the deletes order-independent and robust against any further inter-child RESTRICT FK). The table list (15): `vendor_check_ins, job_vendor_assignments, job_status_history, vendor_invoices, client_invoices, jobs, client_locations, clients, vendor_locations, vendors, priorities, tenant_job_sequences, tenant_users, user_roles, audit_logs`, then `tenants`. Deleting `audit_logs` explicitly (rather than relying on its SET-NULL) means no SET-NULL orphans are produced — and with `FOREIGN_KEY_CHECKS=0` the tenant DELETE skips referential actions entirely. Wrapped in one transaction. This **is** the "reverse-FK delete list" the original contract claimed was unnecessary — it is necessary.
- **Gate-1 lesson banked:** a `tenant_id`-FK-only cascade survey is **necessary but not sufficient** to prove a single-tenant-DELETE reset is safe — inter-child RESTRICT FKs must also be surveyed (or sidestepped via explicit ordered deletes, as done here). Folded into 9d.7 closeout-forwards.
- **better-auth NULL-tenant audit rows (9d.5 finding — idempotent, no action needed):** `signUpEmail` fires better-auth audit hooks (`auth.user.created`, `auth.login`) that write `audit_logs` with **`tenant_id = NULL`** (no tenant context exists at signup; the `tenant_users` link is created afterward). The first seed run thus leaves **6 NULL-tenant audit rows** (3 users × 2 events). These are **NOT** counted under the seed tenant (so `audit_logs WHERE tenant_id = <seed>` = 0) and the tenant-scoped reset correctly leaves them alone. Crucially they are **frozen, not per-run accumulating**: re-runs reuse the global users (no new `user.created`/`login`), so the NULL count stays at 6 across re-runs. The idempotency invariant verified is therefore **"NULL-tenant audit count does not grow on re-run"** (6 → 6 → 6), not "= 0". No cleanup added — they're inert (no 9c reader touches `audit_logs`) and Phase-1's nullable `audit_logs.tenant_id` is the deliberate forensic-trail design.
- **User upsert-by-email:** better-auth `users` are **global** (not cascaded). The seed finds-by-email; creates via `signUpEmail` only if absent; never deletes users. `tenant_users` + `user_roles` for the seed tenant are deleted on reset and rebuilt each run. Re-runs preserve user/password/session records but rebuild membership — correct for sandbox iteration.
- **Manual escape hatch:** the DROP-all-tables operation (9b post-housekeeping form) remains available as a deliberate "nuke the sandbox" reset; **not** the default path. Documented in closeout `04-admin-sop.md`.

**Decision:** locked. Original cascade-reset contract **revised at 9d.5** to explicit ordered deletes after the populated-reset test falsified it (see first bullet); idempotency re-verified green (11/11 assertions, two seed re-runs).

---

## Section 5 — Coverage matrix (the seed fixture — fully enumerated)

The fixture is **declarative and fully enumerated** so the harness can derive exact expected values (§7). All ages are relative to seed-run `NOW()`; backdated via explicit `created_at` on jobs + their `job_status_history` rows. Thresholds from `stalled-rules.ts`: NEW 4h, SCHEDULED 2h-past-start, DISPATCHED 24h, IN_PROGRESS 72h, ON_HOLD 7d.

### 5A/5C/5D/5F — OPEN jobs (current-state population) — 19 jobs

| key | status | age in status | priority (rank) | assignments | check-in? | due_at | stalled? | queue tier |
|---|---|---|---|---|---|---|---|---|
| n1 | NEW | 1h | EMERGENCY (1) | 0 | — | none | no | **unassigned-high-priority** |
| n2 | NEW | 1h | ROUTINE (4) | 0 | — | none | no | aged |
| n3 | NEW | 1h | *none* | 0 | — | +3d (future) | no | aged |
| n4 | NEW | 6h | URGENT (2) | 0 | — | none | **yes** | stalled |
| n5 | NEW | 6h | ROUTINE (4) | 0 | — | none | **yes** | stalled |
| s1 | SCHEDULED | sched +2d future | HIGH (3) | 1 | — | +2d | no | aged |
| s2 | SCHEDULED | sched 3h past | HIGH (3) | 1 | **yes** | none | no | aged |
| s3 | SCHEDULED | sched 3h past | URGENT (2) | 1 | no | none | **yes** | stalled |
| s4 | SCHEDULED | sched 3h past | ROUTINE (4) | 1 | no | none | **yes** | stalled |
| d1 | DISPATCHED | 6h | ROUTINE (4) | **2** | — | **−2d (past)** | no | **overdue** |
| d2 | DISPATCHED | 6h | ROUTINE (4) | 1 | — | none | no | aged |
| d3 | DISPATCHED | 36h | HIGH (3) | 1 | — | none | **yes** | stalled |
| d4 | DISPATCHED | 36h | ROUTINE (4) | 1 | — | none | **yes** | stalled |
| i1 | IN_PROGRESS | 12h | HIGH (3) | 1 | yes | +1d | no | aged |
| i2 | IN_PROGRESS | 12h | ROUTINE (4) | 1 | — | none | no | aged |
| i3 | IN_PROGRESS | 96h | URGENT (2) | 1 | — | none | **yes** | stalled |
| i4 | IN_PROGRESS | 96h | ROUTINE (4) | 1 | — | none | **yes** | stalled |
| h1 | ON_HOLD | 1d | ROUTINE (4) | 1 | — | none | no | aged |
| h2 | ON_HOLD | 10d | HIGH (3) | 1 | — | none | **yes** | stalled |

Derived (the harness asserts these, computed from the fixture):
- **countOpenJobsByStatus:** NEW 5, SCHEDULED 4, DISPATCHED 4, IN_PROGRESS 4, ON_HOLD 2; plus **COMPLETED/CANCELLED/CLOSED/CLOSED_BILLED are terminal → not in the open set** (but the reader returns the 5 non-terminal status rows; all 5 here are non-zero).
- **countStalledJobs:** total **9** — byStatus {DISPATCHED 2, IN_PROGRESS 2, NEW 2, ON_HOLD 1, SCHEDULED 2} (alpha-sorted).
- **operationalQueue (limit 20):** 19 entries. Tier counts: stalled 9, overdue 1 (d1), unassigned-high-priority 1 (n1), aged 8. Order: 9 stalled (by dwell desc — h2 10d first, then i3/i4 96h, d3/d4 36h, n4/n5 6h, s3/s4) → d1 (overdue) → n1 (unassigned-HP) → 8 aged (by dwell desc).
- **countOpenJobsByPriority:** EMERGENCY 1 (n1), URGENT 3 (n4,s3,i3), HIGH 5 (s1,s2,d3,i1,h2), ROUTINE 9, SCHEDULED-priority 0; n3 (no priority) is in no bucket (the reader excludes null-priority).

### 5B — CLOSED jobs (historical-distribution substrate) — 16 jobs
12 COMPLETED + 4 CANCELLED, each with a **multi-row backdated `job_status_history`** chain producing known completed dwell intervals (e.g. a "fast" job: NEW 1h → SCHEDULED 2h → DISPATCHED 3h → IN_PROGRESS 5h → COMPLETED; a "slow" job with an ON_HOLD detour). These feed `timeInStatusDistribution` (completed intervals per status) and (those with assignments) `timeToDispatchDistribution`. Exact per-job transition timestamps are enumerated in the seed fixture; the harness derives expected per-status p50/p90/mean from the same intervals.

### 5E — Billing state (attached to closed jobs) — exact
- **vendor_invoices:** 5×(`approved`,`unpaid`) + 3×(`approved`,`partially_paid`) → **vendorPending = 8**; plus 2×(`approved`,`paid`), 2×(`received`/`under_review`) → excluded.
- **client_invoices:** 5×(`sent`,`unpaid`) → **clientPending = 5**; plus 2×`draft`, 2×`void`, 2×(`sent`,`paid`) → excluded.
- **countPendingInvoices expected:** `{ vendorPending: 8, clientPending: 5, total: 13 }`.

### 5G — Topology
- **Clients:** 4 — "Acme" (3 locations), "Globex" (2), "Initech" (1), "Umbrella" (1). Open jobs distributed so `topClientsByOpenJobs` is non-degenerate (Acme highest, then Globex, …).
- **Trades:** open jobs spread across ~6 trades (HVAC, PLUMB, ELEC, CARP, ROOF, CLEAN) so `topTradesByOpenJobs` returns a meaningful ranking; n3 has *no* primary trade (excluded from the trade ranking).

**Decision:** pin the fixture above. (Counts are illustrative-but-locked; the seed implements them verbatim and the harness derives from them — see §7. Refine specific numbers on review.) No fork on the structure; **awaiting any count edits**.

---

## Section 6 — Verify-before-relying gates (run first in 9d.3)

Ephemeral `scripts/verify-9d-gates.ts` (deleted at 9d.7). Both gates run **before** any seed body is written, so the implementation matches confirmed behavior.

- **Gate 1 — Cascade-completeness (runs TWICE — dual-read cross-validation).** Assert `DELETE_RULE='CASCADE'` on every `tenant_id`→`tenants` FK across the seed's table footprint. The footprint is **discovered, not enumerated**: `SELECT TABLE_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND COLUMN_NAME='tenant_id' AND TABLE_NAME!='__drizzle_migrations'` is the source of truth; then `information_schema.REFERENTIAL_CONSTRAINTS` (`REFERENCED_TABLE_NAME='tenants'`) gives each FK's `DELETE_RULE`.
  - **First read — production**, read-only, at 9d.3 gate time (before seed-body construction). This is the orchestrator's pre-construction design check (production is already at 0024; schema is identical to the target sandbox).
  - **Second read — sandbox**, also read-only, after the seed's first Stage 1 replay completes (end of 9d.4's first verification run — or, in 9d.3, immediately after Gate 2's Option-A replay leaves the sandbox at 0024). This is the empirical confirmation that what's true in production holds in sandbox.
  - **Both** must show `DELETE_RULE='CASCADE'` on every `tenant_id` FK. **Stop-trigger:** if *either* read shows `RESTRICT`/`NO ACTION`/`SET NULL` (or a `tenant_id` table with no FK row at all), 9d.4 adds an explicit reverse-FK delete list for the failing tables (cascade-plus-explicit hybrid). A production-vs-sandbox divergence is itself a stop-trigger (sandbox drifted — investigate before locking the cascade pattern).
  - The seed script's header comment notes the **read-only production access during the gate phase**, for auditability.
  - **Gate 1 RESULT (9d.3, production + sandbox identical):** **66 CASCADE + 1 SET NULL** across **67** tenant-scoped tables; zero tables with a `tenant_id` column but no FK row; prod↔sandbox cross-validation showed no table-set or DELETE_RULE divergence. The single `SET NULL` is **`audit_logs.tenant_id`** (Phase-1 forensic-trail design).
  - **⚠️ Gate-1 limitation (discovered 9d.5):** this gate surveys **`tenant_id`→`tenants` FKs only**. It is **necessary but NOT sufficient** to prove a single `DELETE FROM tenants` reset is safe — **inter-child RESTRICT/NO-ACTION FKs** (e.g. `jobs.client_location_id → client_locations`) are outside its scope and block InnoDB from ordering the cascade's children, raising `ER_ROW_IS_REFERENCED_2`. The originally-planned "single tenant DELETE collapses all 66 CASCADE tables in one statement" was **falsified** by 9d.5's populated-reset test; the as-built reset is the **explicit ordered-delete + `FOREIGN_KEY_CHECKS=0`** pattern (§4). Future tenant-reset designs must survey the inter-child FK graph too, or sidestep it with explicit ordered deletes.
- **Gate 2 — `createdAt`-override.** Against the sandbox (post-replay): insert a throwaway tenant-scoped row with an explicit `createdAt` 2 days past via a **direct drizzle insert**; select it back; assert stored `created_at` == the explicit value (not `NOW()`). **Stop-trigger:** if overridden, the backdating seed uses raw SQL `INSERT` instead of drizzle typed inserts. (Expected to pass — standard SQL DEFAULT semantics; this is the empirical confirmation of the 9d.1 correction.)

**Decision:** both gates run first; seed implementation branches on their results. No fork.

---

## Section 7 — Harness specification (CONFIRMED (c): retained)

- **Name:** `scripts/check-analytics-readers.ts` (the `check-` prefix signals permanence — distinct from the ephemeral `verify-*` convention; a future `verify-*` prune won't touch it).
- **Targeting:** sandbox `DATABASE_URL` override + `--conditions=react-server` (the readers `import "server-only"`).
- **Co-versioning contract:** the seed + harness are one unit; harness expected values derive from the seed's fixture; **editing the seed → updating the harness in the same change.** Stated here so future edits respect it.

**FORK — expected-value derivation:**
- **(i) Fixture-derived oracle (RECOMMENDED).** The seed exports its fixture spec (the §5 tables as typed data); the harness imports it and computes expected aggregates by **trivial independent filters/math** (e.g. "count fixture open jobs where status=NEW" — *not* the reader's SQL). This keeps expected values exact, co-versioned, and robust to fixture edits, while remaining a fair oracle (the derivation is plain filtering, not a re-implementation of the reader's drizzle/SQL). Percentile expectations reuse the 9c `percentile()`/`summarizeSeconds()` helpers over the known intervals — that tests the reader's **SQL interval-extraction + grouping** (the thing under test), not the arithmetic (already trivial).
- **(ii) Hardcoded expected values.** The harness asserts literal numbers (vendorPending=8, stalled total=9, …). Explicit and readable, but brittle: every fixture edit requires hand-recomputing every magic number, and risks drift between the §5 matrix and the assertions.

**Recommendation: (i)**, with the §5 headline numbers (open 19, stalled 9, pending {8,5,13}, queue tiers 9/1/1/8) retained in the manifest + a harness banner as **review anchors** (a sanity check that the fixture wasn't accidentally changed). Percentile asserts use a small tolerance (±2s) for the `NOW()`-relative dwell variance.

**Assertion set (all readers):** `countOpenJobsByStatus`, `countOpenJobsByPriority`, `topClientsByOpenJobs`, `topTradesByOpenJobs`, `countPendingInvoices`, `countStalledJobs`, `timeInStatusDistribution`, `timeToDispatchDistribution`, `operationalQueue` (assert tier sequence + first-N jobIds). Clear expected-vs-actual on any mismatch; non-zero exit on failure.

**Decision:** retained, `check-`-named, co-versioned. **FORK resolved → (i) fixture-derived oracle (built 9d.6).**

**AS-BUILT (9d.6):** harness implements FORK (i). The fixture's pre-existing oracle helpers covered 5 readers; **4 helpers were added** to `seed-sandbox-phase9-fixture.ts` for the rest — `expectedTopClients`, `expectedTopTrades`, `expectedTimeInStatus`, `expectedDispatch` (the percentile-applying ones reuse the pure `summarizeSeconds` over independently fixture-derived input arrays — a fair test of SQL extraction/attribution, not a tautology). **23 assertions** across all 9 readers (counts exact; percentiles ±2s; `operationalQueue` checked four ways incl. per-job `urgencyTier`+`isStalled` vs fixture ground truth via the `OPEN_JOBS[n−1]↔jobNumber n` map). Invocable via `pnpm db:check:analytics-readers`. First run **19/23** → caught two seed bugs (TZ-skew + dispatch-degeneracy observation), **zero reader changes**; after the seed `agoSql` fix → **23/23**, stable across reseed + re-read.

---

## Section 8 — Sub-batch breakdown

- **9d.3** — run the two §6 gates (cascade-completeness + createdAt-override). Report empirical results; **stop-and-hold on any gate failure** (determines seed implementation). No seed code yet.
- **9d.4** — build `scripts/seed-sandbox-phase9.ts` (orchestrator + Stage 3 + the §5 fixture, with the hard sandbox guard). Run it against the empty sandbox; verify table row counts match §5; verify the seed tenant exists. Report.
- **9d.5** — idempotency verification: re-run (no manual changes between) → identical row counts; insert a junk non-seed row, re-run → junk survives, seed-tenant data is reset. Report.
- **9d.6** — build `scripts/check-analytics-readers.ts` (the retained harness); run against the seeded sandbox; all assertions pass (first real cross-validation of 9c readers on rich deterministic data). Report.
- **9d.7** — cleanup (delete `verify-9d-gates.ts` + `verify-9d5-idempotency.ts`); retain seed + fixture + harness; **single commit**: seed + fixture + harness + `package.json` (the `db:check:analytics-readers` alias) + the two 9d docs (inspection + manifest). Report SHA/chain/tree.

**Decision:** locked order. No fork.

### 9d.6 findings (the harness's empirical payoff — both were SEED bugs; zero reader changes)

The harness caught **two real bugs on its first run** (19/23), both in the seed, none in the 9c readers — confirming the readers were correct and the harness-first discipline paid off:

1. **Timezone skew on seeded timestamps (consequential).** The mysql2 pool (`src/server/db.ts`) is created with no `timezone` option → mysql2 serializes client-side JS `Date`s in the **Node-process timezone**, while the analytics readers compute dwell against the server's **`NOW()`** (session tz `SYSTEM`). Every backdated seed timestamp was skewed by hours, so a "6h-old" NEW job (`n4`/`n5`) landed right on the **4h stall threshold** and flip-flopped between runs (the first harness run caught it under-threshold; a probe minutes later showed it over). Large-margin jobs (36h/96h/240h) masked it. **Fix:** the seed now anchors every timestamp to the DB clock via **`NOW() - INTERVAL n SECOND`** (helper `agoSql`), not a client Date — so the stored value and the reader's `NOW()` share one frame and a seeded age maps to exactly that dwell, TZ-independent. **Production is unaffected** (it uses DB-default `CURRENT_TIMESTAMP`, never client-supplied historical Dates). *Latent-risk note for closeout:* any production writer that supplies an explicit client-side `Date` for a time column compared against `NOW()` would inherit this skew — worth a `10-known-limitations.md` line.
2. **`dispatchAfterHours` is vestigial → degenerate dispatch distribution (observation, accepted).** The seed creates **no assignments for closed jobs**, so `timeToDispatchDistribution` is fed only by the 14 open jobs with assignments, all at a uniform **3600s** (the deliberate 9d.4 "ttd oracle simplicity"). `ClosedJobSpec.dispatchAfterHours` is declared but never seeded. Net: the reader's *plumbing* is verified but its *percentile ordering* is not exercised (p50=p90=mean=3600). **Not changed** (would re-open a confirmed 9d.4 decision); the oracle matches as-built and the gap is logged here + recommended as a future strengthening (seed closed-job assignments per `dispatchAfterHours` to make the distribution non-degenerate).

**Co-versioning proven:** reseed (exercises the reset) → harness → 23/23; second harness read → still 23/23 (boundary now firmly resolved, no flicker). Oracle helpers for the 4 distribution/top-N readers were added to the fixture (`expectedTopClients/expectedTopTrades/expectedTimeInStatus/expectedDispatch`); the percentile-applying oracles reuse the pure `summarizeSeconds` over independently fixture-derived input arrays (fair test of SQL extraction/attribution, not a tautology).

---

## Section 9 — Closeout forward-notes

- `04-admin-sop.md`: how to run the sandbox seed (env-var override + `--conditions=react-server` + the 3 stages + the partial-stage entry points); how to run `check-analytics-readers.ts`; the manual DROP+replay nuke escape hatch.
- `04-admin-sop.md` — **dynamic-import sandbox-guard pattern** (banked 9d.5): any sandbox-mutating script must set `process.env.DATABASE_URL = <derived sandbox URL>` **before** `await import("@/server/db" | "@/server/auth")`, and **refuse to run** unless the resolved URL ends in `_sandbox`. Schema-table imports stay static (no DB binding — typing only); only `db`/`auth` are dynamic so the binding picks up the swapped env. This is the single guard that makes "this script cannot touch prod" structurally true rather than convention. (Verify scripts that open their own `mysql2` connection apply the same guard on their connection string.)
- `04-admin-sop.md` — **matcher-facet pre-extraction discipline** (banked 9d.4/9d.5): before building anything that classifies on a facet (status, payment_status, tier, priority rank), pre-extract the exact set of valid facet values from the live reference tables / rule modules and pin them in the fixture/spec, rather than hand-typing them at call sites. In 9d this caught a class of late failures (mismatched status codes, wrong payment-state predicates) before they reached verification — the seed's per-row ground-truth labels (`expectedStalled`/`expectedTier`) are derived from the same pinned facets the readers consume.
- `04-admin-sop.md` — **explicit-ordered-delete reset over single-tenant-cascade** (banked 9d.5): document that the sandbox reset deletes 15 tenant-scoped tables in child→parent order inside `FOREIGN_KEY_CHECKS=0`, and **why** a one-line `DELETE FROM tenants` is insufficient (inter-child RESTRICT FK `jobs.client_location_id → client_locations` → `ER_ROW_IS_REFERENCED_2`). Generalize the lesson: **a `tenant_id`-FK cascade survey is necessary but not sufficient — survey inter-child RESTRICT FKs too, or sidestep them with explicit ordered deletes.**
- `10-known-limitations.md`: the seed/harness pair is the project's **first standing regression artifact** — a partial answer to CF-8c.8.3 (not a full test framework). (Pre-existing entries unchanged: `job_status_history` scale-watchpoint index; tool-output reliability discipline.)
- `02-decisions.md`: 9d's three foundational decisions — orchestrate-all-three (shell-out reference seeds; job-reference-after-tenant-create); tenant-cascade-delete + user-upsert idempotency; retained `check-`-named harness with the co-versioning contract; plus the §7 oracle decision.
- `06-business-rules.md`: 9d adds no new business rules (pre-existing predicate/population/censoring entries unchanged); the seed is the canonical *illustration* of those rules.
- `04-admin-sop.md` — **`db:check:analytics-readers` npm alias** (added 9d.6): `pnpm db:check:analytics-readers` runs the retained harness (`tsx --env-file=.env.local --conditions=react-server scripts/check-analytics-readers.ts`) against the seeded sandbox; document run order (seed first, then check) and the co-versioning contract (seed/fixture/harness move in one commit).
- `02-decisions.md` **AND** `10-known-limitations.md` — **mysql2 ↔ DB timezone skew** (banked 9d.6; the architecturally most important finding of Phase 9). Verbatim framing for both docs: *"mysql2 client serializes JS `Date` objects in the Node-process timezone, but the MySQL session timezone is `SYSTEM` (DB host's tz). Comparing against server `NOW()` produces a skew equal to the timezone delta between Node host and DB host. Any code writing timestamp values must either (a) use server-anchored expressions like `sql`NOW() - INTERVAL n SECOND`` and let the DB compute the value, or (b) write `Date.toISOString()` UTC strings and explicitly configure the mysql2 connection's `timezone: 'Z'` option. Phase 9 9d uses option (a) via the `agoSql` helper, sandbox-scoped. Production is unaffected (real operator writes use DB-default `CURRENT_TIMESTAMP`). Codebase-wide adoption of option (b) at the mysql2 pool configuration would eliminate the entire bug class but requires auditing existing date-write paths; this is a future cleanup, not a Phase 9 deliverable."*
- `closeout-carryforwards.md` (or equivalent) — **9d seed coverage gap: dispatch-timing degenerate** (banked 9d.6). Verbatim: *"9d seed coverage gap: `dispatchTimingDistribution` operates over uniform 3600s deltas because the seed creates no closed-job assignments. Reader correctness is proven by the harness; distribution variance is not exercised. Future seed strengthening (varied dispatch deltas across both open and closed jobs) would convert this from a 'reader returns a number' check into a 'reader returns a meaningful distribution' check. Recommended for the seed when first edited post-Phase-9."*
- `04-admin-sop.md` — **seed coverage discipline: threshold-boundary placement** (banked 9d.6). Verbatim: *"Seed coverage discipline — deliberately place test data at threshold boundaries, not just well-into or well-out-of threshold ranges. Boundary cases surface bugs that magnitude-buffered cases hide. The 9d.6 TZ-skew bug was caught because §5 specified 6h-old NEW jobs against a 4h threshold (a 2h margin that flipped under the actual TZ skew of ~3h). A coverage spec with 'NEW: 1h fresh, 24h stalled' would have hidden the bug indefinitely. Future seed designs for Phase 14 PM / Phase 15 snow / chatbot training data should follow the boundary-coverage pattern."*
- `04-admin-sop.md` — **cascade-completeness pre-check pattern** (banked 9d.3): before relying on any tenant-scoped reset, run a read-only `information_schema.REFERENTIAL_CONSTRAINTS` survey on **both** prod and sandbox to enumerate `DELETE_RULE`s (9d recorded 66 CASCADE + 1 SET NULL across 67 tenant-scoped FKs, prod≡sandbox). Necessary but not sufficient on its own — pair it with the inter-child RESTRICT FK survey (see ordered-delete bullet above).
- `11-closeout.md` — **§1 hard-rule compliance record** (banked 9d.3): the only production queries across all of Phase 9 (9b schema gate + 9d gates) were **read-only `information_schema`** checks; every write (indexes applied in 9b.5, all 9d seed/reset activity) was sandbox-scoped or an explicit approved prod-apply. "Browser never connects to MySQL" + "no production writes from build scripts" upheld throughout.
- `10-known-limitations.md` / `04-admin-sop.md` — **better-auth NULL-tenant audit rows** (banked 9d.5): `signUpEmail` fires audit hooks (`auth.user.created`, `auth.login`) that write `audit_logs` with `tenant_id = NULL` (no tenant context at signup — Phase-1 forensic-trail design). The seed's **user-upsert-by-email** keeps this count **frozen** across re-runs (re-runs reuse global users → no fresh signup → no new audit rows); the idempotency invariant is "NULL-tenant audit count does not grow", not "= 0". The reset's explicit `audit_logs` pre-delete handles the `SET NULL` FK so no tenant-scoped audit orphans accrue.

---

## Section 10 — Pre-draft inspection findings (done; folded into the body)

- **Reference-seed script names** confirmed → §2 Stage 2 pins `db:seed:trades` + `db:seed:dispatch-reference` (global) and Stage 3.3 pins `db/seeds/job-reference.ts` (tenant-scoped, via `SEED_TENANT_SLUG`).
- **`job-reference.ts` mechanism** (the consequential one) → resolves tenant by `SEED_TENANT_SLUG` (default `"demo"`), **aborts if absent**, bundles priorities+statuses+sequence. This *forced* the §2 ordering (job-reference must run after 3.2 tenant-create) and *resolved* the priorities sub-decision (reuse it, no duplication).
- **Tenant creation** = direct slug-keyed `db.insert(tenants)` → §3 identity + §2 step 3.2.
- **Slug convention** = lowercase-hyphenated (`"demo"`) → `phase9-seed-tenant` fits.
