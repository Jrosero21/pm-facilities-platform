# Phase 2 — API Routes & Server Actions

## Pages (under the authenticated `(app)` route group)
- **`/clients`** — client list (server component; `requireTenant()` + `listClients`).
- **`/clients/new`** — create form (`ClientForm` client component).
- **`/clients/[id]`** — client detail: fields, Locations card (count + links), Contacts section (list + add form).
- **`/clients/[id]/locations`** — location list for a client (names link to detail).
- **`/clients/[id]/locations/new`** — create-location form (`LocationForm`).
- **`/clients/[id]/locations/[locationId]`** — location detail: address + Location contacts (list + add form).

All call `requireTenant()`; detail pages `notFound()` on a missing or cross-tenant/cross-client id.

## Server actions
- **`createClientAction(prev, formData)`** — `src/app/(app)/clients/actions.ts`. Validates name; maps duplicate-key to a friendly error; `revalidatePath("/clients")`; redirects to the new client.
- **`createLocationAction(clientId, prev, formData)`** — `src/app/(app)/clients/location-actions.ts`. `clientId` bound in the form. Validates required address fields; maps `CLIENT_NOT_FOUND` + duplicate code; redirects to the locations list.
- **`createClientContactAction(clientId, prev, formData)`** and **`createLocationContactAction(clientId, locationId, prev, formData)`** — `src/app/(app)/clients/contact-actions.ts`. Shared field parsing; primary checkbox; revalidate the relevant detail path; return null (stay on page).

## Data layer (server-only modules)
- **`src/server/clients.ts`** — `listClients`, `getClient`, `createClient`.
- **`src/server/client-locations.ts`** — `listLocations`, `getLocation`, `createLocation` (guards client-in-tenant).
- **`src/server/client-contacts.ts`** — `listClientContacts`, `createClientContact` (guards client-in-tenant).
- **`src/server/location-contacts.ts`** — `listLocationContacts`, `createLocationContact` (guards location-in-tenant).
All are tenant-scoped and write an audit row on create.

## Components
- `ClientForm`, `LocationForm` (client components, `useActionState`).
- `ContactForm` (client; receives a bound server action as a prop — used for both client and location contacts).
- `ContactList` (server component; shared contacts table with a primary badge).

## Conventions reinforced
- Feature code authorizes via `requireTenant()` (Phase 1 D-1.8), never by reading the session directly.
- Parent-in-tenant guard before any parent→child create (cross-tenant defense).
- All writes audited with the `<entity>.<verb>` action convention.

## Forward pointers
- Phase 4 job creation will consume `getClient` / `getLocation` to populate client + location pickers, scoped by the active tenant.
