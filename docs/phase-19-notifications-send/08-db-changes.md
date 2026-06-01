# Phase 19 — DB Changes

## ONE migration (0042) — the first v2 migration. Additive columns only.

Phase 19 added **four additive columns, no new tables, no FK changes**. Empirically confirmed
(sandbox + prod):
- Live table count: **115** (unchanged from Phase 18 — additive columns don't change table count).
- Latest migration: **0042** (`0042_wealthy_sumo.sql`). Migration ledger at 43 rows.

This is the **first v2 migration** — Phase 18 was migration-free; Phase 19 needed provider-tracking
columns + the timezone seam.

## The 4 columns

| Table | Column | Type | Null | Default | Purpose |
|---|---|---|---|---|---|
| `communication_logs` | `provider_message_id` | varchar(255) | YES | NULL | the provider's message id on a successful send (durable "already sent" signal for §2.6) |
| `communication_logs` | `attempts` | int | NO | 0 | send-attempt counter (observability) |
| `communication_logs` | `last_error` | text | YES | NULL | the provider error on a failed send |
| `client_locations` | `timezone` | varchar(64) | YES | NULL | IANA tz seam for the business-hours SLA clock — **data-model only; NO Phase-19 logic consumes it** |

The generated `0042_wealthy_sumo.sql` is exactly four `ADD COLUMN` statements — no DROP, no table create,
no index, no FK.

## Migration cadence (followed)

`db:generate` → sandbox apply → `-E` contract-verify (4 columns, types/nullability/defaults; table count
115; no FK change) → **prod confirm gate** → prod apply → contract-verify on prod → commit (`a2b7b0c`).
Each gated. Both sandbox and prod carry the columns; git schema-source matches live.

## Reused substrate (no schema change)

| Concern | Tables (reused) | Origin |
|---|---|---|
| Delivery state machine + send tracking | `communication_logs` (delivery_status + the 3 new cols) | Phase 6 / 0042 |
| Send content source | `client_update_logs`, `outbound_messages` | Phase 6 |
| Send audit | `audit_logs` | Phase 0/6 |
| Exception detection | `job_vendor_assignments`, `dispatch_assignment_statuses`, `change_orders`, `jobs`, `clients`, `vendors` | Phases 4/5/8 |

## Note on `client_locations.timezone`

Added now as the **seam** for CF-19.1 (business-hours SLA clock). Nullable, no backfill, no consumer in
Phase 19. The 17a/roadmap-§6 "client_location_hours + timezones" invariant was half-satisfiable — hours
existed, timezones did not; this column closes the data-model gap so the clock logic can land later.
