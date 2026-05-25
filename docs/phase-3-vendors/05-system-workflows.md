# Phase 3 — System Workflows

How vendors/contacts/locations/coverage flow at runtime, and **why** each step is shaped the way it is. Mechanics-only descriptions live in `09-api-routes.md`; this file is about reasoning. Builds on Phase 2's workflows — the vendor spine reuses the same server-action → guard → insert → audit shape.

## WF-3.1 — Create a vendor
```
/vendors/new (VendorForm, client component)
  → createVendorAction(prev, formData)          [server action, "use server"]
  → requireTenant()                              resolves active tenant + identity
  → validate name present
  → parse vendor_type: missing → "local"; present-but-invalid → reject ("Invalid vendor type")
  → createVendor({ tenantId, name, vendorCode, vendorType, …, createdByUserId })
       → vendorCode normalized to UPPERCASE (trim → toUpperCase → null if empty)
       → INSERT vendors (id = app-generated UUID v7)
       → writeAuditLog("vendor.created")
  → revalidatePath("/vendors") → redirect("/vendors/[id]")
```
**Why this shape:**
- *Server action + `requireTenant()` first:* identical reasoning to Phase 2 WF-2.1 — DB access stays server-side, the active tenant is derived from the live session (never client-supplied), and the write is bound to `ctx.activeTenant.tenantId`.
- *Reject invalid `vendor_type` instead of defaulting:* a missing value sensibly defaults to `local`, but a *present* unrecognized value signals a bug or tampering — surfacing it (rather than silently coercing) makes bad input visible (`02-decisions.md` D-3.14).
- *Uppercase the code in the data layer, not the action:* so seeds and future importers normalize too, matching how `country` is already handled (`06-business-rules.md` R-3.3).
- *Audit on create:* "who created what, when, in which tenant" stays reconstructable (analytics-from-day-1).

## WF-3.2 — Create a vendor contact / location (parent-in-tenant guard)
```
createVendorContactAction(vendorId, …)          createVendorLocationAction(vendorId, …)
  → requireTenant()                               → requireTenant()
  → validate name                                 → validate name + required address fields
  → createVendorContact(...)                      → createVendorLocation(...)
       → getVendor(tenantId, vendorId)  ← guard        → getVendor(tenantId, vendorId)  ← guard
            missing → throw VENDOR_NOT_FOUND               missing → throw VENDOR_NOT_FOUND
       → INSERT vendor_contacts                        → location_code UPPERCASED; country uppercased/US
       → audit "vendor_contact.created"               → INSERT vendor_locations
  → revalidatePath("/vendors/[id]") → return null      → audit "vendor_location.created"
                                                    → revalidate + redirect to the locations list
```
**Why the parent guard:** `vendorId` comes from the URL and could point at another tenant's vendor. Re-fetching it through the tenant-scoped `getVendor` proves the caller may attach a child before we insert one — the cross-tenant defense for every parent→child create (same as Phase 2 WF-2.2). The contact form returns `null` (stays on the detail page; the list re-renders in place); the location create redirects to the locations list.

## WF-3.3 — Add trade coverage (multi-guard create)
```
/vendors/[id]/coverage (TradeCoverageForm)
  → createTradeCoverageAction(vendorId, prev, formData)
  → requireTenant(); read tradeId, vendorLocationId (null = vendor-wide), isPrimary
  → createVendorTradeCoverage(...)
       1. getVendor(tenantId, vendorId)              → VENDOR_NOT_FOUND
       2. trade exists in global trades              → TRADE_NOT_FOUND
       3. if scoped: getVendorLocation + belongs to this vendor → LOCATION_NOT_FOUND
       4. if isPrimary: existing non-archived primary? → PRIMARY_EXISTS (reject)
       5. if vendor-wide: existing (vendor, trade, NULL)? → DUPLICATE_COVERAGE
          (branch-scoped dupes are caught by the unique index → ER_DUP_ENTRY)
       → INSERT vendor_trade_coverage
       → audit "vendor_trade_coverage.created"
  → action maps each error code to a friendly message; revalidatePath; return null
```
**Why this guard order:** identity/existence first (vendor, trade, location), then the *rule* checks (single-primary, duplicate). The single-primary check runs before the duplicate check so a second-primary attempt fails with the most specific reason (`PRIMARY_EXISTS`) rather than a generic duplicate. The org-wide duplicate is checked in code because MySQL's unique index treats `NULL` `vendor_location_id` as distinct, so it cannot stop two vendor-wide rows for the same trade on its own (`06-business-rules.md` R-3.5/R-3.6).

