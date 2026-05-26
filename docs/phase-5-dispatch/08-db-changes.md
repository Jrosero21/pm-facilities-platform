# Phase 5 — Database Changes

## Summary
One migration adds **7 tables**. All InnoDB / utf8mb4 / utf8mb4_unicode_ci, app-generated UUID v7 PKs. All tenant-scoped **except `dispatch_assignment_statuses`** (GLOBAL, no `tenant_id`).

- **`0009_brief_wallflower.sql`** — `dispatch_assignment_statuses` (global ref) + 6 operational: `job_vendor_assignments`, `job_vendor_assignment_status_history`, `dispatch_messages`, `vendor_eta_confirmations`, `vendor_check_ins`, `vendor_check_outs`.

The roadmap §8 "core tables" lists the 6 operational tables; the **7th is the global reference lookup** `dispatch_assignment_statuses` (reference data, the same way `job_statuses` supported Phase 4 — D-5.7). So Phase 5 creates **6 operational + 1 reference**.

Total recorded migrations after Phase 5: **10** (`0000`–`0009`).

## Tables

### dispatch_assignment_statuses (GLOBAL — no tenant_id)
`id` PK · `name` · `description` (null) · `code` (uppercase) · `category` enum(draft,pending,active,completed,cancelled) · `sort_order` int (10-step, D-5.17) · `is_terminal` bool · `status` enum(active,inactive,archived) · `created_by_user_id` → users (set null) · timestamps. **No `tenant_id`, no tenants FK.** Unique `(code)`, `(name)`. Index: `status`. Mirrors `job_statuses` (D-5.7).

### job_vendor_assignments — the dispatch spine
`id` PK · `tenant_id` → tenants (cascade) · `job_id` → jobs (**cascade**) · `vendor_id` → vendors (**RESTRICT**) · `vendor_location_id` → vendor_locations (**RESTRICT**, **null** = vendor-wide) · `vendor_contact_id` → vendor_contacts (**set null**, null) · `current_status_id` → dispatch_assignment_statuses (**RESTRICT**) · `agreed_nte_amount` decimal(12,2) (null) · `scheduled_start_at`/`scheduled_end_at` **datetime** (null) · `dispatch_scope` text (null, immutable snapshot) · `matched_trade_id` → trades (**RESTRICT**, NN — snapshot) · `matched_trade_was_primary` bool NN · `tightest_geo_at_dispatch` enum(postal_code,city,state,national) NN · `matched_geo_types_at_dispatch` **json** NN · `compliance_status_at_dispatch` enum(ok,no_data,expired,non_compliant) NN · `chosen_branch_covered_trade` bool (null) · `sent_at` **datetime** (null) · `created_by_user_id` (set null) · `created_at`/`updated_at` **timestamp**.
**No `(job_id, vendor_id)` uniqueness** (D-5.26 — many dispatches per job). Index: `(tenant_id, job_id)`, `(tenant_id, vendor_id)`, `(tenant_id, current_status_id)`.

### job_vendor_assignment_status_history — append-only
`id` PK · `tenant_id` (cascade) · `assignment_id` → job_vendor_assignments (**cascade**) · `from_status_id` → dispatch_assignment_statuses (**RESTRICT**, null) · `to_status_id` → same (**RESTRICT**, NN) · `changed_by_user_id` (set null) · `note` varchar(500) (null) · `created_at`. **No `updated_at`.** Index `(tenant_id, assignment_id)`. Mirrors `job_status_history`.

### dispatch_messages — content + metadata only (NO recipient/delivery fields)
`id` PK · `tenant_id` (cascade) · `assignment_id` → job_vendor_assignments (**cascade**) · `direction` enum(outbound,inbound) default `outbound` · `message_type` varchar(64) · `subject` (null) · `body` text NN · `visibility` enum(internal_only,vendor_visible,client_visible,client_and_vendor_visible,requires_review) default `internal_only` · `sent_by_user_id` (set null) · `status` enum · `created_at`/`updated_at`. Index `(assignment_id, created_at)`, `(tenant_id, assignment_id)`. Recipient routing + `delivered_at`/`read_at` are **Phase 6** (D-5.18/D-5.19).

### vendor_eta_confirmations — append-only ETA log
`id` PK · `tenant_id` (cascade) · `assignment_id` → job_vendor_assignments (**cascade**) · `eta_start_at` **datetime** NN · `eta_end_at` (null) · `note` varchar(500) (null) · `confirmed_by_user_id` (set null) · `created_at`. **No `updated_at`.** Index `(assignment_id, created_at)` (latest = current ETA), `(tenant_id, assignment_id)`.

