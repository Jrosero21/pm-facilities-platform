# Phase 2 — Business Rules

Rules introduced in Phase 2, each with the reasoning behind it. Inherits Phase 0/1 rules (source-agnostic, server-side DB access, tenant-scoping, audited auth, super_admin bypass).

## R-2.1 — Clients, locations, and contacts are tenant-scoped
- Every Phase 2 row carries `tenant_id`, and every query filters by the active tenant's id.
- **Why:** Tenants must never see or touch each other's data. Denormalizing `tenant_id` onto child tables (rather than joining through the parent) keeps the scoping rule identical and one-line everywhere, and lets a child query be guarded without trusting a parent id from the URL.

## R-2.2 — Client name and code uniqueness is per-tenant and collation-driven
- `(tenant_id, name)` is unique; `(tenant_id, client_code)` is unique when the code is present (NULL codes are allowed and unlimited).
- Matching uses the DB collation `utf8mb4_unicode_ci`, which is **case- and accent-insensitive**: `Apple` == `apple`, `café` == `cafe`. So those are treated as duplicates within a tenant.
- This case/accent-insensitivity is **database-wide**, inherited from the Phase 1 collation choice (the DB was set to `utf8mb4` / `utf8mb4_unicode_ci` in Phase 1, see Phase 1 D-1.4), not a Phase 2 decision. It applies to every text comparison in every table unless a column overrides it with a `*_bin` collation. Phase 2 just relies on it for client name/code uniqueness.
- **Why:** Different tenants are independent namespaces, so uniqueness is scoped per tenant, not global. Case/accent-insensitivity is a deliberate consequence of the chosen collation — it prevents near-duplicate clients that differ only by capitalization. (Documented as behavior in `10-known-limitations.md` L-2.5.)

## R-2.3 — Soft delete only; FK cascade preserves integrity, not deletion
- No entity is hard-deleted via the app. `status ∈ {active, inactive, archived}`; lists show non-archived.
- **Cascade behavior (DB-level FKs):**
  - Deleting a **tenant** cascades to its clients, locations, and all contacts (`onDelete: cascade`) — a tenant teardown removes its whole subtree.
  - Deleting a **client** cascades to its `client_locations`, `client_contacts`, and `client_billing_rules`; deleting a **location** cascades to its `client_location_contacts/hours/access_notes`.
  - `created_by_user_id` is `onDelete: set null` everywhere — removing a user must not delete the records they created; it just unlinks authorship.
- **Why:** Cascade keeps the graph consistent *if* a parent is ever physically removed (e.g. tenant offboarding), but normal operations never delete — they archive. This protects future job references (Phase 4) and the audit trail from dangling or vanished rows.

## R-2.4 — Audit action naming convention: `<entity>.<verb>`
- Audit `action` values are dot-namespaced: `client.created`, `client_location.created`, `client_contact.created`, `client_location_contact.created`. Entity matches the table's singular concept; verb is past tense.
- `target_type` is the entity, `target_id` is the row id, `metadata` carries identifying fields (e.g. `name`, parent id).
- **Why:** A stable, predictable convention lets the future chatbot and analytics filter and group events without bespoke parsing (e.g. `action LIKE 'client%'`). Past-tense verbs read as a historical event log, not commands.

## R-2.5 — Schema-only tables have defined future owners
- `client_location_hours`, `client_location_access_notes`, and `client_billing_rules` exist as schema but have no data layer or UI in Phase 2.
- Intended consumers: **hours** → scheduling / SLA windows; **access_notes** → dispatch instructions (Phase 5); **billing_rules** → client invoicing & markup (Phase 8).
- **Why:** They are part of the Phase 2 data domain (so the model is complete and migrations don't churn later), but building UI before a consumer exists would be speculative. Creating the tables now is a harmless, forward-compatible placeholder (Phase 0 R-0.5); wiring them up waits for the phase that needs them.

## R-2.6 — A location belongs to exactly one client, in the same tenant
- `client_locations.client_id` is required; the location's `tenant_id` must equal its client's `tenant_id`.
- Detail pages assert `location.clientId === <client in URL>` in addition to tenant scoping.
- **Why:** Locations are meaningless without a parent client, and a child must never drift to a different tenant than its parent. The app enforces the tenant-match on write and re-checks the client match on read.

## R-2.7 — Create + read only; archival-ready but not archivable yet
- Phase 2 exposes create and read for clients/locations/contacts. No edit, archive, or delete UI.
- **Why:** The acceptance criteria only require creating and viewing. The `status` column is already in place so an archive action can be added later without a migration. (Deferred surface listed in `10-known-limitations.md` L-2.1.)
