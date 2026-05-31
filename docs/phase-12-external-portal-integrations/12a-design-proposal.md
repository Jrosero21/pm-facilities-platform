# Phase 12 — 12a Design Proposal (External Integration Framework)

**Status: PROPOSED, not decided.** Candidate shapes grounded in the 12a inspection. All forks are surfaced, not resolved — 12b locks them. No code/schema authored here.

Per roadmap §8 Phase 12 + §2.1 (source-agnostic invariant): a **generic** external-portal integration framework + **one ServiceChannel adapter skeleton**, with ServiceChannel logic confined to the adapter, never the core.

---

## A. Candidate table shapes (10 tables)

Grounded in S4 (global `trades`/`job_statuses` join on `code`; tenant-scoped `priorities`) and S5 (`audit_logs` generic shape; `communication_logs` mutable-tail log spine; FK-prefix convention; JSON-at-read gotcha). All `id` varchar(36) uuidv7 PK, `created_at`/`updated_at` timestamps unless noted. **Column lists are candidates for 12b to confirm/cut.**

### 1. `external_systems` (prefix `es_`) — registered integrations, per tenant
`tenant_id` (FK→tenants cascade) · `provider` varchar(64) (e.g. `servicechannel` — the adapter key, app-enforced, NOT an enum so new providers need no migration — mirrors the `job_notes.origin` varchar lesson) · `name` varchar(255) · `status` enum(active/inactive/archived) · `config` json (non-secret per-system settings) · `created_by_user_id`.
Unique `(tenant_id, provider, name)`. Index `(tenant_id, status)`.

### 2. `external_accounts` (prefix `ea_`) — per-system connection identity
`tenant_id` · `external_system_id` (FK→external_systems cascade) · `external_account_ref` varchar(255) (the provider-side account/org id) · `status` enum · `config` json.
Index `(tenant_id, external_system_id)`.
*(Fork: is `external_accounts` distinct from `external_systems`, or do they collapse into one table for MVP? — see Forks.)*

### 3. `external_credentials` (prefix `ec_`) — secrets (SECURITY CRUX)
`tenant_id` · `external_system_id` (FK) · `credential_type` varchar(64) (api_key/oauth/basic) · `encrypted_payload` text · `key_ref` varchar(255) (which key/KMS alias encrypted it) · `expires_at` datetime? · `status` enum.
**12b must first inspect how the platform stores secrets today** (env-only so far — better-auth secrets, AI keys via env). The encryption-at-rest mechanism is an open security fork; the table shape depends on it.

### 4. `external_work_order_links` (prefix `ewol_`) — the source-agnostic JOIN
`tenant_id` · `external_system_id` (FK) · **`external_wo_id` varchar(255)** (the provider WO id; cf. `jobs.source_external_id`) · **`job_id` varchar(36) FK→jobs cascade** · `link_status` enum(active/unlinked) · `last_synced_at` datetime.
**Unique `(external_system_id, external_wo_id)`** — the duplicate-detection the jobs.ts comment deferred to "Phase 12's linking-table concern". This row is what keeps us source-agnostic: an external WO becomes an ordinary `jobs` row (`source_type='external_client_portal'`, `source_external_id=external_wo_id`) + a link row.

### 5–7. Mapping tables (prefix `esm_`/`epm_`/`etm_`)
- **`external_status_mappings`** → target GLOBAL `job_statuses`: `external_system_id` (FK) · `external_code` varchar(128) · **`job_status_id` FK→job_statuses** · `direction` enum(inbound/outbound/both)?. Unique `(external_system_id, external_code, direction)`.
- **`external_trade_mappings`** → target GLOBAL `trades`: `external_system_id` · `external_code` · **`trade_id` FK→trades**. (The schema comment already earmarks this as 2-D `external_system × trade`.)
- **`external_priority_mappings`** → target TENANT-SCOPED `priorities`: **carries `tenant_id`** (the target is tenant-scoped) · `external_system_id` · `external_code` · **`priority_id` FK→priorities**. (This is the one mapping table that needs a tenant dimension — S4 finding.)
All join via the uppercased `code` columns S4 confirmed.

### 8. `external_sync_runs` (prefix `esr_`) — orchestration, mutable-tail (mirror `communication_logs`)
`tenant_id` · `external_system_id` (FK) · `run_type` varchar(64) (inbound_pull/outbound_push/webhook) · `status` enum(running/succeeded/failed/partial) · `started_at` · `finished_at` · `counts` json (created/updated/skipped/errored) · `error_summary` text?. The append-on-create + mutable-status-tail shape from S5.

### 9. `external_sync_events` (prefix `ese_`) — per-item events under a run
`tenant_id` · `sync_run_id` (FK→external_sync_runs cascade) · `external_wo_id` varchar(255)? · `job_id` varchar(36)? · `event_type` varchar(64) (wo_created/wo_updated/status_pushed/error) · `outcome` enum(ok/skipped/error) · `message` text? · `metadata` json. Polymorphic-ish link by `external_wo_id`/`job_id` (no hard FK, like `communication_logs.source_id`).

### 10. `external_payload_logs` (prefix `epl_`) — raw payload auditability
`tenant_id` · `external_system_id` (FK) · `sync_run_id`? · `direction` enum(inbound/outbound) · `external_wo_id`? · `payload` json (the raw provider body — **JSON-at-read gotcha applies**) · `received_at`. The "every meaningful workflow gets a history/event row" principle applied to ingestion; supports replay + debugging.

