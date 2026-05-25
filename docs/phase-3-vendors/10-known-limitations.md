# Phase 3 — Known Limitations

Everything intentionally not built, done "for now," or worth knowing before later phases. Includes carry-forwards. Inherits the still-load-bearing Phase 1/2 gotchas (InnoDB-must-be-forced L-2.3, 64-char identifier guard L-2.4, case/accent-insensitive collation L-2.5, no tenant-switcher UI L-2.12, per-event audit metadata L-2.13).

## L-3.1 — No edit / archive / delete UI
Vendors, contacts, locations, trade coverage, and service areas support **create + read only**. No UI to edit a record, flip `status` to `inactive`/`archived`, or remove one. The `status` columns exist so archival can be added later without a migration. **Carry-forward:** edit + archive UI (same gap as Phase 2 L-2.1, now spanning the vendor entities).

## L-3.2 — Four schema-only vendor tables (no UI, future consumers)
`vendor_rates`, `vendor_documents`, `vendor_compliance`, `vendor_performance_scores` have schema but no data layer or UI. Future consumers:
- `vendor_rates` → **Phase 8** billing (rate-resolution rules: most-specific of general / per-trade / per-branch).
- `vendor_documents` → **no specific phase**; surfacing depends on **file-upload infrastructure** being available (`file_url`/`file_size_bytes`/`file_mime_type` stay null until then).
- `vendor_compliance` → **Phase 5** dispatch eligibility.
- `vendor_performance_scores` → **Phase 9** analytics (computed from Phase 4 job data).
**Carry-forward:** wire each up in its consuming phase (see `04-admin-sop.md` SOP-3.D).

## L-3.3 — Trades are managed via seed only (no admin UI)
`trades` is global reference data with **no operator/admin UI** to add or edit entries. The seed (`pnpm db:seed:trades`, idempotent, additive) is the only maintenance path this phase. Current consumers (`vendor_trade_coverage` here, `jobs.primary_trade_id` Phase 4, dispatch Phase 5) only **reference** trades, never create them, so this is sufficient for now. **Carry-forward:** a super_admin trades-management UI when the taxonomy needs operator extensibility.

## L-3.4 — Vendor location coordinates are not captured
`vendor_locations.latitude`/`longitude` exist (nullable) but are **never populated** — there is no coordinate input on the location form and no geocoding. Consequence: a `radius` service area's center is **typed manually** in the radius form; it cannot auto-pull from a branch's (null) coordinates. Mirrors Phase 2 L-2.8 on `client_locations`. **Carry-forward:** capture/geocode coordinates when a geocoding integration lands; Phase 5 dispatch needs them on both client and vendor locations.

## L-3.5 — Soft-delete vs unique-index interaction on vendor_trade_coverage
The unique index `(vendor_id, trade_id, vendor_location_id)` ignores `status`. So a (future) **archived** branch-scoped coverage row would still block re-adding the same trade/branch combination. Phase 3 is create-only, so this cannot be hit yet, but an archive UI (L-3.1) must account for it (e.g. exclude archived from the constraint, or reactivate instead of re-insert). Same class as Phase 2's `location_code` soft-delete/unique interaction. **Carry-forward.**

## L-3.6 — Radius service areas are intentionally unindexed
`vendor_service_areas` has composite indexes for `postal_code`/`state_code`/`city`+`state_code` lookups but **none for `radius`** (lat/lng + miles). Radius matching will be a scan until scale demands spatial indexing. This is deliberate (D-3.2) — radius matching needs a distance computation, not an equality lookup, so a plain composite wouldn't help. **Carry-forward:** add spatial/geo indexing in Phase 5 if radius matching becomes hot.

## L-3.7 — expiry_date indexes deferred on documents/compliance
No index on `vendor_documents.expiry_date` / `vendor_compliance.expiry_date`. Phase 5 will reveal whether the query is per-vendor expiry checks or cross-vendor expiry sweeps; the right composite follows from that (D-3.11). **Carry-forward:** add the index in the consuming phase.

## L-3.8 — A vendor's primary trade cannot be changed through the product
Adding a second primary trade is rejected (`PRIMARY_EXISTS`, R-3.6), and there is no edit UI to unset the existing primary — so once set, changing which trade is primary requires the future edit phase or direct DB access. Acceptable for create-only Phase 3. **Carry-forward:** "set/change primary trade" as part of the edit UI (L-3.1).

## L-3.9 — Service-area form has no "use this branch's coordinates" helper
Because locations have no coordinates (L-3.4), the radius form offers no shortcut to center on a selected branch; the operator enters latitude/longitude by hand. **Carry-forward:** auto-fill the radius center from a branch once coordinates are captured.

## L-3.10 — No field validation on vendor identity/contact fields
`main_phone`/`main_email`/`website`/`tax_id` on vendors, `phone` on contacts, and `postal_code` on areas/locations are plain `<input>` text fields with no server-side format validation, no normalization, and no browser-level `type` enforcement. The one exception is the contact **`email`** field (`ContactForm`), which carries `type="email"` for a browser-level format hint only — it is still neither validated nor normalized server-side. **Carry-forward** (extends Phase 2 L-2.7).

## L-3.11 — Coverage page loads all-or-nothing
`/vendors/[id]/coverage` loads trades/locations/coverage/areas via `Promise.all`; if any read fails the whole page errors rather than rendering partially (D-3.10). Fine at current scale. **Carry-forward:** `Promise.allSettled` + per-section error states if Phase 9 dashboards need partial rendering.

## L-3.12 — Setup/test data present
The `demo` tenant contains Phase 3 verification data: vendor "Sunbelt HVAC" (code `SBHVAC-001`, regional) with contact "Maria Delgado", location "Phoenix HQ", two trade-coverage rows (HVAC primary vendor-wide, Electrical branch-scoped), and three service areas (radius "Phoenix metro", state "TX regional", national "Nationwide emergency"), plus the 8 corresponding `*.created` audit rows and the 15 seeded global trades. Real, append-only records; left in place (it is the worked example in `07-chatbot-knowledge.md` K-3.9).

## L-3.13 — No list pagination / search / filter
`/vendors`, the locations list, and the coverage lists return all non-archived rows. Fine at current scale; needs pagination/search for large tenants. **Carry-forward** (extends Phase 2 L-2.6/L-2.9).

## L-3.14 — No vendor location detail page (by design)
Vendor locations are list-only — there is no `/vendors/[id]/locations/[locationId]` route, unlike client locations which have detail pages. This is intentional (R-3.10): a vendor branch is a coverage/dispatch anchor, not a place that accumulates sub-records. Re-flagged here so it is not mistaken for an omission. **Not** a carry-forward unless a real consumer (e.g. per-branch documents) appears.