## WF-3.4 — Add a service area (discriminator validation in the action)
```
/vendors/[id]/coverage (ServiceAreaForm, client component with useState on area_type)
  → createServiceAreaAction(vendorId, prev, formData)
  → requireTenant(); validate area_type ∈ {radius,postal_code,city,county,state,national}
  → switch(area_type): require + read ONLY that type's value fields; null the rest
       radius   → center lat/lng + radius_miles (numeric-checked)
       postal   → postal_code
       city     → city + state_code (uppercased)
       county   → county_name + state_code (uppercased)
       state    → state_code (uppercased)
       national → (no value fields)
  → createVendorServiceArea(input)
       → getVendor guard (+ getVendorLocation guard if scoped)
       → INSERT vendor_service_areas
       → audit "vendor_service_area.created"
  → revalidatePath; return null
```
**Why the discriminator validation lives in the action, not the DB or data layer:** MySQL cannot express "these columns are required *only* when `area_type = radius`" (no conditional NOT NULL — `06-business-rules.md` R-3.7). The action is the natural create-path validator: it already parses the form, knows the form field names, and produces user-facing errors. It also **nulls the irrelevant columns**, so a `state` row never carries stray radius values. The form is a **client component** whose `area_type` `<select>` drives `useState` to render only the relevant fields — so only those fields are submitted, and a stale value from a previously-selected type can't leak in.

## WF-3.5 — Render the coverage screen (all-or-nothing load)
```
/vendors/[id]/coverage (server component)
  → requireTenant(); getVendor → notFound() if missing/cross-tenant
  → Promise.all([ listActiveTrades(), listVendorLocations(),
                  listVendorTradeCoverage(), listVendorServiceAreas() ])
  → render two sections (trade coverage, service areas), each list + add-form
```
**Why `Promise.all`:** the four reads are independent, so they run concurrently. It is **all-or-nothing** — if any rejects, the page errors rather than rendering a partial view. Acceptable for Phase 3's scale and simplicity; Phase 9 dashboard work may revisit with `Promise.allSettled` + per-section error states (`02-decisions.md` D-3.10). `listActiveTrades()` is a **global, uncached** read (no `tenant_id`) on every render — deliberately not cached (D-3.10); the trade list is tiny.

## WF-3.6 — Cross-tenant protection on vendor pages
```
Every vendor page: getVendor(tenantId, id) → tenant-scoped (null if cross-tenant) → notFound()
Coverage/location creates: getVendorLocation(tenantId, locId) AND assert loc.vendorId === vendorId
```
**Why the extra `loc.vendorId === vendorId` check:** `getVendorLocation` already enforces the tenant, but a branch-scoped coverage/area also names a vendor. Asserting the location actually belongs to *this* vendor stops a valid-but-mismatched scope (right tenant, wrong vendor's branch) from attaching. Same defense-in-depth as Phase 2 WF-2.4.

## WF-3.7 — Seed the global trades list
```
pnpm db:seed:trades  →  db/seeds/trades.ts
  for each of the 15 starter trades:
    code = code.trim().toUpperCase()
    if no trade with that code exists → INSERT trades (no audit row)
```
**Why seed, idempotent on `code`, no audit:** `trades` is global reference data needed before any vendor can have coverage, and it has no operator UI (`06-business-rules.md` R-3.4). Keying idempotency on the uppercase `code` makes the seed safe to re-run and additive (re-running never duplicates or overwrites). Seeding is bootstrap, not an operator action, so it writes no `audit_logs` rows — unlike every UI create.

## WF-3.8 — Component reuse via the generalized forms
```
ContactForm(action, submitLabel)          ← owns ContactActionState; used by client + vendor contacts
LocationForm(action, cancelHref)          ← owns LocationActionState; used by client + vendor locations
```
**Why generalize:** the contact and location forms had no real domain-specific data shape — only the bound create-action and a cancel/redirect path differed. Making the neutral component own its action-state contract and accept the bound action + paths as props lets vendors reuse them with **no new components** (the parent id is bound into the action by the caller). The one-way dependency is component → domain actions. Phase 4 (`job_contacts`) can follow the same pattern (`07-chatbot-knowledge.md`).
