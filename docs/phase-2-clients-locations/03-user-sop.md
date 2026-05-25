# Phase 2 — User SOP

Procedures for an aggregator user (operator/tenant_admin) managing clients and locations. All screens live under the protected `(app)` shell and act within your active tenant.

## SOP-2.1 — Create a client
1. Nav bar → **Clients** → **New client**.
2. Enter a **Name** (required) and optionally a **Client code** (e.g. `APPLE`).
3. **Create client** → you land on the client's detail page.
4. Errors: a name or code already used in your tenant returns "A client with that name or code already exists in this tenant." Names/codes are matched case- and accent-insensitively (so `Apple` and `apple` collide).

## SOP-2.2 — View clients
- **Clients** lists all non-archived clients in your tenant, by name, with code and status. Click a name to open its detail page.

## SOP-2.3 — Add a location to a client
1. Open the client → in the **Locations** card, **Add location** (or **Manage** → **New location**).
2. Enter the location **Name**, optional **code**, and the address: **Address line 1**, **City**, **State/province**, **Postal code** are required; line 2 optional; **Country** defaults to `US`.
3. **Create location** → you return to the client's locations list with the new row.

## SOP-2.4 — View a location
- From the client's **Locations** list, click a location name to open its detail page (full address + its contacts).

## SOP-2.5 — Add a contact
- **Client-level contact:** on the client detail page, use the **Add a contact** form (name required; optional title/email/phone, "Primary contact" checkbox, notes). It appears in the client's contacts table, primary contacts first.
- **Location-level contact:** on a location detail page, use the same form under **Location contacts**.

## What users cannot do yet
- Edit, archive, or delete clients, locations, or contacts (create + view only this phase).
- Set location operating hours, access notes, or billing rules (those tables exist but have no UI yet).
- Search, filter, or page through long lists.