**Cross-cutting candidates:** all tenant-scoped tables get `tenant_id` FK cascade; the global-target mapping tables do not duplicate tenant on the target join; FK-backing-index rule (assert explicit indexes, InnoDB auto-backs FK cols — the 6d/6g.a 10-vs-9 / 21-vs-11 lesson). Likely **one migration `0028`** creates the set (empty-table creates — plain CREATE TABLE, not the populated-additive cadence).

---

## B. Candidate `src/lib/integrations/` tree (core + adapter)

```
src/lib/integrations/
  core/
    types.ts          # the shared adapter interface + domain types
    registry.ts       # provider → adapter registration (mirrors agents/registry.ts)
    ingest.ts         # generic: external WO payload → createJob wrapper → ewol link row
    mapping.ts        # generic code-resolution (external_code → trade/status/priority id)
    sync.ts           # generic run/event/payload-log orchestration
  servicechannel/
    adapter.ts        # implements the core interface — the FIRST adapter SKELETON
    index.ts          # registers servicechannel into core/registry
```
**Invariant (§2.1):** `core/*` references the adapter interface only; it never imports `servicechannel/*`. The adapter is registered INTO the core (the `agents/registry.ts` enumeration-seam pattern). Adding a second provider later = a new folder + one registration line, zero core changes. ServiceChannel is a **skeleton** (interface conformance + stub methods), not working sync logic.

A server-side ingest wrapper (likely `src/server/integrations/ingest-external-job.ts`) wraps `createJob` with `sourceType='external_client_portal'` + `sourceExternalId`, then writes the `external_work_order_links` row — the inbound mapper, mirroring `createClientJob`.

---

## C. FORKS (open decisions for 12b — NOT answered here)

**F1 — Credential storage / encryption-at-rest.** How does the platform store secrets today (env-only confirmed for better-auth + AI keys)? Options: (a) app-layer encryption (a `key_ref` + `encrypted_payload`, key from env/KMS); (b) defer real secrets to a later phase, MVP stores a non-secret connection ref only; (c) a dedicated secrets table vs columns on `external_systems`. **Evidence:** no existing secret-storage table (S2); this is the phase's security crux. *Recommend inspecting `src/server/auth.ts` + env usage in 12b before deciding.*

**F2 — `external_systems` vs `external_accounts` granularity.** One table or two? **Evidence:** roadmap lists both; MVP may collapse them (one system = one account) and split later. Fork on whether multi-account-per-system is in MVP scope.

**F3 — Provider discriminator type.** `provider` as varchar (app-enforced, no migration for new providers — the `job_notes.origin`/`external_systems` varchar lesson) vs a mysqlEnum. **Evidence:** the origin-varchar precedent (D-11.10) argues varchar; a closed provider set argues enum. *Lean varchar per the documented pattern, but surface it.*

**F4 — Mapping direction.** Do mapping tables carry a `direction` (inbound/outbound/both) column now, or inbound-only for MVP? **Evidence:** roadmap §8 forbids full bidirectional automation; MVP is likely inbound ingest + status round-trip. Fork on whether outbound mapping rows exist yet.

**F5 — `external_priority_mappings` tenant dimension.** Confirmed needed (S4: priorities are tenant-scoped). Fork is only on *shape*: does the mapping row carry `tenant_id` directly, or derive it via `external_system_id → external_systems.tenant_id`? **Evidence:** S4. *Lean: carry `tenant_id` for query directness + a defense-in-depth check.*

**F6 — Sync-run model granularity.** Do we ship all three of `_sync_runs` / `_sync_events` / `_payload_logs` in MVP, or a subset (e.g. runs + payload_logs, events deferred)? **Evidence:** roadmap lists all three; S5 shows `communication_logs` as a single-spine precedent — a leaner MVP might fold events into the payload log. Fork on table count.

**F7 — Initial status on external ingest.** External WOs land at `createJob`'s hardcoded NEW (direct-to-queue, like client jobs) — OR does an external WO arrive pre-classified (mapped status) and need a post-create transition? **Evidence:** S3 (NEW is hardcoded in createJob; status mapping exists separately). Fork: ingest-at-NEW-then-map vs map-into-initial-status. *Lean: NEW then an explicit mapped transition (preserves the explicit-transition rule R-5.8).*

**F8 — Adapter interface surface.** What methods does the core adapter interface require for the ServiceChannel skeleton (e.g. `fetchWorkOrders`, `pushStatus`, `normalizePayload`)? **Evidence:** roadmap "one working adapter skeleton". Fork: the minimal interface shape — decided once in 12b so the skeleton + future adapters conform.

**F9 — Migration grouping.** One `0028` for all ~10 tables, or split (e.g. systems/accounts/credentials, then mappings, then sync/logs)? **Evidence:** all empty-table creates (plain CREATE TABLE). *Lean: one `0028` (atomic substrate), but surface — large single migrations have a review cost.*

**F10 — Harness shape.** A `scripts/check-external-integrations.ts` mirroring the vendor/client harnesses — what does it assert without a live provider? **Evidence:** harness discipline (pattern 10). Fork: assert the generic ingest/mapping/link path with a mock adapter (no network), the source-agnostic invariant (external WO → jobs row + link), and tenant isolation on the new tables.

---

## D. What 12b should confirm live (deferred from 12a)
1. `SHOW TABLES LIKE 'external\_%'` → expect zero (belt-and-suspenders on S2).
2. Live value sets: `SELECT code FROM trades` / `job_statuses` / `priorities` (seed values are authoritative, but confirm no tenant added priorities).
3. `SHOW COLUMNS FROM jobs LIKE 'source_type'` → confirm the enum live (S1 from source).
4. Secret-storage inspection (`src/server/auth.ts` + env) for F1.
