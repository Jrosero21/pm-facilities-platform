# Phase 3 — Chatbot Knowledge

Source-of-truth for how vendors, vendor locations, contacts, trade coverage, and service areas work after Phase 3. Written to stand alone: an LLM with only this file should answer operational questions correctly. Cross-references `02-decisions.md`, `06-business-rules.md`, `08-db-changes.md` but does not depend on them. Builds on Phase 2's clients/locations knowledge (`docs/phase-2-clients-locations/07-chatbot-knowledge.md`) — the vendor spine deliberately mirrors the client spine.

## K-3.1 — What Phase 3 adds
The aggregator can now manage **vendors** (the subcontractors it dispatches), each vendor's **locations** (branches) and **contacts**, the **trades** each vendor covers, and the **service areas** (geography) each vendor works in. Plus four **schema-only** tables for later phases (rates, documents, compliance, performance). Everything except `trades` is tenant-scoped. CRUD is **create + read only** in Phase 3 — no edit, archive, or delete UI yet (same posture as Phase 2).

## K-3.2 — The 10 tables and how they relate
All ids are app-generated UUID v7 (`varchar(36)`); all are InnoDB / utf8mb4. All carry `tenant_id` **except `trades`** (global — see K-3.4).

Relationship map:
```
trades (GLOBAL) ──< vendor_trade_coverage >── vendors ──< vendor_contacts
       └──< vendor_rates                         │   └──< vendor_locations
       └──< vendor_performance_scores            │           │
                                                 ├──< vendor_service_areas (optional location scope)
                                                 ├──< vendor_rates           (optional trade + location scope)
                                                 ├──< vendor_documents       (optional location scope)
                                                 ├──< vendor_compliance
                                                 └──< vendor_performance_scores (optional trade scope)
```
- **`vendors`** — the organization. `id`, `tenant_id`, `name`, `legal_name` (null), `vendor_code` (null, uppercased), `vendor_type` ∈ {local,regional,national}, `status` ∈ {active,inactive,archived}, `main_phone`/`main_email`/`website`/`tax_id` (null), `notes`, `created_by_user_id`, timestamps. **`name` is NOT unique per tenant** (K-3.5); `(tenant_id, vendor_code)` is unique when present.
- **`vendor_contacts`** — org-level contacts. Mirrors `client_contacts`: `vendor_id`, `name`, `title`/`email`/`phone` (null), `is_primary`, `notes`, `status`.
- **`vendor_locations`** — branches. Mirrors `client_locations`: `vendor_id`, `name`, `location_code` (null, uppercased), address (`address_line1`, `line2` null, `city`, `state_province`, `postal_code`, `country` default `US`), `latitude`/`longitude` (null, **never populated** — K-3.11), `status`. Unique `(vendor_id, location_code)`.
- **`vendor_trade_coverage`** — which trades a vendor performs (K-3.5). `vendor_id`, `trade_id` → trades, `vendor_location_id` (null = vendor-wide), `is_primary`, `status`. Unique `(vendor_id, trade_id, vendor_location_id)`.
- **`vendor_service_areas`** — where a vendor works (K-3.6). `vendor_id`, `vendor_location_id` (null = vendor-wide), `area_type` discriminator, `area_label`, per-type value columns, `country_code` default `US`, `status`.
- **`vendor_rates`** *(schema-only)* → Phase 8 billing. `vendor_id`, `trade_id` (null = general), `vendor_location_id` (null = vendor-wide), `rate_type` ∈ {hourly,flat,trip_charge,per_unit,emergency,after_hours}, `amount`, `currency` (USD), `unit` (only meaningful for `per_unit`), `effective_date`/`expiry_date`, `status`.
- **`vendor_documents`** *(schema-only)* → file-upload infra phase. `vendor_id`, `vendor_location_id` (null), `document_type` ∈ {insurance,w9,license,certification,agreement,other}, `title`, `file_url`/`file_size_bytes`/`file_mime_type` (null until infra lands), `issued_date`/`expiry_date`, `status`.
- **`vendor_compliance`** *(schema-only)* → Phase 5 dispatch eligibility. `vendor_id`, `requirement_type` ∈ {general_liability,workers_comp,auto_liability,umbrella,background_check,license,certification,other}, `coverage_amount`, `carrier`, `policy_number`, `effective_date`/`expiry_date`, **`compliance_status`** ∈ {pending,compliant,non_compliant,expired} (business state) **and** `status` (soft-delete) — two distinct fields (K-3.12).
- **`vendor_performance_scores`** *(schema-only)* → Phase 9 analytics, computed from Phase 4 jobs. `vendor_id`, `trade_id` (null = overall), `period_start`/`period_end`, `jobs_completed`, `jobs_on_time`, `on_time_rate`, `avg_rating`, `score`, `computed_at`, `status`.

