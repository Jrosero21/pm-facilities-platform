# Phase 3 Closeout — Vendors, Vendor Locations, and Coverage

## Phase Goal
Build the vendor database supporting local and multi-location/national vendors, with trade coverage and service-area modeling that anticipates Phase 5 geographic dispatch, so later phases can dispatch jobs to capable, in-area vendors.

## Completed Deliverables
- Schema for the global `trades` table + 9 core vendor tables (migrations 0003–0006), InnoDB/utf8mb4, tenant-scoped (trades global), UUID v7 PKs.
- Create + read for vendors, contacts, locations, trade coverage, and service areas.
- Screens: `/vendors`, `/vendors/new`, `/vendors/[id]`, `/vendors/[id]/locations`, `/vendors/[id]/locations/new`, `/vendors/[id]/coverage`.
- Global trades model (15 seeded, idempotent) referenced with `ON DELETE RESTRICT`; polymorphic service areas with Phase 5 dispatch composites.
- Tenant-scoped data layers + server actions; parent-in-tenant guards; audit rows on every create.
- Generalized `ContactForm`/`ContactList` and `LocationForm` for cross-domain reuse.
- Cross-phase fix: operator-assigned entity codes normalized to uppercase on insert.
- All 11 Phase 3 docs.

## Files Created or Changed
- Schema: `src/server/schema/trades.ts`, `vendors.ts`, `vendor-coverage.ts`, `vendor-details.ts`, updated `index.ts`.
- Migrations: `db/migrations/0003_reflective_oracle.sql`, `0004_rapid_tomorrow_man.sql`, `0005_empty_captain_cross.sql`, `0006_thick_darwin.sql` (+ meta).
- Data layers: `src/server/vendors.ts`, `vendor-contacts.ts`, `vendor-locations.ts`, `vendor-trade-coverage.ts`, `vendor-service-areas.ts`, `trades.ts`.
- Actions: `src/app/(app)/vendors/actions.ts`, `contact-actions.ts`, `location-actions.ts`, `coverage-actions.ts`.
- UI: `src/app/(app)/vendors/**` pages; `src/components/vendor-form.tsx`, `trade-coverage-form.tsx`, `service-area-form.tsx`; generalized `contact-form.tsx`, `location-form.tsx`; app-shell nav (added Vendors).
- Cross-phase: `src/server/clients.ts`, `client-locations.ts` (entity-code uppercase); `clients/contact-actions.ts`, `clients/location-actions.ts`, `clients/[id]/locations/new/page.tsx` (generalization wiring).
- Seeds/tooling: `db/seeds/trades.ts`; `db:seed:trades` script.
- Docs: `docs/phase-3-vendors/01..11`.

## Database Changes
See `08-db-changes.md`. 10 new tables across 4 migrations; `trades` is global (no `tenant_id`); `trade_id` FKs are RESTRICT (the only delete exception); explicit short FK names on the coverage tables; 15 seeded trades. Total recorded migrations: 7.

## API Routes / Server Actions Added
See `09-api-routes.md`. 6 pages, 5 create actions, 6 data-layer modules (incl. `listActiveTrades`).

## User-Facing Workflows Added
Create/view vendors, contacts, locations; assign trade coverage and service areas (`03-user-sop.md`, `05-system-workflows.md`).

## Admin/Internal Workflows Added
Seed the global trades list; apply the Phase 3 migrations; verify the RESTRICT FKs; light up a schema-only vendor table; inspect Phase 3 data (`04-admin-sop.md`).

## Business Rules Added
See `06-business-rules.md`: tenant scoping with the trades exception (R-3.1), vendor name not unique (R-3.2), entity-code uppercasing (R-3.3), global trades + RESTRICT (R-3.4), trade coverage shape (R-3.5), single primary trade (R-3.6), discriminator-driven service-area validity (R-3.7), additive/union coverage (R-3.8), FK delete rules (R-3.9), client/vendor location asymmetry (R-3.10), compliance two-status (R-3.11), audit naming (R-3.12).

