# Phase 4 — API Routes & Server Actions

## Pages (under the authenticated `(app)` route group)
- **`/jobs`** — job list (server component; `requireTenant()` + `listJobs`; columns job#/client/location/status/priority/created, newest first).
- **`/jobs/new`** — create form; server component loads pickers (`listClients`, `listClientLocationsForTenant`, `listActiveTrades`, `listPrioritiesForTenant`) and renders `JobForm`.
- **`/jobs/[id]`** — job detail: `getJobDetail` (header labels) + `Promise.all([listJobContacts, listJobNotes, listJobEvents])`; Contacts + Notes + Timeline sections. `notFound()` on missing/cross-tenant id.

Jobs nav link added to the `(app)` shell (Dashboard / Clients / Vendors / Jobs).

## Server actions (`src/app/(app)/jobs/`)
- **`createJobAction(prev, formData)`** — `actions.ts`. Requires client/location/trade/priority/problem at the form level (D-4.7; `source_type` implicitly `manual`). Calls `createJob`; maps `CLIENT_NOT_FOUND` / `LOCATION_NOT_FOUND` / `LOCATION_CLIENT_MISMATCH` / `TRADE_NOT_FOUND` / `PRIORITY_NOT_FOUND` / `STATUS_NOT_FOUND` to friendly messages; `revalidatePath("/jobs")`; redirects to `/jobs/[id]`.
- **`createJobContactAction(jobId, prev, formData)`** — `contact-actions.ts`. Reuses the generalized `ContactActionState` + `parseContact`; `JOB_NOT_FOUND` → friendly error; revalidates the detail path; returns null.
- **`createJobNoteAction(jobId, prev, formData)`** — `note-actions.ts`. Owns `JobNoteActionState`; body required; `JOB_NOT_FOUND` → friendly error; revalidates; returns null.

## Data layer (server-only modules)
- **`src/server/jobs.ts`** — `listJobs` (joined list labels), `getJob` (lean, tenant-scoped, for guards/reload), `getJobDetail` (joined single-row labels for the detail page), `createJob` (the 7-step transaction; **audit via `tx.insert(auditLogs)` INSIDE the txn**).
- **`src/server/job-reference.ts`** — `listPrioritiesForTenant` (tenant-scoped, by rank), `getPriority` (tenant-scoped guard), `listActiveJobStatuses` (global, by sort_order), `getJobStatusByCode` (global; resolves the initial NEW status).
- **`src/server/job-contacts.ts`** — `listJobContacts` (primary-first), `createJobContact` (job-in-tenant guard; **audit via `writeAuditLog()` OUTSIDE the txn** — single-row).
- **`src/server/job-notes.ts`** — `listJobNotes` (newest-first), `createJobNote` (job-in-tenant guard; `visibility` forced `internal_only`; **audit via `writeAuditLog()` outside**).
- **`src/server/job-events.ts`** — `listJobEvents` (oldest-first; left-joins users for actor name). Read-only — events are written inside `createJob`'s txn, no create fn.
- **`src/server/client-locations.ts`** — added `listClientLocationsForTenant` (lean `{id,clientId,name}`, tenant-wide; feeds the dependent location picker).
- **`src/server/trades.ts`** — added `getTrade(id)` (global existence guard; reused by Phase 5/8).

All job modules are tenant-scoped; reads return null on cross-tenant; creates throw tenant-scoped `*_NOT_FOUND` (R-4.6).

## Components
- `JobForm` (client; `useActionState` + `useState(clientId)`; ships all clients/locations, filters locations client-side, location `<select key={clientId}>` remounts on client change — R-4.12).
- `JobNoteForm` (client; body-only; no visibility picker).
- **Reused:** `ContactForm` + `ContactList` (job contacts — SOP-3.E).

## Conventions reinforced
- `requireTenant()` at the top of every action; parent-in-tenant guard before every parent→child create.
- Audit-rule split: `createJob` audit inside the transaction; contact/note audit via `writeAuditLog` outside (R-4.5).
- Create returns a freshly-read row (R-4.7). `<entity>.<verb>` audit naming (R-4.12 → R-4.11 vocab).

## Forward pointers
- Phase 5 dispatch adds `createDispatch` (assignment + status_history + event + audit in one txn — the `createJob` pattern) and status-transition functions (write `job_status_history` + `job_events` + audit together).
- Phase 6 adds the note-visibility workflow + the rich event timeline UI consuming `job_events`.