## K-3.3 — Which tables have UI vs schema-only
- **Full create + read UI:** `vendors`, `vendor_contacts`, `vendor_locations`, `vendor_trade_coverage`, `vendor_service_areas`.
- **Schema-only (no data layer, no UI in Phase 3):** `vendor_rates` (→ Phase 8 billing), `vendor_documents` (→ file-upload infra phase), `vendor_compliance` (→ Phase 5 dispatch eligibility), `vendor_performance_scores` (→ Phase 9 analytics).
- `trades` has **no operator UI** either — it is seeded, not operator-managed (K-3.4).

## K-3.4 — The global trades model (and why it is not tenant-scoped)
`trades` is a **platform-wide reference table with NO `tenant_id`** — the one deliberate exception to "every table is tenant-scoped." Columns: `id`, `name` (globally unique), `code` (globally unique, uppercase, e.g. `HVAC`, `PLUMB`), `status`, timestamps. It is **seeded** (15 starter trades: Plumbing/PLUMB, HVAC/HVAC, Electrical/ELEC, Carpentry/CARP, Locksmith/LOCK, Roofing/ROOF, Cleaning/CLEAN, Landscaping/LAND, Pest Control/PEST, Glass/GLASS, Painting/PAINT, Flooring/FLOOR, Door-Hardware/DOOR, Appliance Repair/APPL, General Handyman/HANDY) via `pnpm db:seed:trades` (idempotent on `code`), not created through any UI.

**Why global, not per-tenant:** Phase 12's `external_trade_mappings` will translate external-portal trade lists (ServiceChannel, etc.) into internal trades. If internal trades were per-tenant, that mapping would be a 3-D matrix (tenant × external_system × trade) and external onboarding would not scale. A single global trade list keeps it 2-D (external_system × trade). Trades are canonical reference data, like `countries`/`states` — shared, not owned. A trade is retired by setting `status`, never hard-deleted; `vendor_trade_coverage.trade_id` → `trades` is **`ON DELETE RESTRICT`** so a trade in use cannot be removed out from under coverage.

## K-3.5 — Trade coverage (the capability model)
A vendor's covered trades are rows in `vendor_trade_coverage`, **one trade per row** (a vendor with three trades has three rows). Each row optionally scopes to a branch via `vendor_location_id`: **`null` = the vendor covers this trade everywhere; set = only at that branch.** This single shape handles a local vendor (one trade, vendor-wide) and a national vendor (branch A covers HVAC, branch B covers Electrical). Coverage is **additive/union**: if a vendor has HVAC vendor-wide *and* HVAC at the Phoenix branch, both are simply true — overlap is legitimate, not an error. Vendor `name` is **not** unique per tenant because real vendor name collisions are legitimate (two unrelated "ABC Plumbing"); the optional `vendor_code` (uppercased, unique per tenant) is the disambiguator.

## K-3.6 — Polymorphic service areas (the geography model)
`vendor_service_areas` is **one table with an `area_type` discriminator** that decides which value columns are meaningful. One row per area; a vendor mixes types freely. `area_label` (optional) is the human name shown in the UI; the raw value columns are the fallback when unlabeled. Validity (the right columns present for the chosen type) is enforced **in the create path / action**, not by the database (MySQL has no conditional NOT NULL). Concrete example per type:

| `area_type` | value columns used | example |
|---|---|---|
| `radius` | `center_latitude`, `center_longitude`, `radius_miles` | "25 mi @ 33.4484, -112.0740" (Phoenix metro) |
| `postal_code` | `postal_code` | "85004" |
| `city` | `city`, `state_code` | "Phoenix, AZ" |
| `county` | `county_name`, `state_code` | "Maricopa County, AZ" |
| `state` | `state_code` | "TX" |
| `national` | *(none)* | "Nationwide" |

`country_code` (default `US`) applies to all. The shape **anticipates Phase 5 geographic dispatch but contains no matching logic** — Phase 3 only stores areas. State codes are uppercased on write. Three composite indexes `(tenant_id, area_type, …)` exist for postal/state/city lookups; **`radius` is intentionally unindexed** because radius matching requires a per-row distance calculation that a B-tree index can't accelerate — spatial indexing can be added in Phase 5 if scale demands it (K-3.11).

