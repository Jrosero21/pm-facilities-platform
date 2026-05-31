# Phase 12 — 12k-A Harness Inspection + Assertion Ledger (phase-blocking; NOT yet authored)

Inspection for the 12k-B harness (`scripts/check-external-integrations.ts`) — the phase-blocking gate that must empirically discharge Phase 12's banked guarantees before tag/merge. **No harness code, no seed run, no DB write.** Drafts the assertion ledger 12k-B will implement.

## Inspection findings

**S1 — harness precedent (`scripts/check-client-portal.ts`, the closest analog).**
- **Env-swap + sandbox guard:** read `process.env.DATABASE_URL`, replace `/jonnyrosero_pm` → `/jonnyrosero_pm_sandbox`, **hard-abort if the result isn't a `_sandbox` URL**; set `process.env.DATABASE_URL = sandboxUrl` BEFORE any DB import.
- **Assert helper:** `let passed = 0; const failed: string[] = []; function check(label, cond) { cond ? passed++ : failed.push(label) + console.error('✗') }`. Final summary prints passed/failed + exits non-zero on any failure.
- **Dynamic imports post-swap:** `const { db } = await import("@/server/db")`, schema + drizzle ops + the server fns under test all `await import(...)` AFTER the env swap (so `db` binds to sandbox). The fixture (`seed-sandbox-phase9-fixture`) is imported for its slug/name constants.
- **Fixture resolution:** the fixture holds **no DB ids**; the harness resolves the seeded tenant/clients by `slug`/`name` at runtime.
- **Run:** `npm run db:check:client-portal` → `tsx --env-file=.env.local --conditions=react-server scripts/check-client-portal.ts`. **Destructive + re-seed-first** (run the seed before each harness run). 12k-B adds `db:check:external-integrations` in the same shape.

**S2 — seed fixture (what the seed already provides).** `scripts/seed-sandbox-phase9.ts` creates **exactly ONE tenant** (`phase9-seed-tenant`), 4 clients (acme/globex/initech/umbrella), client_locations (`N Main St` / Metropolis / NY / 10001), **5 priorities per tenant** (EMERGENCY/URGENT/HIGH/ROUTINE/SCHEDULED), the system user (12h-B.0), and **ZERO external_* rows** (no external_systems/mappings/links — those are harness-owned). Global `job_statuses` (9) + `trades` (15) exist.
**⚠ STOP-TRIGGER (noted):** the seed has **only ONE tenant** — but Group B (F5 priority cross-tenant) and Group C (tenant isolation) need **TWO**. Since all external_* rows are harness-created anyway, **12k-B's cleanest path is to build its own throwaway fixture inside the harness**: create 2 tenants (or reuse the seeded tenant as T-A + create a second T-B), each with a client + location + a priority + an `external_system` + the mapping rows. 12k-B owns + tears down this fixture; it does not depend on the seed for external_* data (only for global ref data + the system user). Flagged for Jonny: confirm "harness builds its own 2-tenant external fixture" vs "extend the shared seed."

**S3 — surfaces the harness drives.**
- **Inbound:** `ingestExternalJob({ externalSystemId, wo: NormalizedWorkOrder })` (server wrapper — derives tenantId from the system row + `getSystemUserId()`; the full authz path) → returns `IngestResult` (`parked_unmapped_client` | `skipped_already_linked` | `ingested {jobId, linkId, syncRunId, autoCreatedLocation, flags}`). The harness drives this with hand-built `NormalizedWorkOrder`s (IF-5: no live adapter).
- **Outbound:** `pushStatusToExternal({ tenantId, jobId, note? })` → `PushResult` (`{ok, externalRef?, error?}`).
- **Adapter:** `getAdapter('servicechannel')` (after importing `servicechannel/index` to self-register) → `serviceChannelAdapter`; `pushStatus` returns `{ok:true, externalRef:'noop-skeleton'}`.
- **12 external_* tables** (isolation targets): `external_systems`, `external_accounts`, `external_credentials`, `external_status_mappings`, `external_trade_mappings`, `external_priority_mappings`, `external_location_mappings`, `external_client_mappings`, `external_work_order_links`, `external_sync_runs`, `external_sync_events`, `external_payload_logs`. **Tenant-carrying (9):** all except `external_status_mappings` + `external_trade_mappings` (global-target, no tenant_id).
- **Mapping rows for a test:** the harness inserts directly — `external_systems` (per tenant, provider='servicechannel'), `external_client_mappings` (externalCode→clientId), `external_location_mappings` (externalSystemId+clientId+externalCode→clientLocationId), `external_status/trade/priority_mappings` (externalCode→ the resolved id), optional `external_accounts` (for push) + `external_credentials` (a seeded cred row, for the no-leak assertion).

## Assertion ledger (12k-B must discharge) — 24 assertions across A–E

