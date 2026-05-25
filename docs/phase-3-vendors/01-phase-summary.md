# Phase 3 — Phase Summary

## Phase Name
Vendors, Vendor Locations, and Coverage

## Version
`v0.4.0-phase-3`

## Phase Goal
Build the vendor database supporting local vendors and multi-location/national vendors, with trade coverage and service-area modeling that anticipates Phase 5 geographic dispatch — so later phases can dispatch jobs to capable, in-area vendors.

## In Scope
- Schema for the 9 core vendor tables plus the global `trades` reference table (10 tables): `trades`, `vendors`, `vendor_contacts`, `vendor_locations`, `vendor_trade_coverage`, `vendor_service_areas`, `vendor_rates`, `vendor_documents`, `vendor_compliance`, `vendor_performance_scores`.
- CRUD (create + read) for vendors, contacts, locations, trade coverage, and service areas.
- Screens: `/vendors`, `/vendors/new`, `/vendors/[id]`, `/vendors/[id]/locations`, `/vendors/[id]/locations/new`, `/vendors/[id]/coverage`.
- Global trades model (seeded, 15 starter trades) referenced by coverage with `ON DELETE RESTRICT`.
- Polymorphic service-area modeling (`area_type` discriminator) ready for Phase 5 dispatch.
- Tenant-scoped data layers and server actions; parent-in-tenant guards; audit rows on every create.
- Cross-phase fix: operator-assigned entity codes normalized to uppercase on insert.

## Out of Scope (deferred)
- Edit / archive / delete UI for any entity (create + read only this phase).
- UI for the four schema-only tables (`vendor_rates`, `vendor_documents`, `vendor_compliance`, `vendor_performance_scores`); consumers arrive in Phase 5/8/9 / the file-upload phase.
- Operator UI to manage `trades` (seed-only).
- Vendor location detail page (deliberate asymmetry vs client locations).
- Address geocoding / coordinate capture; rate resolution; job dispatch / matching (Phase 5); vendor portal login (Phase 10).
- List pagination, search/filter, contact/field validation.

## Status
Complete. Branch `phase-3-vendors`, tag `v0.4.0-phase-3`. Builds on Phase 2 (`v0.3.0-phase-2`).

## Pointers
- Decisions: `02-decisions.md`
- The "why" behind the flows: `05-system-workflows.md`, `06-business-rules.md`
- Chatbot source-of-truth: `07-chatbot-knowledge.md`
- DB changes: `08-db-changes.md`
- Known limitations: `10-known-limitations.md`
- Closeout: `11-closeout.md`