## Chatbot Knowledge Added
See `07-chatbot-knowledge.md`: the 10-table relationship map, global trades model + rationale, polymorphic service areas with per-type examples, the single-primary rule, capability-layer-vs-dispatch framing, the Sunbelt HVAC worked example, the UI-vs-schema-only split, and a "do not claim" list.

## Verification Performed
```bash
pnpm lint         # clean (throughout every batch)
npx tsc --noEmit  # exit 0
mysql ... -e "SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA='jonnyrosero_pm' AND (TABLE_NAME LIKE 'vendor%' OR TABLE_NAME='trades');"  # 10 tables, InnoDB
mysql ... -e "SELECT COUNT(*) FROM __drizzle_migrations;"   # 7
# trade_id FKs verified ON DELETE RESTRICT in the live DB (vendor_trade_coverage, vendor_rates, vendor_performance_scores)
# trades confirmed global (no tenant_id column); 15 trades seeded
# Smoke test (server-side data layer + authenticated render): created vendor "Sunbelt HVAC" with
#   primary contact, Phoenix HQ location, 2 trade-coverage rows (HVAC primary vendor-wide,
#   Electrical branch-scoped), 3 service areas (radius/state/national). Second-primary attempt
#   rejected with PRIMARY_EXISTS (primary_count stayed 1). 8 *.created audit rows written.
#   /vendors and /vendors/[id]/coverage rendered 200 with the seeded data + labels present.
```

## Known Limitations
See `10-known-limitations.md`. Highlights: no edit/archive UI (L-3.1); four schema-only tables (L-3.2); trades seed-only (L-3.3); vendor location coordinates not captured (L-3.4); soft-delete vs unique-index on coverage (L-3.5); radius unindexed (L-3.6); expiry_date indexes deferred (L-3.7); primary trade not changeable via UI (L-3.8); no field validation/pagination/search (L-3.10/L-3.13); no vendor location detail page by design (L-3.14).

## Carry-Forward Items
- Edit + archive UI for vendor entities (incl. set/change primary trade).
- Wire up `vendor_rates` (Phase 8), `vendor_compliance` (Phase 5), `vendor_performance_scores` (Phase 9), `vendor_documents` (file-upload phase).
- Capture/geocode location coordinates (both client and vendor) for radius areas + dispatch.
- A super_admin trades-management UI when the taxonomy needs operator extensibility.
- Spatial indexing for radius matching; `expiry_date` indexes — in their consuming phases.
- List pagination + search/filter; vendor/contact field validation.

## Recommended Next Phase Focus
Phase 4 — Jobs / Work Orders Foundation (`v0.5.0-phase-4`). The Phase 2/3 patterns still apply (tenant-scoped tables, create+read screens under `(app)`, audit on write, parent-in-tenant guards, the InnoDB + identifier guards on migrations). Orient on the new parts:

- **The central job object** references existing data: `client_id` + `client_location_id` (Phase 2) and `primary_trade_id` → the **global `trades`** taxonomy (Phase 3). Reuse, don't re-model, those.
- **History tables start here:** Phase 4 introduces real per-entity history (`job_status_history`, `job_priority_history`, `job_trade_history`, `job_events`) beyond the audit log — the "every meaningful change preserves a history row" rule gets its first dedicated tables.
- **Reuse the generalized forms:** `job_contacts` can follow the `ContactForm`/`ContactList` pattern with a bound action — no new contact component needed.
- **Design for Phase 5 dispatch:** a job carries a location + trade; Phase 5 will match those against the Phase 3 capability layer (`vendor_trade_coverage` + `vendor_service_areas`, with `vendor_compliance` for eligibility) via a **new cross-vendor query** (not an extension of `listVendorServiceAreas` — `02-decisions.md` D-3.12). Shape jobs so that match is feasible once coordinates are populated (geocoding still unbuilt — L-3.4).
