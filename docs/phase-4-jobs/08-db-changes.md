# Phase 4 — Database Changes

## Summary
Two migrations add 11 tables. All InnoDB / utf8mb4 / utf8mb4_unicode_ci, app-generated UUID v7 PKs. All tenant-scoped **except `job_statuses`** (global, no `tenant_id`).

- **`0007_absent_puma.sql`** — `priorities` (tenant-scoped), `job_statuses` (global).
- **`0008_mature_guardsmen.sql`** — `jobs`, `job_contacts`, `job_status_history`, `job_priority_history`, `job_trade_history`, `job_notes`, `job_attachments`, `job_events`, `tenant_job_sequences`.

Total recorded migrations after Phase 4: **9** (`0000`–`0008`).

## Tables

### priorities (0007) — TENANT-scoped
`id` PK · `tenant_id` → tenants (cascade) · `name` · `description` varchar(255) (null) · `code` (uppercase) · `rank` int · `status` enum(active,inactive,archived) · `created_by_user_id` → users (set null) · timestamps. Unique `(tenant_id, code)`, `(tenant_id, name)`. Index: `tenant_id`, `status`.

### job_statuses (0007) — GLOBAL (no tenant_id)
`id` PK · `name` · `description` (null) · `code` (uppercase) · `category` enum(open,in_progress,on_hold,completed,cancelled) · `sort_order` int · `is_terminal` bool · `status` enum · `created_by_user_id` (set null) · timestamps. **No `tenant_id`, no tenants FK.** Unique `(code)`, `(name)`. Index: `status`.

### jobs (0008)
`id` PK · `tenant_id` → tenants (cascade) · `job_number` int unsigned · `client_id` → clients (**RESTRICT**) · `client_location_id` → client_locations (**RESTRICT**) · `primary_trade_id` → trades (**RESTRICT**, null) · `priority_id` → priorities (**RESTRICT**, null) · `current_status_id` → job_statuses (**RESTRICT**) · `source_type` enum(8) default `manual` · `source_external_id` (null, **no unique index** — D-4.13) · `problem_description` text · `scope_of_work`/`generated_scope_of_work`/`approved_scope_of_work` text (null) · `scope_generation_status` varchar(32) default `not_started` · `not_to_exceed_amount` decimal(12,2) (null) · `scheduled_start_at`/`scheduled_end_at`/`due_at`/`completed_at`/`closed_at` **datetime** (null) · `is_archived` bool default false · `created_by_user_id` (set null) · `created_at`/`updated_at` **timestamp**.
Unique `(tenant_id, job_number)`. Index: `(tenant_id, current_status_id)`, `(tenant_id, client_id)`, `(tenant_id, client_location_id)`, `(tenant_id, primary_trade_id)`, `(tenant_id, priority_id)`, `(tenant_id, created_at)`.

### job_contacts (0008)
Mirrors vendor/client contacts: `id` PK · `tenant_id` (cascade) · `job_id` → jobs (cascade) · `name` · `title`/`email`/`phone` (null) · `is_primary` bool · `notes` text (null) · `status` enum · `created_by_user_id` (set null) · timestamps. Index `(tenant_id, job_id)`.

### job_status_history / job_priority_history / job_trade_history (0008) — append-only
Identical shape (only the reference FK differs): `id` PK · `tenant_id` (cascade) · `job_id` → jobs (cascade) · `from_<x>_id` → ref (**RESTRICT**, null) · `to_<x>_id` → ref (**RESTRICT**, NN) · `changed_by_user_id` (set null) · `note` varchar(500) (null) · `created_at`. **No `updated_at`** (immutable). `<x>` = status → job_statuses, priority → priorities, trade → trades. Index `(tenant_id, job_id)`.

### job_notes (0008)
`id` PK · `tenant_id` (cascade) · `job_id` → jobs (cascade) · `body` text · `visibility` enum(internal_only,vendor_visible,client_visible,client_and_vendor_visible,requires_review) default `internal_only` · `status` enum · `created_by_user_id` (set null) · timestamps. Index `(tenant_id, job_id)`.

### job_attachments (0008) — schema-only
`id` PK · `tenant_id` (cascade) · `job_id` → jobs (cascade) · `title` · `attachment_type` enum(photo,document,signature,invoice,quote,other) default `other` · `file_url` varchar(1024) (null) · `file_size_bytes` bigint (null) · `file_mime_type` varchar(127) (null) · `visibility` enum (default internal_only) · `uploaded_by_user_id` (set null) · `status` enum · timestamps. Index `(tenant_id, job_id)`. No upload UI/data layer in Phase 4.

### job_events (0008) — append-only
`id` PK · `tenant_id` (cascade) · `job_id` → jobs (cascade) · `event_type` varchar(64) · `actor_user_id` → users (set null, null) · `summary` varchar(500) · `metadata` json (null) · `created_at`. **No `updated_at`**. Index `(job_id, created_at)` (timeline order), `(tenant_id, job_id)`.

### tenant_job_sequences (0008)
`tenant_id` PK → tenants (cascade) · `next_number` int unsigned default 1 · `updated_at`. One row per tenant; the `job_number` counter.

## FK delete rules
- **RESTRICT:** `jobs` → clients / client_locations / trades / priorities / job_statuses; the three history tables' `from_*_id` / `to_*_id` → their reference tables. (Protect referenced data from hard-delete; reference data is retired via status.)
- **CASCADE:** every child `tenant_id` → tenants; every sibling `job_id` → jobs (7 tables); `tenant_job_sequences.tenant_id` → tenants.
- **SET NULL:** every `*_user_id` → users.

## Identifier names
All FK/index names auto-generated and within the 64-char limit (longest: `job_priority_history_from_priority_id_priorities_id_fk`, 54). No explicit short names needed (unlike Phase 3's coverage tables). The `db:generate` guard confirmed clean.

## Seed data
`pnpm db:seed:job-reference` seeds, for the Demo Aggregator: 5 tenant-scoped priorities (with descriptions), 8 global job_statuses (with descriptions, once across the DB), and one `tenant_job_sequences` row (next_number=1). Idempotent; no audit rows. The Job #1 worked-example data (Apple plumbing job + contact + note) was created through the data layer during smoke verification (`10-known-limitations.md` L-4.12).

## Verification
```bash
mysql ... -e "SELECT COUNT(*) FROM __drizzle_migrations;"   # 9
# 11 Phase 4 tables (NOTE: the job_% LIKE pattern also matches job_statuses, so add priorities/jobs explicitly or expect job_statuses in the match):
mysql ... -e "SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA='jonnyrosero_pm' AND TABLE_NAME IN ('priorities','job_statuses','jobs','job_contacts','job_status_history','job_priority_history','job_trade_history','job_notes','job_attachments','job_events','tenant_job_sequences');"
mysql ... -e "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='jonnyrosero_pm' AND TABLE_NAME='job_statuses' AND COLUMN_NAME='tenant_id';"  # empty = global, correct
```

## Forward pointers
- Phase 5 (dispatch) consumes `jobs` (location + trade + priority) to match capable/in-area vendors; adds `job_vendor_assignments` etc.; writes status transitions through the same dual-write pattern (history + event + audit).
- Phase 7 populates the scope columns; Phase 8 the billing/`closed_at` flow.
- `external_priority_mappings` / `external_status_mappings` (Phase 12) key on `(tenant_id, external_system_id, external_value)` (D-4.3).
