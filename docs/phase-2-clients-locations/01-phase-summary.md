# Phase 2 — Phase Summary

## Phase Name
Clients and Client Locations

## Version
`v0.3.0-phase-2`

## Phase Goal
Let aggregator users manage clients and their physical locations, fully tenant-scoped, so that later phases (jobs, dispatch, billing) have clients and locations to attach work to.

## In Scope
- Schema for the 7 Phase 2 tables: `clients`, `client_locations`, `client_contacts`, `client_location_contacts`, `client_location_hours`, `client_location_access_notes`, `client_billing_rules`.
- CRUD (create + read) for clients, locations, and contacts (client-level and location-level).
- Screens: `/clients`, `/clients/new`, `/clients/[id]`, `/clients/[id]/locations`, `/clients/[id]/locations/new`, `/clients/[id]/locations/[locationId]`.
- Tenant-scoped data layers and server actions; audit rows on every create.
- Migration tooling hardening: a 64-char identifier guard chained into `db:generate`.

## Out of Scope (deferred)
- Edit / archive / delete UI for any entity (create + read only this phase).
- UI for `client_location_hours`, `client_location_access_notes`, `client_billing_rules` (schema-only; consumers arrive in later phases).
- Jobs, vendor dispatch, client portal login, external portal integration (later phases).
- List pagination, search/filter, contact field validation, address geocoding.

## Status
Complete. Branch `phase-2-clients-locations`, tag `v0.3.0-phase-2`. Builds on Phase 1 (`v0.2.0-phase-1`).

## Pointers
- Decisions: `02-decisions.md`
- The "why" behind the flows: `05-system-workflows.md`, `06-business-rules.md`
- Chatbot source-of-truth: `07-chatbot-knowledge.md`
- DB changes: `08-db-changes.md`
- Known limitations: `10-known-limitations.md`
- Closeout: `11-closeout.md`
