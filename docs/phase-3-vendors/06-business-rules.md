# Phase 3 — Business Rules

Rules introduced in Phase 3, each with the reasoning behind it. Inherits Phase 0/1/2 rules (source-agnostic, server-side DB access, tenant-scoping, audited auth, soft-delete, `<entity>.<verb>` audit naming, parent-in-tenant guards).

## R-3.1 — Vendors and their children are tenant-scoped; `trades` is the deliberate exception
- Every Phase 3 row carries `tenant_id` and every query filters by the active tenant — **except `trades`**, which is global (no `tenant_id`).
- **Why:** Vendor data is tenant-private, like clients. But `trades` is canonical reference data shared across all tenants (R-3.4). The exception is intentional and documented so it does not read as a missing column.

## R-3.2 — Vendor name is NOT unique per tenant; `vendor_code` is the disambiguator
- Unlike `clients.name` (unique per tenant), `vendors.name` has only a **non-unique** `(tenant_id, name)` index. `(tenant_id, vendor_code)` is unique when the code is present.
- **Why:** Real-world vendor name collisions are legitimate — two unrelated "ABC Plumbing" in different cities can both be vendors of one aggregator. Forcing name-uniqueness would push operators into awkward workarounds. The optional `vendor_code` is the canonical disambiguator when one is needed. This divergence from clients is **by design, not an oversight** (migration 0004 dropped the unique name index and added a non-unique one). See `02-decisions.md` D-3.5.

## R-3.3 — Operator-assigned entity codes are stored uppercase; matching is case-insensitive
- `client_code`, `vendor_code`, and both `location_code` fields are **normalized to uppercase on insert** (trim → uppercase; empty → null), in the data layer so every caller (forms, seeds, future imports) gets it.
- **Why:** The `utf8mb4_unicode_ci` collation already makes uniqueness and lookups case-insensitive (so `sbhvac-001` and `SBHVAC-001` collide), but the *stored* value was previously whatever was typed. Normalizing on insert keeps the canonical stored form consistent and predictable as a lookup key (matching how `country` and `trades.code` were already uppercased). Insert-time only — existing rows are not backfilled. See `02-decisions.md` D-3.6.

## R-3.4 — `trades` is a global reference table; coverage references it with RESTRICT
- `trades` (id, name unique, code unique/uppercase, status) is platform-wide and **seeded**, not operator-managed. `vendor_trade_coverage.trade_id` and the schema-only `vendor_rates.trade_id` / `vendor_performance_scores.trade_id` reference it with **`ON DELETE RESTRICT`**.
- **Why:** A single global trade list keeps `external_trade_mappings` (Phase 12) a 2-D matrix instead of 3-D per tenant (R-3.4 rationale in `07-chatbot-knowledge.md` K-3.4). RESTRICT prevents a trade that any vendor covers from being hard-deleted out from under that coverage; trades are retired via `status` instead. RESTRICT is the project's **only** FK delete exception (R-3.9).

## R-3.5 — Trade coverage: one trade per row, optional branch scope
- A vendor's covered trades are individual `vendor_trade_coverage` rows. `vendor_location_id` is optional: **null = vendor-wide, set = scoped to that branch.** Unique `(vendor_id, trade_id, vendor_location_id)` prevents exact duplicates; the org-wide (null) case is guarded in the create path because MySQL treats NULLs as distinct in unique indexes.
- **Why:** One-row-per-trade is the normalized join and lets each coverage carry its own attributes (primary flag, future per-trade data). Optional location scope models both local vendors (one vendor-wide trade) and national vendors (different trades per branch) in one shape.

