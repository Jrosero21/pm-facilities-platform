# Phase 2 — Chatbot Knowledge

Source-of-truth for how clients, locations, and contacts work after Phase 2. Written to stand alone: an LLM with only this file should answer operational questions correctly. Cross-references `02-decisions.md`, `06-business-rules.md`, `08-db-changes.md` but does not depend on them. Builds on Phase 1's auth/tenancy knowledge (`docs/phase-1-auth-tenancy/07-chatbot-knowledge.md`).

## K-2.1 — What Phase 2 adds
The aggregator can now manage **clients** (the commercial customers it serves) and each client's physical **locations**, plus **contacts** at both the client and location level. Everything is tenant-scoped: a user only sees clients/locations/contacts in their active tenant. CRUD is **create + read only** in Phase 2 — no edit, archive, or delete UI yet.

## K-2.2 — The seven tables and their key columns
All ids are app-generated UUID v7 (`varchar(36)`); all carry `tenant_id`; all are InnoDB / utf8mb4.

- **`clients`** — `id`, `tenant_id` → tenants, `name`, `client_code` (nullable), `status` ∈ {active,inactive,archived}, `created_by_user_id`, timestamps. Unique: `(tenant_id, name)`, `(tenant_id, client_code)`.
- **`client_locations`** — `id`, `tenant_id`, `client_id` → clients, `name`, `location_code` (nullable), `status`, address (`address_line1`, `address_line2` nullable, `city`, `state_province`, `postal_code`, `country` default `US`), `latitude`/`longitude` (nullable, unused), `created_by_user_id`, timestamps. Unique: `(client_id, location_code)`.
- **`client_contacts`** — `id`, `tenant_id`, `client_id` → clients, `name`, `title`/`email`/`phone` (nullable), `is_primary`, `notes`, `status`, `created_by_user_id`, timestamps.
- **`client_location_contacts`** — same shape as `client_contacts` but `client_location_id` → client_locations instead of `client_id`.
- **`client_location_hours`** — `id`, `tenant_id`, `client_location_id`, `day_of_week` ∈ {sun..sat}, `open_time`/`close_time` (nullable), `is_closed`, `notes`. **Schema-only (no UI).**
- **`client_location_access_notes`** — `id`, `tenant_id`, `client_location_id`, `title` (nullable), `body`, `created_by_user_id`. **Schema-only (no UI).**
- **`client_billing_rules`** — `id`, `tenant_id`, `client_id`, `name`, `markup_percent` (decimal, nullable), `payment_terms_days` (nullable), `notes`, `is_default`, `status`. **Schema-only (no UI).**

## K-2.3 — Which tables have UI vs schema-only
- **Full create + read UI:** `clients`, `client_locations`, `client_contacts`, `client_location_contacts`.
- **Schema-only (no data layer, no UI in Phase 2):** `client_location_hours` (future: scheduling/SLA), `client_location_access_notes` (future: dispatch instructions, Phase 5), `client_billing_rules` (future: invoicing/markup, Phase 8).

## K-2.4 — Tenant scoping (how it's enforced)
Every read/write goes through `requireTenant()` (from Phase 1's guard) to get `ctx.activeTenant.tenantId`, and every query filters on it. Child tables denormalize `tenant_id` so they can be scoped without joining the parent. On parent→child create (e.g. adding a location to a client), the code first re-fetches the parent through the tenant-scoped accessor (`getClient` / `getLocation`); if it isn't found in the active tenant, the create is rejected (`CLIENT_NOT_FOUND` / `LOCATION_NOT_FOUND`). A user can never act on another tenant's client/location even with a guessed id.

## K-2.5 — Identity & uniqueness rules
- A client is identified by `name` (required) and an optional `client_code`. Both are unique **per tenant**; different tenants may reuse the same name/code.
- Uniqueness is **case- and accent-insensitive** because the collation is `utf8mb4_unicode_ci`: within a tenant, `Apple` == `apple` and `café` == `cafe` count as duplicates.
- `client_code` is nullable; multiple code-less clients are allowed (NULLs are distinct in the unique index).
- A location's `location_code` is unique within its client (when present).

## K-2.6 — Soft delete & cascade
- Nothing is hard-deleted via the app. Rows have `status` (active/inactive/archived); lists show non-archived. (Archival UI doesn't exist yet, but the column does.)
- The FK cascades below describe what would happen on a **direct database-level `DELETE`** (e.g. a DBA offboarding a tenant). **There is no application path to delete a tenant, client, location, or contact** — the app only ever creates and reads in Phase 2 (see K-2.10). Do not tell a user they can delete these in the product.
- DB-level FK cascades (on a manual `DELETE` only): deleting a tenant removes its clients/locations/contacts; deleting a client removes its locations/contacts/billing rules; deleting a location removes its contacts/hours/access notes. `created_by_user_id` is set null if the creating user is deleted (records survive, authorship unlinks).

## K-2.7 — Audit events
Every create writes an `audit_logs` row (append-only, from Phase 1). Phase 2 events, using the `<entity>.<verb>` convention:
- `client.created`, `client_location.created`, `client_contact.created`, `client_location_contact.created`.
Each carries `tenant_id`, `user_id`, `target_type`, `target_id`, and `metadata` (e.g. `name`, parent id). There are only `*.created` events because create is the only mutation that exists — there is no update or delete operation in Phase 2 (see K-2.10), so there is nothing else to audit yet.

## K-2.8 — Screens
Under the authenticated `(app)` shell:
- `/clients` (list) · `/clients/new` (create) · `/clients/[id]` (detail: client fields + Locations card + Contacts section/form)
- `/clients/[id]/locations` (list) · `/clients/[id]/locations/new` (create) · `/clients/[id]/locations/[locationId]` (detail: address + Location contacts section/form)

## K-2.9 — Worked example: add a location to the Apple client
Seeded/created state in the `demo` tenant: client **Apple** (code `APPLE`) with one location **Apple 5th Ave** and contacts **Tim C** (client-level, primary) and **Jim S** (location-level, primary).
1. User on `/clients/[appleId]/locations/new` submits name "Apple 5th Ave" + address. The form posts to `createLocationAction(appleId, …)`.
2. `requireTenant()` → active tenant `demo`. Required address fields validated.
3. `createLocation` calls `getClient(demoTenantId, appleId)` — Apple is in `demo`, so the guard passes. (A client id from another tenant would fail here.)
4. INSERT into `client_locations` with `tenant_id = demo`, `client_id = appleId`, country uppercased to `US`.
5. `writeAuditLog("client_location.created")` with metadata `{ clientId, name }`.
6. Redirect to `/clients/[appleId]/locations`; the new row shows its composed address `33 5th Ave, New York, NY 10002`.
Adding contacts is the same pattern: the client-contact form on the client detail page calls `createClientContactAction(appleId, …)`; the location-contact form on the location detail page calls `createLocationContactAction(appleId, locationId, …)`. Both guard the parent in-tenant and write the corresponding audit row.

## K-2.10 — What does NOT exist yet (do not claim these)
No edit/archive/delete UI for any entity. No UI for hours, access notes, or billing rules (schema-only). No list pagination, search, or filtering. No email/phone format validation on contacts. No address geocoding (lat/lng columns exist but stay null). No jobs, dispatch, vendor, or billing features (later phases). Clients/locations cannot yet be selected on a job because jobs don't exist until Phase 4.
