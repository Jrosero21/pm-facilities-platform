# Phase 3 — User SOP

Procedures for an aggregator user (operator/tenant_admin) managing vendors, locations, contacts, and coverage. All screens live under the protected `(app)` shell and act within your active tenant.

## SOP-3.1 — Create a vendor
1. Nav bar → **Vendors** → **New vendor**.
2. Enter a **Name** (required), pick a **Vendor type** (Local / Regional / National — defaults to Local), and optionally a **Vendor code** (e.g. `SBHVAC-001`), legal name, phone, email, website, tax ID, notes.
3. **Create vendor** → you land on the vendor's detail page.
4. Notes: the **vendor code is stored uppercase** and must be unique in your tenant (case-insensitively) — a duplicate returns "A vendor with that code already exists in this tenant." **Vendor names are not required to be unique** — two vendors named "ABC Plumbing" are allowed; use the code to tell them apart.

## SOP-3.2 — View vendors
- **Vendors** lists all non-archived vendors in your tenant by name, with type, code, and status. Click a name to open its detail page (fields + Locations card + Coverage card + Contacts section).

## SOP-3.3 — Add a contact to a vendor
- On the vendor detail page, use the **Add a contact** form (name required; optional title/email/phone, "Primary contact" checkbox, notes). Contacts appear in the vendor's table, primary first.

## SOP-3.4 — Add a location (branch) to a vendor
1. On the vendor detail page → **Locations** card → **Add location** (or **Manage** → **New location**).
2. Enter the location **Name**, optional **code** (stored uppercase), and address: **Address line 1**, **City**, **State/province**, **Postal code** required; line 2 optional; **Country** defaults to `US`.
3. **Create location** → you return to the vendor's locations list. Locations are listed (name, code, address, status); there is no per-location detail page in this phase.

## SOP-3.5 — Add trade coverage
1. Open the vendor → **Manage coverage** (or the Coverage card) → `/vendors/[id]/coverage`.
2. Under **Add trade coverage**: pick a **Trade**, a **Scope** ("All locations (vendor-wide)" by default, or a specific branch), and tick **Primary trade for this vendor** if this is the vendor's main trade.
3. **Add trade coverage** → the row appears in the trade-coverage table.
4. Notes: a vendor may have **only one primary trade** — adding a second primary returns "This vendor already has a primary trade; only one is allowed." Adding the exact same trade for the exact same scope twice is rejected as a duplicate. A vendor can cover many trades (add a row each).

## SOP-3.6 — Add a service area
1. Same screen, **Add service area**.
2. Pick an **Area type**; the form shows only the fields that type needs:
   - **Radius** — Center latitude, Center longitude, Radius (miles). (Enter the coordinates manually — locations don't store coordinates yet.)
   - **Postal code** — Postal code.
   - **City** — City + State.
   - **County** — County + State.
   - **State** — State.
   - **National** — no extra fields (covers the whole country).
3. Optionally give it a **Label** ("Phoenix metro", "TX regional") — the list shows the label when present, otherwise the raw values. Optionally scope it to a branch.
4. **Add service area** → the row appears in the service-areas table.
5. Note: overlapping areas are fine and additive — a vendor with "TX" and "75001" covers all of TX.

## What users cannot do yet
- Edit, archive, or delete vendors, contacts, locations, trade coverage, or service areas (create + view only this phase).
- Change which trade is a vendor's primary once set (no edit UI — would require support/DB).
- Add or edit trades (the trade list is fixed/seeded this phase).
- Open a vendor location detail page (locations are list-only).
- Enter vendor rates, documents, compliance records, or see performance scores (those tables exist but have no UI yet).
- Search, filter, or page through long lists.
