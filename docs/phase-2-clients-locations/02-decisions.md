# Phase 2 — Decisions

Decisions locked in during Phase 2. Builds on Phase 0 and Phase 1 decisions. Each notes the limitation it creates where relevant (cross-linked to `10-known-limitations.md`).

## D-2.1 — Client identity: name + optional client_code, unique per tenant
- **Why:** A human-readable name is required; an optional short code (e.g. `APPLE`) helps ops shorthand and future external-portal mapping. Both scoped per tenant so different tenants can reuse names/codes.
- **How to apply:** Unique indexes on `(tenant_id, name)` and `(tenant_id, client_code)`. `client_code` is nullable — MySQL treats NULLs as distinct, so many code-less clients are allowed per tenant. Uniqueness is collation-driven (case- and accent-insensitive) — see `10-known-limitations.md` L-2.5.

## D-2.2 — Soft delete via status enum; no hard delete
- **Why:** Jobs (Phase 4+) will reference clients and locations. Physically deleting them would orphan future references and destroy history. Auditability over destruction (Phase 0 D-0.6).
- **How to apply:** `clients`, `client_locations`, `client_contacts`, `client_location_contacts`, `client_billing_rules` all carry `status ∈ {active, inactive, archived}`. Lists filter out `archived`. There is no hard-delete path. FK cascade behavior is documented in `06-business-rules.md` R-2.3.

## D-2.3 — Audit create mutations now (don't wait for Phase 4 history tables)
- **Why:** Cheap with the existing `writeAuditLog` helper, and consistent with analytics-from-day-1 (Phase 0 §2.7). Full per-entity history TABLES still start at Phase 4 (jobs).
- **How to apply:** Every create writes an `audit_logs` row using the dot-namespaced naming convention (`06-business-rules.md` R-2.4): `client.created`, `client_location.created`, `client_contact.created`, `client_location_contact.created`.

## D-2.4 — Structured address with nullable lat/lng
- **Why:** Phase 3 vendor coverage and Phase 5 dispatch need geography. Structured columns (not freeform) make filtering/geocoding possible later.
- **How to apply:** `client_locations` has `address_line1/line2/city/state_province/postal_code/country` (country default `US`, uppercased on write), plus nullable `latitude`/`longitude` (`decimal(10,7)`) reserved for future geocoding (unused in Phase 2 — `10-known-limitations.md` L-2.8).

## D-2.5 — Denormalize tenant_id onto every child table
- **Why:** Lets every query filter by `tenant_id` directly (no join through the parent), and guards against cross-tenant parent references. The single tenant-scoping pattern stays uniform across all tables.
- **How to apply:** `client_locations`, `client_contacts`, `client_location_contacts`, `client_location_hours`, `client_location_access_notes`, `client_billing_rules` all carry `tenant_id` even when it's derivable from the parent. App code keeps child `tenant_id` equal to the parent's (`06-business-rules.md` R-2.6).

## D-2.6 — Explicit short FK names on the client_location_* tables
- **Why:** Drizzle's auto-generated FK names (e.g. `client_location_access_notes_client_location_id_client_locations_id_fk`, 70 chars) exceed MySQL's 64-char identifier limit and silently abort a migration mid-apply. We hit this on the first `0002` apply.
- **How to apply:** The `client_location_id` FKs on `client_location_contacts/hours/access_notes` use explicit short names (`cl_contacts_location_fk`, `cl_hours_location_fk`, `cl_access_notes_location_fk`). A `db:generate` guard now blocks any over-long identifier — see D-2.7 and `10-known-limitations.md` L-2.4.

## D-2.7 — Migration identifier guard in db:generate
- **Why:** Make the 64-char failure mode loud at generate time instead of silent at apply time.
- **How to apply:** `scripts/check-migration-identifiers.mjs` runs after `drizzle-kit generate` and the InnoDB fix; it scans every backtick identifier (table/column/index/constraint) and exits non-zero with a classified fix hint if any exceeds 64 chars.

## D-2.8 — CRUD scope is create + read only; edit/archive deferred
- **Why:** The phase's acceptance criteria are about creating and viewing clients/locations. Edit/archive UI is additional surface that isn't required to unblock later phases.
- **How to apply:** Screens support create + list + detail only. No edit/archive/delete UI. The `status` column already supports archival when a UI is built (`10-known-limitations.md` L-2.1).

## D-2.9 — Detail tables hours/access_notes/billing_rules are schema-only
- **Why:** They belong to the Phase 2 data domain (the roadmap lists them as Phase 2 core tables), but their consumers live in later phases. Building UI now would be building ahead of need.
- **How to apply:** Schema created and tenant-scoped; no data layer or UI yet. Future consumers: hours → scheduling/SLA, access_notes → dispatch (Phase 5), billing_rules → billing (Phase 8). See `06-business-rules.md` R-2.5 and `10-known-limitations.md` L-2.2.
