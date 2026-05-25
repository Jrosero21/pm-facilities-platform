# Phase 3 — Decisions

Decisions locked in during Phase 3. Builds on Phase 0/1/2 decisions. Each notes the limitation it creates where relevant (cross-linked to `10-known-limitations.md`).

## D-3.1 — `trades` is a global reference table (no `tenant_id`)
- **Why:** Internal trades must be a single platform-wide list so `external_trade_mappings` (Phase 12) stays a 2-D matrix (external_system × trade) instead of 3-D per tenant — otherwise external-portal onboarding does not scale. Trades are canonical reference data, like countries/states, not tenant-owned data.
- **How to apply:** `trades` (id, name unique, code unique/uppercase, status) has no `tenant_id` and no FK to tenants — a deliberate, documented exception to the tenant-scoping rule (`06-business-rules.md` R-3.1/R-3.4). Seeded via `pnpm db:seed:trades` (idempotent on `code`); no operator UI (`10-known-limitations.md` L-3.3).

## D-3.2 — Polymorphic `vendor_service_areas` with an `area_type` discriminator
- **Why:** One shape must express local (radius around a branch), regional (state/county/city/postal lists), and national coverage, and be ready for Phase 5 geographic dispatch — without a table per shape.
- **How to apply:** A single table with `area_type ∈ {radius,postal_code,city,county,state,national}` and per-type nullable value columns. `radius` stores its own `center_latitude/longitude` + `radius_miles` (no dependency on a branch's coordinates). Validity (right columns per type) is enforced in the create path, not the DB (`06-business-rules.md` R-3.7). No matching logic in Phase 3.

## D-3.3 — Coverage / areas / rates attach at the vendor level with an optional branch scope
- **Why:** Must handle both a local vendor (one branch) and a national vendor (branch A covers region X, branch B region Y) uniformly.
- **How to apply:** `vendor_trade_coverage`, `vendor_service_areas`, and `vendor_rates` each carry a nullable `vendor_location_id`: **null = vendor-wide, set = that branch.** The FK cascades (a removed branch takes its scoped rows; never `set null`, which would silently promote them — `06-business-rules.md` R-3.9).

## D-3.4 — `vendor_rates.rate_type` includes `per_unit`; `unit` is meaningful only then
- **Why:** `hourly/flat/trip_charge/emergency/after_hours` all imply their basis, making a `unit` column redundant — *unless* there is a `per_unit` type for square-foot / linear-foot pricing.
- **How to apply:** `rate_type ∈ {hourly,flat,trip_charge,per_unit,emergency,after_hours}`; `unit` (e.g. `sq_ft`) is populated only for `per_unit`, null otherwise.

## D-3.5 — Vendor name is not unique per tenant
- **Why:** Vendor name collisions are legitimate (two unrelated "ABC Plumbing"); unlike curated client names, the vendor pool is broad. Forcing uniqueness creates awkward workarounds.
- **How to apply:** Migration 0004 dropped the unique `(tenant_id, name)` index and added a non-unique `(tenant_id, name)` index (preserving sorted-list performance). `(tenant_id, vendor_code)` stays unique-when-present as the canonical disambiguator (`06-business-rules.md` R-3.2). Done while `vendors` was empty.

## D-3.6 — Operator-assigned entity codes are uppercased on insert
- **Why:** The collation already makes codes case-insensitive for uniqueness/lookup, but the *stored* value was whatever was typed. A canonical stored form makes codes reliable lookup keys, consistent with `country`/`trades.code` which were already normalized. Surfaced by the Phase 3 smoke test (`vendor_code` stored as typed).
- **How to apply:** `client_code`, `vendor_code`, and both `location_code` fields are trimmed + uppercased (empty → null) **in the data layer** so every caller normalizes. A cross-phase touch (clients too); insert-time only, no backfill (`06-business-rules.md` R-3.3, `08-db-changes.md`).

## D-3.7 — One primary trade per vendor; reject a second
- **Why:** A single primary is a clean identity signal for Phase 5 matching. Auto-demoting the existing primary would be a silent, unauditable mutation — wrong for a create-only phase with no edit/unset UI.
- **How to apply:** The create path checks for an existing non-archived primary and rejects with `PRIMARY_EXISTS`. Changing the primary later needs a future edit phase (`10-known-limitations.md` L-3.8). Primary is per-vendor (`06-business-rules.md` R-3.6).

## D-3.8 — Four detail tables are schema-only
- **Why:** They belong to the Phase 3 vendor domain (roadmap lists them as Phase 3 core tables) but their consumers live in later phases. Building UI now is building ahead of need (Phase 2 D-2.9 precedent).
- **How to apply:** `vendor_rates`, `vendor_documents`, `vendor_compliance`, `vendor_performance_scores` are schema + tenant-scoped, no data layer/UI. Consumers: rates → Phase 8 billing; documents → file-upload infra phase; compliance → Phase 5 dispatch eligibility; performance → Phase 9 analytics (`06-business-rules.md` R-3.4 ownership, `10-known-limitations.md` L-3.2).

## D-3.9 — `trade_id` FKs are `ON DELETE RESTRICT` (the only delete exception)
- **Why:** A trade covered by any vendor (or referenced by a rate/score) must not be hard-deletable out from under those rows. Trades retire via `status`.
- **How to apply:** `vendor_trade_coverage.trade_id`, `vendor_rates.trade_id`, `vendor_performance_scores.trade_id` → `trades` use RESTRICT (verified live). Everything else cascades (tenant/vendor/branch) or sets null (created_by). This is the project's only FK delete exception (`06-business-rules.md` R-3.9).

## D-3.10 — `listActiveTrades` is uncached; the coverage page loads all-or-nothing
- **Why (uncached):** the global trades list is tiny and read on each coverage render; caching adds invalidation complexity for no real benefit. Documented so a future session does not speculatively add caching or treat the per-render read as a bug.
- **Why (all-or-nothing):** the coverage page's four reads run via `Promise.all` (concurrent, fail-together). Acceptable for Phase 3; Phase 9 may revisit with `Promise.allSettled` + per-section error states if a dashboard needs partial rendering.

## D-3.11 — `expiry_date` indexes on documents/compliance are deferred
- **Why:** Phase 5 will reveal whether the natural query is per-vendor expiry checks or cross-vendor expiry sweeps; the right composite index follows from that. Adding one speculatively now would likely pick the wrong shape.
- **How to apply:** No index on `vendor_documents.expiry_date` / `vendor_compliance.expiry_date` in Phase 3. Add when the consuming phase defines the query.

## D-3.12 — Phase 5 dispatch needs a different cross-vendor query, not an extension of the screen query
- **Why:** `listVendorServiceAreas(tenantId, vendorId)` is per-vendor for the coverage screen. Dispatch matching is the inverse — "which vendors serve *this* target location?" — a cross-vendor, condition-based query.
- **How to apply:** Phase 5 should write a new matching query against `vendor_service_areas` (and `vendor_compliance` for eligibility), **not** refactor `listVendorServiceAreas`. The Phase 3 shape is correct for the screen; flagged so future-Claude does not extend the wrong query.

## D-3.13 — `vendor_compliance` keeps `status` and `compliance_status` separate
- **Why:** Lifecycle ("is this record live?") and business state ("is the vendor compliant?") are orthogonal and both needed; collapsing loses information.
- **How to apply:** Two enums on the table; Phase 5 reads `compliance_status`, soft-delete uses `status`. Must not be merged (`06-business-rules.md` R-3.11).

## D-3.14 — Reject a present-but-invalid `vendor_type` rather than coerce it
- **Why:** A *missing* `vendor_type` sensibly defaults to `local`, but a *present* value outside {local,regional,national} signals a bug or tampering. Silently coercing it to `local` would hide that; surfacing it makes bad input visible. (Triage decision from the Phase 3 smoke test.)
- **How to apply:** `createVendorAction` defaults a blank/absent value to `local`, but returns "Invalid vendor type." for any present unrecognized value (`05-system-workflows.md` WF-3.1). The same surface-don't-coerce stance applies to the service-area `area_type` discriminator (WF-3.4).

## D-3.15 — `rate_type` mixes measurement bases and pricing contexts; Phase 8 will need to disambiguate
- **Why:** `hourly/flat/trip_charge/per_unit` describe *how* a rate is measured; `emergency/after_hours` describe *when* a rate applies. A single enum cannot express compound cases like "the after-hours hourly rate" or "the emergency per-unit rate." This is a deliberate Phase 3 shape choice — we model the column, not the resolution.
- **How to apply (Phase 8):** rate resolution must either split `rate_type` into two columns (basis + context) or treat the enum as a flat lookup with documented precedence (most-specific-wins). Either path is acceptable; the data shape supports both. Do *not* add new compound enum values (e.g. `after_hours_hourly`) — that explodes combinatorially and breaks the migration path to a split.
