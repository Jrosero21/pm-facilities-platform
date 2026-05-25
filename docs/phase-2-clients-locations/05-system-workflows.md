# Phase 2 — System Workflows

How clients/locations/contacts flow at runtime, and **why** each step is shaped the way it is. Mechanics-only descriptions live in `09-api-routes.md`; this file is about reasoning.

## WF-2.1 — Create a client
```
/clients/new (ClientForm, client component)
  → createClientAction(prev, formData)        [server action, "use server"]
  → requireTenant()                            resolves active tenant + identity
  → validate name present
  → createClient({ tenantId, name, clientCode, createdByUserId })
       → INSERT clients (id = app-generated UUID v7)
       → writeAuditLog("client.created")
  → revalidatePath("/clients") → redirect("/clients/[id]")
```
**Why this shape:**
- *Server action, not a client-side fetch:* all DB access stays server-side (Phase 0 D-0.3); the browser never holds a DB connection or a tenant claim it can forge.
- *`requireTenant()` first:* authorization is decided server-side against the live session, and the active tenant is derived there — the client cannot pass a `tenant_id`. Every write is bound to `ctx.activeTenant.tenantId`, never to anything user-supplied.
- *App-generated UUID v7 id:* MySQL has no `RETURNING`; generating the id in app code lets us return it for the redirect and reference it in the audit row without a second round-trip.
- *Audit on create:* so "who created what, when, in which tenant" is reconstructable later (analytics-from-day-1), even before per-entity history tables exist (Phase 4).

## WF-2.2 — Create a location (parent guard)
```
createLocationAction(clientId, prev, formData)
  → requireTenant()
  → validate name + required address fields
  → createLocation(...)
       → getClient(tenantId, clientId)   ← guard: client must exist IN THIS tenant
            if missing → throw CLIENT_NOT_FOUND → action returns friendly error
       → INSERT client_locations (tenant_id denormalized from the verified client)
       → writeAuditLog("client_location.created")
  → revalidate + redirect to the locations list
```
**Why the parent guard:** `clientId` comes from the URL and could point at another tenant's client. Re-fetching it through the tenant-scoped `getClient` proves the caller may act on it before we attach a child. This is the cross-tenant defense for every parent→child create.

## WF-2.3 — Create a contact (client-level or location-level)
```
createClientContactAction(clientId, ...)      createLocationContactAction(clientId, locationId, ...)
  → requireTenant()                             → requireTenant()
  → getClient guard                             → getLocation guard (tenant-scoped)
  → INSERT client_contacts                      → INSERT client_location_contacts
  → audit "client_contact.created"              → audit "client_location_contact.created"
  → revalidatePath("/clients/[id]")             → revalidatePath(".../locations/[locationId]")
  → return null (stay on page; list refreshes)
```
**Why return null instead of redirect:** the contact form lives *on* the detail page, so we revalidate that path and let the refreshed server component re-render the contacts list in place — no navigation needed.

## WF-2.4 — Cross-tenant protection on detail pages
```
Location detail: getLocation(tenantId, locationId)  → tenant-scoped (null if cross-tenant)
                 then assert location.clientId === id (URL's client)
                 either failure → notFound()
```
**Why the extra `clientId === id` check:** `getLocation` already enforces the tenant, but the URL also names a client. Asserting the location actually belongs to that client prevents a valid-but-mismatched URL (right tenant, wrong client) from rendering a location under the wrong client's breadcrumb.

## WF-2.5 — Soft delete (why no hard delete exists)
Lists query `status != 'archived'`. There is no delete path because Phase 4 jobs will reference clients/locations by id; a physical delete would orphan those references and erase operational history. Archival (a future UI) flips `status` to `archived`, hiding the row from lists while preserving the record and its audit trail. FK cascade behavior is in `06-business-rules.md` R-2.3.

## WF-2.6 — Migration generation pipeline
```
pnpm db:generate:
  drizzle-kit generate                  → SQL from the Drizzle schema
  → node fix-mysql-engine.mjs           → rewrite `);` to ENGINE=InnoDB ... (MariaDB defaults to MyISAM, which drops FKs)
  → node check-migration-identifiers.mjs → fail if any identifier > 64 chars (MySQL silently rejects them mid-apply)
```
**Why two post-processors:** both guard against silent, environment-specific MySQL/MariaDB failures that otherwise surface only as a half-applied migration. Making them part of `db:generate` means the safety runs every time, not by memory.