### A. SOURCE-AGNOSTIC (the §2.1 data proof) — 4
- **A1** ingest a mapped WO → a `jobs` row exists with `source_type='external_client_portal'` AND `source_external_id = wo.externalWoId`.
- **A2** a matching `external_work_order_links` row exists: `external_wo_id = wo.externalWoId`, `job_id = <the new job>`, `link_status='active'`.
- **A3** the job's `current_status_id` = the global **NEW** status (IF-6 — landed at NEW regardless of mapped status).
- **A4** the mapped status is RECORDED, not applied: the `wo_created` `external_sync_events` row's `metadata.resolvedStatusId` = the mapped job_status id, while the job itself is still NEW (A3).

### B. MAPPING CORRECTNESS incl. F5 priority tenant-dim — 4
- **B1** an ingested WO's trade resolves to the GLOBAL `trades` id its `external_trade_mappings` row points to (the created job's `primary_trade_id`).
- **B2** priority resolves to **tenant A's** `priorities` id (the job's `priority_id`).
- **B3** tenant **B** with the SAME external priority `external_code` (mapped to B's own priority) ingests → its job's `priority_id` = **B's** priority id, NOT A's (the F5 isolation proof — no cross-tenant contamination).
- **B4** status resolves to the GLOBAL `job_statuses` id (recorded in the sync_event per A4).

### C. TENANT ISOLATION (the 9 tenant-carrying external_* tables) — 4
- **C1** `resolvePriority`/`resolveStatusOutbound`/the mapping queries scoped to tenant A's `external_system` never return tenant B's mapping rows (query A's system id → only A's rows).
- **C2** `pushStatusToExternal({tenantId: A, jobId: <B's job>})` → does NOT find an active ewol link under tenant A → `{ok:false, JOB_NOT_EXTERNALLY_LINKED}` (no cross-tenant push).
- **C3** ingest under tenant A's `external_system` links only to A's job/client/location (the created job's `tenant_id` = A; its client/location ∈ A).
- **C4** every external_* row the harness created carries the correct `tenant_id` (spot-check the tenant-carrying tables: systems/accounts/credentials/client+location+priority mappings/links/runs/events/payload_logs all = the owning tenant).

### D. NO-CREDENTIAL-LEAK + OQ-6 — 5
- **D1** seed an `external_credentials` row (a marker value in `encrypted_payload`); after a full ingest, NO `external_payload_logs` row's `payload` contains that marker.
- **D2** after an outbound `pushStatusToExternal`, NO `external_payload_logs` row contains the credential marker.
- **D3** no `external_sync_events.metadata` carries the credential marker.
- **D4** the outbound payload_log records the push (`externalStatusCode` + `PushResult`) — and contains NO `cost`/`markup`/`margin`/`subtotal`/`total` key (OQ-6; the `NormalizedStatusPush` type already forbids it — assert the logged shape).
- **D5** no ingest/push log row carries any AR/markup field (OQ-6 — assert absence of those keys across the run's payload_logs).

### E. LOCKED BEHAVIORS — 7
- **E1 (IF-7)** ingest a WO whose `externalClientCode` is UNMAPPED → result `parked_unmapped_client`; assert NO new `jobs` row and NO new `clients` row were created; an `external_sync_events` `error` row exists.
- **E2 (auto-stub)** ingest a WO with a mapped client but UNMAPPED location → a `client_location` stub is created (address from the WO payload; `[NEEDS REVIEW]` where a field is absent), a new `external_location_mappings` row links it, the result flags include `auto_created_location`, and the job proceeds (ingested).
- **E2b** the auto-stub used the **real payload address** when present (assert the stub's `address_line1`/`city` = the WO's values, not the placeholder).
- **E3 (IF-3)** re-ingest the SAME `external_wo_id` → result `skipped_already_linked`; assert NO duplicate `jobs` row (count unchanged) and the ewol row's `last_synced_at` advanced.
- **E4 (adapter)** `getAdapter('servicechannel')` resolves (after importing the registration module); `pushStatus` returns `{ok:true, externalRef:'noop-skeleton'}`.
- **E5 (no-creds-on-push)** the push path returns the no-op result WITHOUT any `external_credentials` read (assert via D2/D3 + that the result is the skeleton ref).
- **E6 (normalizePayload)** `serviceChannelAdapter.normalizePayload(<a SC WO body>)` maps SubscriberId→externalClientCode, LocationId(else StoreId)→externalLocationCode, address→location detail, Description→problemDescription (a pure-function assertion, no DB).

**Total: 24 assertions** (A:4, B:4, C:4, D:5, E:7). Each cites the real table/field/fn shape from S1–S3.

## Verdict line inputs
- harness/seed precedent inspected ✓ · 12 tables enumerated ✓ · ingest+push entries confirmed ✓
- **two-tenant fixture: NEEDS harness-built fixture** (seed has one tenant; harness owns external_* anyway) — confirm approach before 12k-B.
