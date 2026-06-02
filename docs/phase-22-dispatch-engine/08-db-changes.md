# Phase 22 — DB Changes

## ONE migration (0045) — two new tables, fully additive.

`location_preferred_vendors` and `location_blocked_vendors` are created. **No `ALTER` on any existing table**, no drops, no changes to existing columns. Confirmed sandbox + prod:
- Live table count: **118** (was 116 — two new tables).
- Latest migration: **0045** (`0045_broken_hulk.sql`). Migration ledger at **0045**.

The **fourth v2 migration** (after 0042 in Phase 19, 0043 in Phase 20, 0044 in Phase 21).

## New table — `location_preferred_vendors`

"This location's preferred vendor for this trade", ranked.

| Column | Type | Null | Default | Purpose |
|---|---|---|---|---|
| `id` | varchar(36) | NO | uuidv7 | PK |
| `tenant_id` | varchar(36) | NO | — | owning tenant |
| `client_location_id` | varchar(36) | NO | — | the location this preference applies to |
| `trade_id` | varchar(36) | NO | — | the trade (preference IS per-trade) |
| `vendor_id` | varchar(36) | NO | — | the preferred vendor |
| `priority` | int | NO | — | **lower = stronger** (1 = primary); ties allowed |
| `notes` | varchar(500) | YES | NULL | optional "why preferred" |
| `status` | enum(active/inactive/archived) | NO | active | soft-delete state |
| `created_by_user_id` | varchar(36) | YES | NULL | operator who set it (FK set null) |
| `created_at` / `updated_at` | timestamp | NO | now / on-update | — |

**Foreign keys (pre-named where the auto-name would exceed 64 chars, WP-12.2):**
- `location_preferred_vendors_tenant_id_tenants_id_fk` → `tenants.id` **CASCADE**
- `location_preferred_vendors_trade_id_trades_id_fk` → `trades.id` **RESTRICT**
- `location_preferred_vendors_vendor_id_vendors_id_fk` → `vendors.id` **RESTRICT**
- `location_preferred_vendors_created_by_user_id_users_id_fk` → `users.id` **SET NULL**
- `lpv_location_fk` → `client_locations.id` **CASCADE** (explicit short name)

**Indexes:** `lpv_location_trade_vendor_unique` **UNIQUE**(`client_location_id`, `trade_id`, `vendor_id`) — one preference per triple, and the backstop for the reactivate-on-readd race (D-22.4); `lpv_lookup_idx`(`tenant_id`, `client_location_id`, `trade_id`) — the matcher's preference-rank lookup.

## New table — `location_blocked_vendors`

The per-location vendor blocklist — a **company** exclusion (no trade), scoped per-location or client-wide.

| Column | Type | Null | Default | Purpose |
|---|---|---|---|---|
| `id` | varchar(36) | NO | uuidv7 | PK |
| `tenant_id` | varchar(36) | NO | — | owning tenant |
| `client_id` | varchar(36) | NO | — | **always set** — the scoping anchor |
| `client_location_id` | varchar(36) | **YES** | NULL | **NULL = client-wide ban**; set = this-location-only |
| `vendor_id` | varchar(36) | NO | — | the barred vendor |
| `reason` | varchar(500) | YES | NULL | "why barred" — audit |
| `status` | enum(active/inactive/archived) | NO | active | soft-delete state |
| `created_by_user_id` | varchar(36) | YES | NULL | **who barred** (FK set null) |
| `created_at` / `updated_at` | timestamp | NO | now / on-update | when (audit) |

**No `trade_id`** — a block bars the vendor regardless of trade (D-22.3).

**Foreign keys:**
- `location_blocked_vendors_tenant_id_tenants_id_fk` → `tenants.id` **CASCADE**
- `location_blocked_vendors_client_id_clients_id_fk` → `clients.id` **CASCADE**
- `location_blocked_vendors_vendor_id_vendors_id_fk` → `vendors.id` **RESTRICT**
- `location_blocked_vendors_created_by_user_id_users_id_fk` → `users.id` **SET NULL**
- `lbv_location_fk` → `client_locations.id` **CASCADE** (explicit short name; nullable column)

**Indexes:** `lbv_location_vendor_idx`(`tenant_id`, `client_location_id`, `vendor_id`) and `lbv_client_vendor_idx`(`tenant_id`, `client_id`, `vendor_id`) — the matcher's per-location and client-wide blocklist lookups. **No UNIQUE** — re-block-after-unblock inserts a fresh active row and archived rows accumulate (the `client_nte_rules` soft-delete model; D-22.4).

## A non-migration code change — `createDispatch` actor type widened

`CreateDispatchInput.createdByUserId` was widened **`string` → `string | null`** so the auto-picker can write a **NULL system actor**. This is a **type change only** — not a migration: all three write targets (`job_vendor_assignments.created_by_user_id`, `job_vendor_assignment_status_history.changed_by_user_id`, `audit_logs.user_id`) were already nullable / SET NULL. Manual (human-operator) callers are unaffected.

## Existing tables unaffected

No existing table was altered. The matcher reads the two new tables via additive `NOT EXISTS` / subquery; existing dispatch, vendor, client, and job behavior is unchanged for everything that doesn't touch a preferred/blocked row.

## Migration cadence (followed)

`db:generate` → identifier guard (all ≤64 chars) → sandbox apply (env-override) → `-E` contract-verify (two tables; columns incl. `trade_id` on preferred / **absent** on block, nullable `client_location_id` on block; FK matrix 5/5 incl. no trades FK on block; UNIQUE + indexes; table count 118) → **prod-confirm gate** → prod apply → contract-verify on prod → commit the migration unit (`1eb0e97`). Each gated; sandbox and prod both carry both tables; git schema-source matches live.
