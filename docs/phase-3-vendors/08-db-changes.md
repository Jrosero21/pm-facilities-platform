# Phase 3 — Database Changes

## Summary
Four migrations add the global `trades` table and the 9 core vendor tables (10 total). All InnoDB / utf8mb4 / utf8mb4_unicode_ci, app-generated UUID v7 PKs. All vendor tables are tenant-scoped; **`trades` is global (no `tenant_id`)**.

- **`0003_reflective_oracle.sql`** — `trades` (global), `vendors`, `vendor_contacts`, `vendor_locations`.
- **`0004_rapid_tomorrow_man.sql`** — drop unique `vendors_tenant_name_unique`; add non-unique `vendors_tenant_name_idx` (vendor name is not unique per tenant — D-3.5).
- **`0005_empty_captain_cross.sql`** — `vendor_trade_coverage`, `vendor_service_areas`.
- **`0006_thick_darwin.sql`** — `vendor_rates`, `vendor_documents`, `vendor_compliance`, `vendor_performance_scores` (schema-only).

Total recorded migrations after Phase 3: **7** (`0000`–`0006`).

## Tables

### trades (0003) — GLOBAL reference (no tenant_id)
`id` PK · `name` (unique) · `code` (unique, uppercase) · `status` enum(active,inactive,archived) default active · timestamps. **No `tenant_id`, no FK to tenants** — a deliberate exception (D-3.1 / R-3.4). Seeded via `db/seeds/trades.ts`.

### vendors (0003)
`id` PK · `tenant_id` → tenants (cascade) · `name` · `legal_name` (null) · `vendor_code` (null, uppercased) · `vendor_type` enum(local,regional,national) default local · `status` · `main_phone`/`main_email`/`website`/`tax_id` (null) · `notes` · `created_by_user_id` → users (set null) · timestamps.
Unique: `(tenant_id, vendor_code)`. Index: `(tenant_id, name)` **non-unique** (0004), `tenant_id`, `status`, `vendor_type`.

### vendor_contacts (0003)
Mirrors `client_contacts`: `id` PK · `tenant_id` (cascade) · `vendor_id` → vendors (cascade) · `name` · `title`/`email`/`phone` (null) · `is_primary` bool · `notes` · `status` · `created_by_user_id` (set null) · timestamps. Index: `tenant_id`, `vendor_id`.

### vendor_locations (0003)
Mirrors `client_locations`: `id` PK · `tenant_id` (cascade) · `vendor_id` → vendors (cascade) · `name` · `location_code` (null, uppercased) · `status` · address (`address_line1`, `line2` null, `city`, `state_province`, `postal_code`, `country` default `US`) · `latitude`/`longitude` decimal(10,7) (null, unused) · `created_by_user_id` (set null) · timestamps. Unique: `(vendor_id, location_code)`. Index: `tenant_id`, `vendor_id`, `status`.

### vendor_trade_coverage (0005)
`id` PK · `tenant_id` (cascade) · `vendor_id` → vendors (cascade) · `trade_id` → trades (**RESTRICT**) · `vendor_location_id` → vendor_locations (cascade, FK `vtc_location_fk`, null = vendor-wide) · `is_primary` bool · `status` · `created_by_user_id` (set null) · timestamps.
Unique: `(vendor_id, trade_id, vendor_location_id)`. Index: `(tenant_id, vendor_id)`.

### vendor_service_areas (0005)
`id` PK · `tenant_id` (cascade) · `vendor_id` → vendors (cascade) · `vendor_location_id` → vendor_locations (cascade, FK `vsa_location_fk`, null = vendor-wide) · `area_type` enum(radius,postal_code,city,county,state,national) · `area_label` varchar(120) (null) · `center_latitude`/`center_longitude` decimal(10,7) (null) · `radius_miles` decimal(6,2) (null) · `postal_code`/`city`/`county_name`/`state_code` (null) · `country_code` default `US` · `status` · `created_by_user_id` (set null) · timestamps.
Index: `(tenant_id, vendor_id)`; **Phase 5 dispatch composites** `(tenant_id, area_type, postal_code)`, `(tenant_id, area_type, state_code)`, `(tenant_id, area_type, city, state_code)`. **`radius` is intentionally unindexed** (D-3.2 / L-3.6). All value columns nullable (discriminator → required-columns is app-enforced — R-3.7).

