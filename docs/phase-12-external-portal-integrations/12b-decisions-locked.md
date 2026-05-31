# Phase 12 — 12b Decisions Locked (External Integration Framework)

All ten 12a forks resolved on the basis of the 12a inspection + the 12a.1/12b.0 live confirms (C1–C4, D2, D4). This is the construction contract; 12c onward builds against it. Target tag `v1.3.0-phase-12`.

**Grounding facts (live-confirmed):** `external_*` tables net-new (C1 empty); `jobs.source_type` enum includes `external_client_portal` live (C2); `trades` 15 GLOBAL / `job_statuses` 9 GLOBAL / `priorities` 5 TENANT-SCOPED, 1 tenant, zero off-seed (D2); secret storage is **env-only — no encryption util, no secrets table, no `crypto` import** (D4); next free migration `0028`; `db:migrate` reads `.env.local`/`DATABASE_URL` independently of the read-only `.pm_db.cnf`.

---

## A. Forks resolved (F1–F10)

| Fork | Decision |
|---|---|
| **F1 — credentials** | `external_credentials` ships the **full secrets-capable shape** (`credential_type`, `encrypted_payload`, `key_ref`, `expires_at`, `status`). The ServiceChannel **skeleton WRITES NO LIVE SECRET**. **Encryption-at-rest is deferred to the first working adapter** (D4 confirmed no existing pattern to mirror — it is new ground, decided when a real secret first needs storing). The column is **`encrypted_payload`** — **never plaintext**. **No credential value ever enters a payload log** (harness-asserted, F10.4). |
| **F2 — granularity** | Ship **both `external_systems` + `external_accounts`**. MVP is **one-system → one-account**; multi-account-per-system is forward-banked (not built). |
| **F3 — provider discriminator** | `provider` = **varchar(64), app-enforced** — adding a new provider needs **no enum migration** (the `job_notes.origin` / D-11.10 varchar lesson). |
| **F4 — mapping direction** | Mapping tables **carry a `direction` enum(inbound/outbound/both) now** (avoids a later ALTER; MVP populates inbound). |
| **F5 — priority mapping tenant dim** | `external_priority_mappings` **carries `tenant_id` directly AND includes it in the unique key** (priorities are tenant-scoped — D2). `external_status_mappings` / `external_trade_mappings` target **GLOBAL** ids → **no tenant dimension**. |
| **F6 — log tables** | Ship **all three**: `external_sync_runs` / `external_sync_events` / `external_payload_logs`. |
| **F7 — ingest status flow** | Ingest = **`createJob` (lands NEW)** → **explicit mapped-status transition** that writes `job_status_history` (preserves the explicit-transition rule **R-5.8**; no silent status set). |
| **F8 — adapter interface** | The adapter interface = **`normalizePayload` / `fetchWorkOrders` / `pushStatus`** only. **Code-mapping lives in `core/mapping.ts`, NOT the adapter** (the §2.1 core/adapter boundary — mapping is generic, the adapter only speaks the provider's wire format). |
| **F9 — migration grouping** | **Three migrations**, three gates: **0028** systems/accounts/credentials · **0029** mappings · **0030** links + sync/log. Each gets its own `SHOW CREATE` inspection halt + prod-confirm gate. |
| **F10 — harness** | `scripts/check-external-integrations.ts`, **mock adapter, no network**, **4 assertions**: (1) **source-agnostic** — a mock WO → a `jobs` row + an `external_work_order_links` row, `source_type='external_client_portal'`; (2) **mapping correctness** incl. the priority tenant-dim; (3) **tenant isolation** on all new tables; (4) **no credential leak** in payload logs. |

---

## B. Confirmed 10-table shapes (12a §A, amended by the locks)

All `id` varchar(36) uuidv7 PK, `created_at`/`updated_at` timestamps unless noted. **FK-backing-index rule (6d/6g lesson):** assert the *explicit* indexes below; do **not** rely on InnoDB auto-backing FK columns — declare an index on every column we query by.

### 1. `external_systems` (`es_`) — registered integrations, per tenant
`tenant_id` (FK→tenants cascade) · **`provider` varchar(64)** (F3, app-enforced) · `name` varchar(255) · `status` enum(active/inactive/archived) · `config` json (non-secret settings) · `created_by_user_id`.
Unique `(tenant_id, provider, name)`. Index `(tenant_id, status)`.

### 2. `external_accounts` (`ea_`) — per-system connection identity (F2)
`tenant_id` · `external_system_id` (FK→external_systems cascade) · `external_account_ref` varchar(255) · `status` enum · `config` json.
Index `(tenant_id, external_system_id)`. MVP: one account per system.

### 3. `external_credentials` (`ec_`) — secrets (F1; SECURITY CRUX)
`tenant_id` · `external_system_id` (FK cascade) · `credential_type` varchar(64) (api_key/oauth/basic) · **`encrypted_payload` text** (never plaintext) · `key_ref` varchar(255) (which key/alias encrypted it) · `expires_at` datetime (nullable) · `status` enum.
Index `(tenant_id, external_system_id)`. Encryption mechanism deferred to the first working adapter; skeleton stores nothing live.

### 4. `external_work_order_links` (`ewol_`) — the source-agnostic JOIN
`tenant_id` · `external_system_id` (FK cascade) · **`external_wo_id` varchar(255)** (the provider WO id; cf. `jobs.source_external_id`) · **`job_id` varchar(36) FK→jobs cascade** · `link_status` enum(active/unlinked) · `last_synced_at` datetime.
**Unique `(external_system_id, external_wo_id)`** — the duplicate-detection the `jobs.ts` comment deferred to "Phase 12's linking table". Index `(tenant_id, job_id)`.

### 5. `external_status_mappings` (`esm_`) → GLOBAL `job_statuses`
`external_system_id` (FK cascade) · `external_code` varchar(128) · **`job_status_id` FK→job_statuses** · **`direction` enum(inbound/outbound/both)** (F4). Unique `(external_system_id, external_code, direction)`. **No tenant dim** (target is global, F5).

### 6. `external_trade_mappings` (`etm_`) → GLOBAL `trades`
`external_system_id` (FK cascade) · `external_code` varchar(128) · **`trade_id` FK→trades** · **`direction` enum** (F4). Unique `(external_system_id, external_code, direction)`. **No tenant dim** (F5). (Schema already earmarks this as the 2-D `external_system × trade` matrix.)

### 7. `external_priority_mappings` (`epm_`) → TENANT-SCOPED `priorities`
**`tenant_id`** (FK→tenants cascade) · `external_system_id` (FK cascade) · `external_code` varchar(128) · **`priority_id` FK→priorities** · **`direction` enum** (F4). **Unique `(tenant_id, external_system_id, external_code, direction)`** — tenant_id in the key (F5). Index `(tenant_id, external_system_id)`.

### 8. `external_sync_runs` (`esr_`) — orchestration, mutable-tail (mirror `communication_logs`)
`tenant_id` · `external_system_id` (FK cascade) · `run_type` varchar(64) (inbound_pull/outbound_push/webhook) · `status` enum(running/succeeded/failed/partial) · `started_at` · `finished_at` (nullable) · `counts` json (created/updated/skipped/errored) · `error_summary` text (nullable).
Index `(tenant_id, external_system_id, started_at)`.

### 9. `external_sync_events` (`ese_`) — per-item events under a run
`tenant_id` · `sync_run_id` (FK→external_sync_runs cascade) · `external_wo_id` varchar(255) (nullable) · `job_id` varchar(36) (nullable, no hard FK — polymorphic link like `communication_logs.source_id`) · `event_type` varchar(64) (wo_created/wo_updated/status_pushed/error) · `outcome` enum(ok/skipped/error) · `message` text (nullable) · `metadata` json.
Index `(tenant_id, sync_run_id)`.

### 10. `external_payload_logs` (`epl_`) — raw payload auditability
`tenant_id` · `external_system_id` (FK cascade) · `sync_run_id` varchar(36) (nullable) · `direction` enum(inbound/outbound) · `external_wo_id` varchar(255) (nullable) · `payload` json (the raw provider body — **MariaDB-JSON-parse-at-read-boundary applies**; **NO credential ever written here**, F1/F10.4) · `received_at` datetime.
Index `(tenant_id, external_system_id, received_at)`.

**Cross-cutting:** tenant-scoped tables get `tenant_id` FK cascade; global-target mapping tables (5,6) carry no tenant dim on the target join. JSON columns parse at the read layer. FK-prefix per table as above.

---

## C. Migration grouping (F9)

Three units, three independent gates — each: drizzle schema entry → `npm run db:generate` → **`SHOW CREATE` inspection HALT** → sandbox apply → contract-verify → **HALT for prod confirm** → prod apply → contract-verify → 4-file local commit (schema + `.sql` + `_journal.json` + `<n>_snapshot.json`, the ratified shape).

- **0028** — `external_systems`, `external_accounts`, `external_credentials` (the connection + secret substrate).
- **0029** — `external_status_mappings`, `external_trade_mappings`, `external_priority_mappings` (the translation layer).
- **0030** — `external_work_order_links`, `external_sync_runs`, `external_sync_events`, `external_payload_logs` (the link + sync/log layer).

All empty-table CREATEs (plain CREATE TABLE — the populated-additive-default cadence does not apply).

---

## D. `src/lib/integrations/` tree (12a §B, amended)

```
src/lib/integrations/
  core/
    types.ts          # the shared adapter INTERFACE + domain types
    registry.ts       # provider → adapter registration (agents/registry.ts seam)
    mapping.ts        # OWNS code-resolution: external_code → trade/status/priority id (F8)
    ingest.ts         # generic: normalized WO → createJob wrapper → ewol link + mapped-status transition (F7)
    sync.ts           # generic run/event/payload-log orchestration
  servicechannel/
    adapter.ts        # implements ONLY normalizePayload/fetchWorkOrders/pushStatus (F8) — SKELETON
    index.ts          # registers servicechannel INTO core/registry
```
**Invariant (§2.1):** `core/*` references the adapter interface only and **never imports `servicechannel/*`**; the adapter **registers INTO** `core/registry.ts`. **Mapping is core, not adapter** (F8) — the adapter speaks the provider wire format; translating its codes to our ids is generic. Adding a second provider = a new folder + one registration line, **zero core changes**. ServiceChannel is a conformance skeleton (interface + stubs), not working sync. The server-side ingest wrapper (likely `src/server/integrations/ingest-external-job.ts`) wraps `createJob` with `sourceType='external_client_portal'` + `sourceExternalId`, writes the `ewol` row, then applies the mapped-status transition (F7) — mirroring `createClientJob`.

---

## E. Construction sequence (12c→12p) + forward-bank

**Sequence** (each inspect-before-construct; migrations are outward-facing → prod-confirm-gated):
- **12c** — migration **0028** (systems/accounts/credentials) — schema entry + generate + SHOW CREATE halt + sandbox→prod + 4-file commit.
- **12d** — migration **0029** (mappings).
- **12e** — migration **0030** (links + sync/log).
- **12f** — `src/lib/integrations/core/` — interface (`types.ts`), `registry.ts`, `mapping.ts` (code-resolution over the live value sets).
- **12g** — `core/ingest.ts` + the server ingest wrapper (`createJob` → `ewol` link → mapped-status transition, F7) — the source-agnostic write crux.
- **12h** — `core/sync.ts` (run/event/payload-log orchestration; no-credential-leak discipline).
- **12i** — `servicechannel/` adapter **skeleton** (normalizePayload/fetchWorkOrders/pushStatus stubs) + registration.
- **12p** — closeout: `scripts/check-external-integrations.ts` (F10, 4 assertions, mock adapter) MUST be green before tag; 12-doc set; seed extension (a mock external_system + mappings) co-versioned with the harness; tag `v1.3.0-phase-12`.

**Forward-bank (carry until discharged):**
- **WP-12.1** — always pass `jonnyrosero_pm` explicitly to the read-only `mysql` CLI (a bare cnf connection lands on another of Jonny's DBs).
- **F1 deferred-encryption** — encryption-at-rest mechanism decided at the first working adapter; skeleton stores no live secret; `encrypted_payload` only.
- **OQ-6 outbound guard** — when outbound push lands (post-MVP), never push margin/markup/internal data outward (the Phase-11 OQ-6 invariant, applied to external sync).
- **No-credential-leak** — `external_payload_logs` never contains a credential value (F10.4 asserts it).
- **FK-backing-index** — assert explicit indexes on the new tables; do not rely on InnoDB auto-backing (6d/6g lesson).
- **F2 multi-account-deferred** — one-account-per-system MVP; multi-account is a later slice.
