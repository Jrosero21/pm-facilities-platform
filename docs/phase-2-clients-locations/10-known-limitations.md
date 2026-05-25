# Phase 2 — Known Limitations

Everything intentionally not built, done "for now," or worth knowing before later phases. Includes carry-forwards and the two MySQL/MariaDB gotchas hit this phase.

## L-2.1 — No edit / archive / delete UI
Clients, locations, and contacts support **create + read only**. There is no UI to edit a record, flip `status` to `inactive`/`archived`, or remove one. The `status` columns exist so an archive action can be added later without a migration. **Carry-forward:** edit + archive UI.

## L-2.2 — Three schema-only detail tables (no UI, future consumers)
`client_location_hours`, `client_location_access_notes`, and `client_billing_rules` have schema but no data layer or UI. Intended consumers:
- `client_location_hours` → scheduling / SLA windows.
- `client_location_access_notes` → dispatch instructions (Phase 5).
- `client_billing_rules` → client invoicing & markup (Phase 8).
**Carry-forward:** wire each up in the phase that needs it (see `04-admin-sop.md` SOP-2.C).

## L-2.3 — InnoDB must be forced on every migration (MariaDB MyISAM default)
Namecheap MariaDB defaults to MyISAM, which silently drops foreign keys. `scripts/fix-mysql-engine.mjs` rewrites every generated migration to `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` and runs as part of `pnpm db:generate`. Hand-authored migrations must be passed through it. (Carried from Phase 1 L-1.7; still load-bearing.)

## L-2.4 — 64-char identifier limit (now guarded)
MySQL silently rejects any identifier > 64 chars, aborting a migration mid-apply and leaving it partially applied + unrecorded. This bit `0002` on first attempt: the auto-generated FK name `client_location_access_notes_client_location_id_client_locations_id_fk` (70 chars) failed. Fixed by giving the `client_location_*` location FKs explicit short names, and by adding `scripts/check-migration-identifiers.mjs` (chained into `db:generate`) which fails loudly with a classified hint if any table/column/index/constraint name exceeds 64 chars. **Recovery procedure** for a partial migration is documented in `04-admin-sop.md` SOP-2.B.

## L-2.5 — Name/code uniqueness is case- and accent-insensitive
The unique indexes on `(tenant_id, name)` and `(tenant_id, client_code)` use the DB collation `utf8mb4_unicode_ci`, which is **case- and accent-insensitive**. Within a tenant, `Apple` and `apple` collide, as do `café` and `cafe`. This is deliberate (prevents capitalization-only duplicates) but can surprise: a user cannot create both `APPLE` and `apple` as distinct codes. If a case-sensitive identifier is ever required, it would need a `*_bin` collation on that column. No per-column collation override is in place today.

## L-2.6 — No list pagination
`/clients` and the locations list return all non-archived rows. Fine at current scale; will need pagination/virtualization for tenants with many clients/locations. **Carry-forward.**

## L-2.7 — No contact field validation
`email`/`phone` on contacts are free-text (the email input has only browser-level `type=email`). No server-side format validation or normalization. **Carry-forward.**

## L-2.8 — Addresses are not geocoded
`client_locations.latitude`/`longitude` exist (nullable) but are never populated; no geocoding integration. Reserved for Phase 3 vendor coverage / Phase 5 dispatch. **Carry-forward.**

## L-2.9 — No search / filter
No way to search or filter clients or locations by name/code/status/city. **Carry-forward.**

## L-2.10 — Location detail surfaces contacts only
The location detail page shows the address and contacts, but not hours or access notes (those are schema-only). When those tables get UI, the location detail page is their natural home.

## L-2.11 — Setup/test data present
The `demo` tenant contains test data created during verification (client "Apple", location "Apple 5th Ave", contacts "Tim C"/"Jim S") plus the corresponding `*.created` audit rows. Real, append-only records; left in place.

## L-2.12 — No tenant-switcher UI (carried from Phase 1)
`setActiveTenant()` exists server-side (validated + audited) but nothing in the UI calls it; a multi-tenant user is pinned to their first active membership. This is the Phase 1 carry-forward (L-1.5), re-flagged here so this phase's limitations file is self-contained on current gaps. It does not affect Phase 2 specifically — clients/locations all resolve against whatever the active tenant is — but it blocks any user who needs to act across tenants. **Carry-forward.**

## L-2.13 — Audit metadata shape is per-event, not schematized
`audit_logs.metadata` is event-specific JSON (e.g. `client.created` carries `{ name }`; `client_location.created` carries `{ clientId, name }`). There is no schema registry or shared contract describing which keys each `action` carries, and nothing validates it on write. A future consumer (especially the Phase 16 chatbot, which will read these to summarize history) must treat metadata defensively and cannot assume a fixed shape per action. **Carry-forward:** document or formalize a per-action metadata contract before the chatbot relies on it.