## R-3.6 — Single primary trade per vendor (vendor identity, enforced in app)
- Each vendor has at most one `vendor_trade_coverage` row with `is_primary = true` per `vendor_id` (scope: **per-vendor, NOT per-branch**). Enforced in the create path: a second-primary attempt is rejected with `PRIMARY_EXISTS`, no auto-demote.
- **Phase 5 interpretation:** dispatch will rank primary-trade matches above secondary matches when scoring vendors for a job.
- **Why:** A vendor's primary trade is part of their identity ("what they ARE"), not their geographic configuration. Per-branch primaries would imply branches have separate identities, which contradicts the "branches are dispatch origins, not first-class entities" rule (R-3.10). Auto-demoting an existing primary would be surprising and unauditable; reject + a clear error means the operator deliberately chooses which trade is primary. Changing the primary later is a future edit-phase concern (`10-known-limitations.md` L-3.8).

## R-3.7 — Service-area validity is discriminator-driven and enforced in the app
- `vendor_service_areas.area_type` decides which value columns are required: `radius` needs center lat/lng + radius_miles; `postal_code` needs postal_code; `city`/`county` need their field + state_code; `state` needs state_code; `national` needs none. All value columns are nullable at the DB level.
- **Why:** MySQL has no conditional NOT NULL, so the "right columns for this type" rule lives in the create path (the action validates and nulls irrelevant fields). Keeping the columns nullable lets one table hold all area shapes; the app is the integrity boundary. See `02-decisions.md` D-3.2.

## R-3.8 — Coverage is additive (union), not exclusive
- Multiple overlapping coverage/area rows for a vendor are **all true simultaneously**. A vendor with `state = TX` *and* `postal_code = 75001` covers all of TX (including 75001); a vendor with HVAC vendor-wide *and* HVAC at one branch is simply covered both ways.
- **Why:** Operators legitimately mix granularities, and geographic dispatch (Phase 5) treats the set as a union when testing whether a vendor serves a point. Overlap is not a data-quality problem and must not be flagged or de-duplicated as one.

## R-3.9 — FK delete rules: RESTRICT on `trade_id` (the one exception), cascade otherwise
- `trade_id` → `trades` is `ON DELETE RESTRICT` (R-3.4). `tenant_id` → tenants and `vendor_id` → vendors cascade; optional `vendor_location_id` → vendor_locations cascades (a removed branch takes its branch-scoped coverage/areas/rates with it — never `set null`, which would silently promote branch-scoped rows to vendor-wide). `created_by_user_id` → users is `set null`.
- **Why:** Cascade keeps the graph consistent if a parent is physically removed (tenant/vendor teardown), but reference data (trades) must be protected from deletion. As in Phase 2, normal operations never delete — they archive.

## R-3.10 — Client vs vendor location asymmetry is intentional
- Client locations are first-class entities with **detail pages** (they host contacts, and will host hours/access-notes). Vendor locations are **address records only** — listed, but with **no detail page** — anchoring multi-location modeling and `radius` service-area centers.
- **Why:** A vendor branch is a dispatch origin / coverage anchor, not a place that accumulates its own sub-records the way a client site does. Building a vendor-location detail page would be speculative surface. This asymmetry is deliberate — a future session should not "fix" it by adding one without a real consumer.

## R-3.11 — `vendor_compliance` keeps two separate status fields
- `vendor_compliance` carries **`status`** (soft-delete: active/inactive/archived) **and** **`compliance_status`** (business state: pending/compliant/non_compliant/expired). They are distinct concerns and must **not** be collapsed into one enum.
- **Why:** "Is this requirement record live?" (lifecycle) and "Is the vendor currently compliant on it?" (business state) are orthogonal — an archived record could have been compliant; an active record can be expired. Phase 5 dispatch eligibility reads `compliance_status`; the soft-delete `status` governs whether the row is shown. Collapsing them would lose information.

## R-3.12 — Audit naming extends the `<entity>.<verb>` convention to vendors
- New create events: `vendor.created`, `vendor_contact.created`, `vendor_location.created`, `vendor_trade_coverage.created`, `vendor_service_area.created`. The schema-only tables and the `trades` seed produce no audit events (no operator create path yet; seed is bootstrap data).
- **Why:** Consistency with Phase 2 so the future chatbot/analytics can filter by `action LIKE 'vendor%'` without bespoke parsing. Only `*.created` exists because create is the only mutation in Phase 3.
