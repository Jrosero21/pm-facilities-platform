# Phase 3 — API Routes & Server Actions

## Pages (under the authenticated `(app)` route group)
- **`/vendors`** — vendor list (server component; `requireTenant()` + `listVendors`; columns name/type/code/status).
- **`/vendors/new`** — create form (`VendorForm` client component).
- **`/vendors/[id]`** — vendor detail: fields + Locations card (count + links) + Coverage card (counts + link) + Contacts section (list + add form).
- **`/vendors/[id]/locations`** — location list for a vendor (names are plain text — no per-location detail page, R-3.10).
- **`/vendors/[id]/locations/new`** — create-location form (generalized `LocationForm`).
- **`/vendors/[id]/coverage`** — trade-coverage section (list + add form) and service-areas section (list + add form).

All call `requireTenant()`; detail/coverage/location pages `notFound()` on a missing or cross-tenant vendor id.

## Server actions
- **`createVendorAction(prev, formData)`** — `src/app/(app)/vendors/actions.ts`. Validates name; parses `vendor_type` (missing → local, invalid → reject); maps duplicate `vendor_code` to a friendly error; `revalidatePath("/vendors")`; redirects to the new vendor.
- **`createVendorContactAction(vendorId, prev, formData)`** — `src/app/(app)/vendors/contact-actions.ts`. Guards vendor-in-tenant; revalidates the detail path; returns null.
- **`createVendorLocationAction(vendorId, prev, formData)`** — `src/app/(app)/vendors/location-actions.ts`. Validates required address fields; maps `VENDOR_NOT_FOUND` + duplicate `location_code`; redirects to the locations list.
- **`createTradeCoverageAction(vendorId, prev, formData)`** and **`createServiceAreaAction(vendorId, prev, formData)`** — `src/app/(app)/vendors/coverage-actions.ts`. Trade coverage maps `VENDOR_NOT_FOUND`/`TRADE_NOT_FOUND`/`LOCATION_NOT_FOUND`/`PRIMARY_EXISTS`/`DUPLICATE_COVERAGE` + `ER_DUP_ENTRY` to friendly errors. Service area does discriminator-driven per-type validation (and nulls irrelevant fields), uppercases state codes. Both revalidate `/vendors/[id]/coverage` and return null.

## Data layer (server-only modules)
- **`src/server/vendors.ts`** — `listVendors`, `getVendor`, `createVendor` (uppercases vendor_code).
- **`src/server/vendor-contacts.ts`** — `listVendorContacts`, `createVendorContact` (guards vendor-in-tenant).
- **`src/server/vendor-locations.ts`** — `listVendorLocations`, `getVendorLocation`, `createVendorLocation` (guards vendor-in-tenant; uppercases location_code).
- **`src/server/vendor-trade-coverage.ts`** — `listVendorTradeCoverage` (joined to trade + branch names), `createVendorTradeCoverage` (vendor/trade/location guards, single-primary reject, org-wide dup guard).
- **`src/server/vendor-service-areas.ts`** — `listVendorServiceAreas`, `createVendorServiceArea` (parent/location guards).
- **`src/server/trades.ts`** — `listActiveTrades` (global, not tenant-scoped, uncached — D-3.10).
All vendor modules are tenant-scoped and write an audit row on create.

## Components
- `VendorForm` (client; `useActionState`; vendor_type `<select>`).
- `TradeCoverageForm` (client; trade `<select>` from `listActiveTrades`, scope `<select>`, primary checkbox).
- `ServiceAreaForm` (client; `useState` on `area_type` swaps the visible value fields — only the relevant fields submit).
- **Reused/generalized:** `ContactForm` + `ContactList` (now own `ContactActionState`; shared with clients), `LocationForm` (now takes `action` + `cancelHref`; shared with clients).

## Conventions reinforced
- Feature code authorizes via `requireTenant()` (Phase 1 D-1.8), never by reading the session directly.
- Parent-in-tenant guard before any parent→child create; branch-scope creates also assert `location.vendorId === vendorId`.
- All writes audited with the `<entity>.<verb>` action convention (R-3.12).
- Generic form components own their action-state contract; domain actions conform (one-way dependency).

## Forward pointers
- Phase 5 dispatch will add a cross-vendor matching query against `vendor_service_areas` (not an extension of `listVendorServiceAreas` — D-3.12) and consume `vendor_compliance`.
- Phase 10 vendor portal will reuse the vendor model for external vendor users.