## K-3.7 — The single-primary-trade rule (and what happens on conflict)
A vendor has **at most one primary trade** — `is_primary = true` on **one** `vendor_trade_coverage` row per `vendor_id` (the "this is what they ARE" identity, used by Phase 5 to rank primary-trade matches above secondary). It is enforced in the create path: when adding coverage marked primary, the code checks for an existing non-archived primary for that vendor and, if one exists, **rejects** the create with error code `PRIMARY_EXISTS` → the operator sees "This vendor already has a primary trade; only one is allowed." It does **not** auto-demote the existing primary. Because Phase 3 is create-only (no edit UI), changing which trade is primary currently requires a future edit phase or direct DB access (K-3.11). Primary scope is per-vendor, not per-branch.

## K-3.8 — Capability layer (Phase 3) vs transactional layer (Phase 5 dispatch)
Phase 3 builds the **capability layer**: a static description of what each vendor *can* do (`vendor_trade_coverage`) and *where* (`vendor_service_areas`). It answers "is this vendor capable of trade X in area Y?" Phase 5 dispatch is the **transactional layer**: `job_vendor_assignments`, ETAs, check-ins — what a vendor is actually *doing* on a specific job. Dispatch will *consume* the capability layer to find candidate vendors (match a job's location + trade against capable, in-area, compliant vendors), then create assignment rows. **Important for future work:** the Phase 3 list query `listVendorServiceAreas(tenantId, vendorId)` is per-vendor (for the screen). Phase 5's matching query is a **different shape** — cross-vendor, condition-based ("which vendors serve *this* target location?") — and should be written as a new query, **not** an extension of `listVendorServiceAreas` (see `02-decisions.md` D-3.12).

## K-3.9 — Worked example: the Sunbelt HVAC vendor
Seeded/created state in the `demo` tenant (created during Phase 3 verification, left in place):
- **Vendor** "Sunbelt HVAC" (legal "Sunbelt HVAC Services LLC"), `vendor_code` **SBHVAC-001**, `vendor_type` **regional**, dispatch@sunbelthvac.example, active.
- **Contact** Maria Delgado, Dispatch Manager, **primary**.
- **Location** "Phoenix HQ" (code **PHX**), 455 N 3rd St Suite 200, Phoenix AZ 85004 (lat/lng null — K-3.11).
- **Trade coverage** (2 rows): **HVAC** — vendor-wide, **primary**; **Electrical** — scoped to the Phoenix HQ branch, not primary.
- **Service areas** (3 rows): radius "Phoenix metro" (25 mi @ 33.4483771, -112.0740373, scoped to Phoenix HQ); state "TX regional" (TX, vendor-wide); national "Nationwide emergency".
- Attempting to add a *second* primary trade was rejected with `PRIMARY_EXISTS` (K-3.7) — so exactly one primary exists. Eight `*.created` audit rows were written (1 vendor, 1 contact, 1 location, 2 trade coverage, 3 service areas); the rejected primary wrote none.

## K-3.10 — Audit events
Every create writes an `audit_logs` row (append-only, from Phase 1), `<entity>.<verb>` convention: `vendor.created`, `vendor_contact.created`, `vendor_location.created`, `vendor_trade_coverage.created`, `vendor_service_area.created`. Each carries `tenant_id`, `user_id`, `target_type`, `target_id`, `metadata`. Only `*.created` events exist (create is the only mutation — K-3.11). **The trades seed writes no audit rows** (bootstrap reference data, not operator action). A rejected create (e.g. `PRIMARY_EXISTS`, duplicate) writes nothing — the guard fires before insert.

## K-3.11 — What does NOT exist yet (do not claim these)
- **No edit / archive / delete UI** for vendors, contacts, locations, trade coverage, or service areas (create + read only).
- **No way to change a vendor's primary trade** through the product (the second-primary create is rejected, and there is no edit UI to unset the first) — needs a future edit phase or DB access.
- **No operator UI to add/edit trades** — `trades` is seed-only; a super_admin trades-admin UI is deferred.
- **No vendor location detail page** — vendor locations are address records only, listed at `/vendors/[id]/locations` with no per-location detail route (a deliberate asymmetry vs client locations, which *do* have detail pages — see `06-business-rules.md` R-3.10). Do not tell a user to "open a vendor location."
- **No coordinate capture** — `vendor_locations.latitude/longitude` exist but are never populated (no geocoding). A `radius` service area's center is **typed manually** in the form; it does not auto-pull from a branch's (null) coordinates.
- **No UI for the four schema-only tables** (rates, documents, compliance, performance) — and no file upload (documents' `file_url` etc. stay null).
- **No dispatch, matching, or rate resolution** — the capability/geo model exists, but nothing matches jobs to vendors or computes rates yet (Phase 5/8). No jobs exist until Phase 4.
- **No field validation** on phone/email/website/tax_id/postal_code; no list pagination/search/filter.