### vendor_rates (0006) — schema-only
`id` PK · `tenant_id` (cascade) · `vendor_id` (cascade) · `trade_id` → trades (**RESTRICT**, null = general) · `vendor_location_id` (cascade, null = vendor-wide) · `rate_type` enum(hourly,flat,trip_charge,per_unit,emergency,after_hours) · `amount` decimal(12,2) · `currency` default `USD` · `unit` (null; only for per_unit) · `effective_date`/`expiry_date` (null) · `notes` · `status` · `created_by_user_id` (set null) · timestamps. Index: `(tenant_id, vendor_id)`.

### vendor_documents (0006) — schema-only
`id` PK · `tenant_id` (cascade) · `vendor_id` (cascade) · `vendor_location_id` (cascade, null) · `document_type` enum(insurance,w9,license,certification,agreement,other) · `title` · `file_url` varchar(1024) (null) · `file_size_bytes` bigint (null) · `file_mime_type` varchar(127) (null) · `issued_date`/`expiry_date` (null) · `notes` · `status` · `created_by_user_id` (set null) · timestamps. Index: `(tenant_id, vendor_id)`. **No `expiry_date` index** (deferred — D-3.11).

### vendor_compliance (0006) — schema-only
`id` PK · `tenant_id` (cascade) · `vendor_id` (cascade) · `requirement_type` enum(general_liability,workers_comp,auto_liability,umbrella,background_check,license,certification,other) · `coverage_amount` decimal(14,2) (null) · `carrier`/`policy_number` (null) · `effective_date`/`expiry_date` (null) · `compliance_status` enum(pending,compliant,non_compliant,expired) default pending · `notes` · `status` enum(active,inactive,archived) default active · `created_by_user_id` (set null) · timestamps. **Two distinct status fields** (R-3.11). Index: `(tenant_id, vendor_id)`. **No `expiry_date` index** (D-3.11).

### vendor_performance_scores (0006) — schema-only
`id` PK · `tenant_id` (cascade) · `vendor_id` (cascade) · `trade_id` → trades (**RESTRICT**, null = overall) · `period_start`/`period_end` (null) · `jobs_completed`/`jobs_on_time` int (null) · `on_time_rate` decimal(5,2) (null) · `avg_rating` decimal(3,2) (null) · `score` decimal(6,2) (null) · `computed_at` timestamp (null) · `notes` · `status` · `created_by_user_id` (set null) · timestamps. Index: `(tenant_id, vendor_id)`.

## FK delete rules
- **RESTRICT (exception):** `trade_id` → trades on `vendor_trade_coverage`, `vendor_rates`, `vendor_performance_scores`. The project's only delete exception (D-3.9) — verified RESTRICT in the live DB.
- **cascade:** `tenant_id` → tenants, `vendor_id` → vendors, and the optional `vendor_location_id` → vendor_locations everywhere it appears.
- **set null:** `created_by_user_id` → users everywhere.

## Explicit FK names
The two `vendor_location_id` FKs on the coverage tables use explicit short names (`vtc_location_fk`, `vsa_location_fk`) because the auto-generated names neared the 64-char limit. All other FKs use Drizzle's default naming (≤ 58 chars; the identifier guard confirmed all ≤ 64).

## Cross-phase code change (no migration): entity-code normalization
The Phase 3 entity-code normalization (D-3.6) is **code-only, not a migration** — `clients.client_code`, `vendors.vendor_code`, and both `location_code` fields are uppercased in the data layer on insert. It is **insert-time only; existing rows are not backfilled.** No column/DDL change.

## Seed data
`db/seeds/trades.ts` seeds 15 global trades (idempotent on `code`, `pnpm db:seed:trades`). No audit rows. The Phase 1 seed (roles, Demo Aggregator tenant, super_admin) is unchanged. Phase 3 vendor data (Sunbelt HVAC etc.) was created during verification through the data layer (`10-known-limitations.md` L-3.12).

## Verification
```bash
mysql ... -e "SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA='jonnyrosero_pm' AND (TABLE_NAME LIKE 'vendor%' OR TABLE_NAME='trades');"  # 10 tables, InnoDB
mysql ... -e "SELECT COUNT(*) FROM __drizzle_migrations;"   # 7
mysql ... -e "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='jonnyrosero_pm' AND TABLE_NAME='trades' AND COLUMN_NAME='tenant_id';"  # empty = global, correct
```

## Forward pointers
- Phase 4 (jobs) references `primary_trade_id` → trades and will reuse the global trade taxonomy.
- Phase 5 (dispatch) consumes `vendor_service_areas` (cross-vendor match — D-3.12) and `vendor_compliance` (eligibility); will populate dispatch/assignment tables.
- Phase 8 (billing) consumes `vendor_rates`; Phase 9 (analytics) computes `vendor_performance_scores`.