### vendor_check_ins / vendor_check_outs — identical v1 shape
`id` PK · `tenant_id` (cascade) · `assignment_id` → job_vendor_assignments (**cascade**) · `occurred_at` **datetime** NN · `note` varchar(500) (null) · `recorded_by_user_id` (set null) · `created_at`. **No `updated_at`.** Index `(assignment_id, occurred_at)`, `(tenant_id, assignment_id)`. Two tables by design (D-5.21); divergent check-out columns (work_summary/signature/parts_used) added later, not preemptively.

## FK delete rules
- **CASCADE:** every child `tenant_id` → tenants; every sibling `assignment_id` → `job_vendor_assignments` (the 5 child tables: status_history, dispatch_messages, eta_confirmations, check_ins, check_outs); `job_vendor_assignments.job_id` → jobs.
- **RESTRICT:** `job_vendor_assignments` → vendors / vendor_locations / dispatch_assignment_statuses / trades; the status-history `from_status_id`/`to_status_id` → dispatch_assignment_statuses. (Protect referenced data; reference data is retired via status.)
- **SET NULL:** every `*_user_id` → users; `job_vendor_assignments.vendor_contact_id` → vendor_contacts (contact management never blocked by a dispatch).

## Identifier names (short explicit FK names)
The dispatch table names are long enough that Drizzle's auto-generated `{table}_{col}_{ref}_{refcol}_fk` constraint names would exceed MySQL's **64-char limit** (e.g. a `job_vendor_assignments → dispatch_assignment_statuses` FK would be ~75 chars). So the 6 operational tables carry **explicit short FK names** by module prefix: `jva_` (assignments), `jvash_` (assignment status history), `dm_` (dispatch_messages), `vec_` (eta_confirmations), `vci_`/`vco_` (check-ins/outs) — e.g. `jva_status_fk`, `jvash_assignment_fk`. Index names use the same prefixes. The lone reference table's single auto-named FK (`dispatch_assignment_statuses_created_by_user_id_users_id_fk`, 59 chars) is under the limit and left as-is. The `db:generate` 64-char guard confirmed all identifiers ≤ 64.

## JSON-as-longtext on MariaDB
`matched_geo_types_at_dispatch` is declared `json()` in Drizzle. On this **MariaDB 11.4** server, `JSON` is an alias for `LONGTEXT` + an auto-added `CHECK (json_valid(...))`. Behavior is fully JSON: insert validation, and `JSON_VALID`/`JSON_CONTAINS`/`JSON_EXTRACT` queries all work. **`information_schema.COLUMNS.DATA_TYPE` reports `longtext`** (never `json`); `SHOW CREATE TABLE` shows `longtext ... CHECK (json_valid(\`matched_geo_types_at_dispatch\`))`. Phase 4's `job_events.metadata` is stored the same way (verified during 5b). When verifying a JSON column post-migrate, expect `longtext` + a `json_valid` CHECK, not `DATA_TYPE='json'`.

## Seed data
`pnpm db:seed:dispatch-reference` seeds the **9 global** `dispatch_assignment_statuses` (once across the DB; idempotent on `code`; no audit rows). The Job #2 worked-example dispatch (Sunbelt HVAC, SENT, vendor-wide) + Job #2 itself were created through the data layer during 5c smoke verification and left in place (`10-known-limitations.md` L-5.12).

## Verification
```bash
mysql ... -e "SELECT COUNT(*) FROM __drizzle_migrations;"                                  # 10
mysql ... -e "SELECT code, category, is_terminal, sort_order FROM dispatch_assignment_statuses ORDER BY sort_order;"  # 9 rows
mysql ... -e "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='jonnyrosero_pm' AND TABLE_NAME='dispatch_assignment_statuses' AND COLUMN_NAME='tenant_id';"  # empty = global, correct
mysql ... -e "SHOW CREATE TABLE job_vendor_assignments\G" | grep matched_geo_types          # longtext + CHECK(json_valid(...))
# FK delete rules: 5 child→job_vendor_assignments CASCADE; job_vendor_assignments→ref tables RESTRICT (SOP-5.C)
```

## Forward pointers
- **Phase 6** extends `dispatch_messages` with the delivery layer (recipient routing, channel fields, `delivered_at`/`read_at`), and builds the ETA / check-in / check-out / messages UI on the schema laid here.
- **Phase 8** change orders own edits to a *sent* dispatch's scope/NTE (the snapshot is immutable in Phase 5).
- **Phase 9** analytics may add indexes (e.g. on `sent_at`, status, vendor) and compute performance scores; may reconsider the matcher's correlated subqueries vs a JOIN-GROUP-BY rewrite.
