# Phase 12 — Database Changes

12 new `external_*` tables across 5 migrations (0028–0032), all sandbox- + prod-applied + contract-verified. Prod schema at close: **12 external_* tables, 93 total, 33 migrations.**

## Migration 0028 — connection substrate
- `external_systems` — `tenant_id` (FK cascade), **`provider` varchar(64)** (F3, app-enforced), `name`, `status` enum, `config` json, `created_by_user_id` (FK **SET NULL**, D-12c.1). Unique `(tenant_id, provider, name)`.
- `external_accounts` — `tenant_id`, `external_system_id` (FK cascade), `external_account_ref`, `status`, `config`.
- `external_credentials` — `tenant_id`, `external_system_id` (FK cascade), `credential_type`, **`encrypted_payload` text (nullable, never plaintext)**, `key_ref`, `expires_at`, `status` enum(active/inactive/revoked).

## Migration 0029 — code mappings
- `external_status_mappings` → GLOBAL `job_statuses` (NO tenant_id); `external_code`, `job_status_id` (FK), `direction`. Unique `(external_system_id, external_code, direction)`.
- `external_trade_mappings` → GLOBAL `trades` (NO tenant_id); same shape, `trade_id`.
- `external_priority_mappings` → TENANT-SCOPED `priorities`; **carries `tenant_id`** (F5). Unique **`(tenant_id, external_system_id, external_code, direction)`**.

## Migration 0030 — link + sync/log
- `external_work_order_links` — `tenant_id`, `external_system_id`, `external_wo_id` varchar(255), **`job_id` (FK→jobs SET NULL, audit-preserve)**, `link_status`, `last_synced_at`. **Unique `(external_system_id, external_wo_id)`** — the dedup key.
- `external_sync_runs` — orchestration with a mutable status tail (running→succeeded/failed/partial), `counts` json.
- `external_sync_events` — per-item; `sync_run_id` (FK→sync_runs **CASCADE**); `external_wo_id`/`job_id` are **polymorphic plain columns, NO hard FK** (communication_logs.source_id precedent).
- `external_payload_logs` — raw payload audit; `sync_run_id` (FK→sync_runs **SET NULL**, preserve payload if run purged); `external_wo_id` plain; **`payload` json — never credentials** (R-12.13).

## Migration 0031 — location mapping (IF-2)
- `external_location_mappings` → TENANT-SCOPED `client_locations`; `tenant_id`, `external_system_id`, `external_code` **varchar(255)** (provider store ids are longer), `client_location_id` (FK), `direction` default `'both'`.

## Migration 0032 — multi-client (D-12h.1/.2)
- NEW `external_client_mappings` — `(external_system_id, external_code) → client_id`, tenant-scoped. Unique `(external_system_id, external_code)`.
- ALTER `external_location_mappings`: **add `client_id`** (FK→clients cascade); **swap unique** to `(external_system_id, client_id, external_code)` — StoreId is per-client. (Safe additive — the table was empty in prod.)

## FK delete-rule rationale
- **CASCADE** (the default) — tenant/system FKs, mapping FKs, `external_sync_events.sync_run_id`: a row has no value without its parent.
- **SET NULL** — `external_systems.created_by_user_id` (preserve the integration if the creator is deleted, D-12c.1); `external_work_order_links.job_id` + `external_payload_logs.sync_run_id` (preserve the link/audit record if the job/run is purged).

## Conventions
- All FKs pre-named (`es_`/`ea_`/`ec_`/`esm_`/`etm_`/`epm_`/`elm_`/`ecm_`/`ewol_`/`esr_`/`ese_`/`epl_`) — the long table names exceed MySQL's 64-char auto-name limit (WP-12.2).
- Explicit FK-backing indexes on every FK column (6d/6g lesson).
- `json` columns round-trip as raw strings on read — parse at the read boundary (the MariaDB-JSON gotcha; surfaced again in 12k).
