# Phase 14 — Database Changes

8 new `pm_*` tables across 3 migrations (0036–0038), sandbox + prod applied + contract-verified. **Prod at close: 107 tables (99→107).** All FKs pre-named (WP-12.2); all tables InnoDB / utf8mb4; PKs = `uuidv7 varchar(36)` (matches all live tables + FK type-matching).

## Migration 0036 — core
- **`pm_programs`** — `id, tenant_id, client_id, name, primary_trade_id (null), priority_id (null), scope_of_work text NOT NULL, auto_generate bool default true, is_active bool default true, created_by_user_id (null), created_at, updated_at`. FKs: `fk_pm_programs_tenant`→tenants CASCADE, `fk_pm_programs_client`→clients **RESTRICT**, `fk_pm_programs_trade`→trades **RESTRICT**, `fk_pm_programs_priority`→priorities **RESTRICT**, `fk_pm_programs_created_by`→users **SET NULL**.
- **`pm_schedules`** — `id, tenant_id, pm_program_id, frequency enum('day','week','month') NOT NULL, interval_count int default 1, next_due_at datetime NOT NULL, last_generated_at datetime (null), is_active bool default true, created_at, updated_at`. FKs: `fk_pm_schedules_tenant`→tenants CASCADE, `fk_pm_schedules_program`→pm_programs **CASCADE**. Index `(is_active, next_due_at)` for the due-scan.
- **`pm_schedule_locations`** (fan-out membership) — `id, tenant_id, pm_schedule_id, client_location_id, is_active bool default true, created_at`. FKs: `fk_pmsl_tenant`→tenants CASCADE, `fk_pmsl_schedule`→pm_schedules CASCADE, `fk_pmsl_location`→client_locations CASCADE.

## Migration 0037 — occurrence
- **`pm_generation_runs`** (F2 batch-event) — `id, tenant_id, pm_schedule_id, requested_count int default 0, generated_count int default 0, skipped_count int default 0, run_at datetime NOT NULL, created_by_user_id (null), created_at`. FKs: `fk_pm_gen_runs_tenant`→tenants CASCADE, `fk_pm_gen_runs_schedule`→pm_schedules CASCADE, `fk_pm_gen_runs_created_by`→users **SET NULL**.
- **`pm_visits`** — `id, tenant_id, pm_schedule_id, client_location_id, pm_generation_run_id (null), due_at datetime NOT NULL, generation_status enum('generated','skipped','pending_review') NOT NULL, skip_reason varchar(512) (null), job_id varchar(36) (null — F5), created_at`. FKs: `fk_pm_visits_tenant`→tenants CASCADE, `fk_pm_visits_schedule`→pm_schedules CASCADE, `fk_pm_visits_location`→client_locations CASCADE, `fk_pm_visits_run`→pm_generation_runs **SET NULL**, `fk_pm_visits_job`→jobs **SET NULL** (the spawned job is independent — deleting it nulls the link, never deletes the occurrence).
- **`pm_assets`** (lightweight, B-14.5) — `id, tenant_id, client_location_id, name, asset_type varchar(128) (null), notes text (null), created_at`. FKs: `fk_pm_assets_tenant`→tenants CASCADE, `fk_pm_assets_location`→client_locations CASCADE.

## Migration 0038 — checklist (template / instance, F6)
- **`pm_visit_checklists`** (template) — `id, tenant_id, pm_program_id, item_text varchar(512) NOT NULL, sort_order int default 0, is_active bool default true, created_at`. FKs: `fk_pm_checklists_tenant`→tenants CASCADE, `fk_pm_checklists_program`→pm_programs CASCADE.
- **`pm_visit_results`** (instance) — `id, tenant_id, pm_visit_id, pm_visit_checklist_id, result enum('done','skipped','na') (null = not yet recorded), notes text (null), completed_at datetime (null), created_at`. FKs: `fk_pm_results_tenant`→tenants CASCADE, `fk_pm_results_visit`→pm_visits CASCADE, `fk_pm_results_checklist`→pm_visit_checklists CASCADE.

## Conventions
- All FK columns get explicit FK-backing indexes.
- Enum values: `pm_schedules.frequency` (day/week/month), `pm_visits.generation_status` (generated/skipped/pending_review), `pm_visit_results.result` (done/skipped/na).
- `jobs.source_type` already carried `preventative_maintenance` (no enum migration needed).
- **`pm_schedules` naming care** — distinct from the dispatch adjective "scheduled" (`scheduled_start_at`/`scheduled_end_at`); recurrence cols are `frequency`/`interval_count`/`next_due_at`/`last_generated_at`.
