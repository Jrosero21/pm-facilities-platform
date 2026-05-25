# Phase 2 Closeout — Clients and Client Locations

## Phase Goal
Let aggregator users manage clients and their locations (with contacts), fully tenant-scoped, so later phases can attach jobs, dispatch, and billing to real clients and locations.

## Completed Deliverables
- Schema for all 7 Phase 2 tables (migrations 0001 + 0002), InnoDB/utf8mb4, tenant-scoped, UUID v7 PKs.
- Create + read for clients, locations, client contacts, and location contacts.
- Screens: `/clients`, `/clients/new`, `/clients/[id]`, `/clients/[id]/locations`, `/clients/[id]/locations/new`, `/clients/[id]/locations/[locationId]`.
- Tenant-scoped data layers + server actions; parent-in-tenant guards; audit rows on every create.
- Migration tooling: 64-char identifier guard chained into `db:generate`.
- All 11 Phase 2 docs.

## Files Created or Changed
- Schema: `src/server/schema/clients.ts`, `client-details.ts`, updated `index.ts`.
- Migrations: `db/migrations/0001_silky_rafael_vega.sql`, `0002_blue_steel_serpent.sql` (+ meta).
- Data layers: `src/server/clients.ts`, `client-locations.ts`, `client-contacts.ts`, `location-contacts.ts`.
- Actions: `src/app/(app)/clients/actions.ts`, `location-actions.ts`, `contact-actions.ts`.
- UI: `src/app/(app)/clients/**` pages; `src/components/client-form.tsx`, `location-form.tsx`, `contact-form.tsx`, `contact-list.tsx`; app-shell nav (Dashboard/Clients).
- Tooling: `scripts/check-migration-identifiers.mjs`; `db:generate` script.
- Docs: `docs/phase-2-clients-locations/01..11`.

## Database Changes
See `08-db-changes.md`. 7 new tables; explicit short FK names on the `client_location_*` tables; no new seed data.

## API Routes / Server Actions Added
See `09-api-routes.md`. 6 pages, 4 create actions, 4 data-layer modules.

## User-Facing Workflows Added
Create/view clients, locations, and contacts (`03-user-sop.md`, `05-system-workflows.md`).

## Admin/Internal Workflows Added
Updated migration pipeline (generate → InnoDB fix → identifier guard), partial-migration recovery, lighting up schema-only tables (`04-admin-sop.md`).

## Business Rules Added
See `06-business-rules.md`: tenant scoping (R-2.1), per-tenant collation-driven uniqueness (R-2.2), soft-delete + cascade (R-2.3), audit naming `<entity>.<verb>` (R-2.4), schema-only table ownership (R-2.5), location-belongs-to-one-client (R-2.6), create+read scope (R-2.7).

## Chatbot Knowledge Added
See `07-chatbot-knowledge.md`: the 7-table model with column specifics, UI-vs-schema-only split, tenant scoping enforcement, uniqueness/collation behavior, soft-delete/cascade, audit events, screens, a worked example, and a "do not claim" list.

## Verification Performed
```bash
pnpm build        # compiles; 13 routes
pnpm lint         # clean
mysql ... -e "SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA='jonnyrosero_pm' AND TABLE_NAME LIKE 'client%';"   # 7 tables, InnoDB
mysql ... -e "SELECT COUNT(*) FROM __drizzle_migrations;"   # 3
# In-browser: created client Apple, location Apple 5th Ave, client contact Tim C, location contact Jim S.
# DB confirmed tenant/client scoping (location.tenant_id == client.tenant_id) and all four *.created audit rows.
```

## Known Limitations
See `10-known-limitations.md`. Highlights: no edit/archive UI (L-2.1); three schema-only tables (L-2.2); InnoDB-default gotcha (L-2.3); 64-char identifier limit + guard (L-2.4); case/accent-insensitive uniqueness (L-2.5); no pagination/search/contact-validation/geocoding (L-2.6–2.9).

## Carry-Forward Items
- Edit + archive UI for clients/locations/contacts.
- Wire up hours / access notes / billing rules in their consuming phases.
- List pagination + search/filter.
- Contact field validation; address geocoding.

## Recommended Next Phase Focus
Phase 3 — Vendors, vendor locations, and service coverage (`v0.4.0-phase-3`). The Phase 2 patterns still apply (tenant-scoped tables, create+read screens under `(app)`, audit on write, the InnoDB + identifier guards on migrations), but Phase 3 introduces **modeling complexity Phase 2 did not have** — orient on the new parts, not just the boilerplate:

- **Multi-location / national vendors:** a vendor can have many `vendor_locations`, unlike the simpler client→location shape. Expect many-to-many-ish coverage rather than one address per record.
- **Trade coverage:** `vendor_trade_coverage` maps vendors to the trades they perform (plumbing, HVAC, electrical, …). This needs a `trades` reference list and a join model — the first real many-to-many in the app.
- **Service areas:** `vendor_service_areas` defines *where* a vendor works (by region/postal/radius). This is the geographic-matching backbone.
- **Downstream consumer to design for:** Phase 5 dispatch will match a job's location to capable, in-area vendors by consuming **both** `vendor_service_areas` **and** `client_locations.latitude/longitude` — the lat/lng columns Phase 2 created but deliberately left null (L-2.8). Phase 3's service-area model should be shaped so that geographic match is feasible once those coordinates are populated (geocoding is still unbuilt).

In short: Phase 3 is where geography and capability matching start, so model `vendor_trade_coverage` and `vendor_service_areas` with Phase 5 dispatch in mind.
