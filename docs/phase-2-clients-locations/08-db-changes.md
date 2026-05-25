# Phase 2 — Database Changes

## Summary
Two migrations add the 7 Phase 2 tables. All InnoDB / utf8mb4 / utf8mb4_unicode_ci, all tenant-scoped, app-generated UUID v7 PKs.

- **`0001_silky_rafael_vega.sql`** — `clients`, `client_locations`.
- **`0002_blue_steel_serpent.sql`** — `client_contacts`, `client_location_contacts`, `client_location_hours`, `client_location_access_notes`, `client_billing_rules`.

(`0002` was regenerated after an over-long FK name aborted the first attempt — see `10-known-limitations.md` L-2.4.)

## Tables

### clients (0001)
`id` PK · `tenant_id` → tenants (cascade) · `name` · `client_code` (null) · `status` enum(active,inactive,archived) default active · `created_by_user_id` → users (set null) · `created_at` · `updated_at`.
Unique: `(tenant_id, name)`, `(tenant_id, client_code)`. Index: `tenant_id`, `status`.

### client_locations (0001)
`id` PK · `tenant_id` → tenants (cascade) · `client_id` → clients (cascade) · `name` · `location_code` (null) · `status` · `address_line1` · `address_line2` (null) · `city` · `state_province` · `postal_code` · `country` default `US` · `latitude`/`longitude` decimal(10,7) (null) · `created_by_user_id` → users (set null) · timestamps.
Unique: `(client_id, location_code)`. Index: `tenant_id`, `client_id`, `status`.

### client_contacts (0002)
`id` PK · `tenant_id` → tenants (cascade) · `client_id` → clients (cascade) · `name` · `title`/`email`/`phone` (null) · `is_primary` bool · `notes` · `status` · `created_by_user_id` → users (set null) · timestamps. Index: `tenant_id`, `client_id`.

### client_location_contacts (0002)
Same columns as `client_contacts`, but `client_location_id` → client_locations (cascade, FK name `cl_contacts_location_fk`). Index: `tenant_id`, `client_location_id`.

### client_location_hours (0002) — schema-only
`id` PK · `tenant_id` (cascade) · `client_location_id` → client_locations (cascade, FK `cl_hours_location_fk`) · `day_of_week` enum(sun..sat) · `open_time`/`close_time` time (null) · `is_closed` bool · `notes` · timestamps. Index: `tenant_id`, `client_location_id`.

### client_location_access_notes (0002) — schema-only
`id` PK · `tenant_id` (cascade) · `client_location_id` → client_locations (cascade, FK `cl_access_notes_location_fk`) · `title` (null) · `body` · `created_by_user_id` (set null) · timestamps. Index: `tenant_id`, `client_location_id`.

### client_billing_rules (0002) — schema-only
`id` PK · `tenant_id` (cascade) · `client_id` → clients (cascade) · `name` · `markup_percent` decimal(6,3) (null) · `payment_terms_days` int (null) · `notes` · `is_default` bool · `status` · `created_by_user_id` (set null) · timestamps. Index: `tenant_id`, `client_id`.

## Explicit FK names
The `client_location_id` FKs on `client_location_contacts/hours/access_notes` use explicit short names (`cl_*_location_fk`) because the auto-generated names exceeded MySQL's 64-char limit. All other FKs use Drizzle's default naming (≤ 59 chars).

## Seed data
None added in Phase 2. The Phase 1 seed (roles, Demo Aggregator tenant, super_admin) is unchanged. Phase 2 data (e.g. the Apple client) is created through the UI.

## Verification
```bash
mysql ... -e "SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA='jonnyrosero_pm' AND TABLE_NAME LIKE 'client%';"
# expect 7 client* tables, all InnoDB
mysql ... -e "SELECT COUNT(*) FROM __drizzle_migrations;"   # expect 3
```

## Forward pointers
- Phase 3 (vendors) and Phase 4 (jobs) reference clients/locations by id. Jobs will link `client_id` + `client_location_id`.
