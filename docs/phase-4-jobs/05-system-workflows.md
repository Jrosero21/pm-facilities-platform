# Phase 4 — System Workflows

How jobs flow at runtime, and **why** each step is shaped the way it is. Mechanics-only descriptions live in `09-api-routes.md`; this file is about reasoning. Builds on Phase 2/3 workflows — jobs reuse the server-action → guard → mutate → audit shape, but add the first **multi-row transactional create** and the first **per-entity history/event** writes.

## WF-4.1 — Create a job (the 7-step transaction)
```
/jobs/new (JobForm, client component)
  → createJobAction(prev, formData)            [server action, "use server"]
  → requireTenant()                             active tenant + identity
  → validate client/location/trade/priority/problem present (source_type implicitly 'manual')
  → createJob({ tenantId, clientId, clientLocationId, primaryTradeId, priorityId, problemDescription, scopeOfWork, createdByUserId })

      -- read-only parent-in-tenant guards (BEFORE the txn) --
      getClient(tenantId, clientId)                  → CLIENT_NOT_FOUND
      getLocation(tenantId, clientLocationId)         → LOCATION_NOT_FOUND
        assert location.clientId === clientId         → LOCATION_CLIENT_MISMATCH
      if priorityId: getPriority(tenantId, priorityId) → PRIORITY_NOT_FOUND   (tenant-scoped)
      if primaryTradeId: getTrade(primaryTradeId)      → TRADE_NOT_FOUND       (global)
      getJobStatusByCode("NEW")                        → STATUS_NOT_FOUND      (global; resolved here)

      -- one DB transaction (db.transaction) --
      1. INSERT tenant_job_sequences (tenant_id, 1) ON DUPLICATE KEY UPDATE next_number=next_number   (ensure)
      2. SELECT next_number … WHERE tenant_id=T FOR UPDATE        (lock; n = next_number)
      3. INSERT jobs (id=uuidv7, job_number=n, current_status_id=NEW, …)
      4. UPDATE tenant_job_sequences SET next_number = n+1
      5. INSERT job_status_history (from_status_id=NULL, to_status_id=NEW, changed_by_user_id=creator)
      6. INSERT job_events (event_type='job.created', actor_user_id=creator, summary=`Job #${n} created`)
      7. tx.insert(audit_logs) (action='job.created', target_type='job', target_id=jobId)   ← audit INSIDE the txn

  → reload via getJob (DB-managed timestamps) → revalidatePath("/jobs") → redirect("/jobs/[id]")
```
**Why this shape:**
- *Server action + `requireTenant()` first:* same as Phase 2/3 — DB access stays server-side, the active tenant is derived from the live session, the write is bound to `ctx.activeTenant.tenantId`.
- *Guards before, mutation inside:* the existence checks are read-only, so there's no point holding them inside the transaction; the transaction is just the 7-step write block.
- *Why one transaction:* the job and its initial history row, timeline event, and audit row must all land or none — a job with no status-history or a counter bumped without a job would be corrupt. Atomicity across the four rows is the whole point (D-4.15).
- *Why `FOR UPDATE` on the counter (step 2):* it serializes concurrent creates for the same tenant so `job_number` is gapless and unique — without the row lock, two simultaneous creates could read the same `n`. The `ON DUPLICATE KEY UPDATE` ensure (step 1) guarantees the row exists to lock (defense-in-depth alongside the eager seed — D-4.16).
- *Why audit via `tx.insert`, not `writeAuditLog()` (step 7):* `writeAuditLog` uses the global `db` and swallows errors (right for single-row retroactive audit). Here the audit row must be atomic with the job — so it's a direct `tx.insert(auditLogs)` inside the transaction. The trade-off (a failed audit insert rolls back the job) is deliberate (D-4.15 / R-4.5).
- *Why reload (`getJob`) at the end:* DB-managed `created_at`/`updated_at` aren't known without a read-back (D-4.18).

## WF-4.2 — Add a job contact (single-row, audit outside the txn)
```
createJobContactAction(jobId, prev, formData)   [reuses the generalized ContactForm / parseContact]
  → requireTenant(); validate name
  → createJobContact(...)
       → getJob(tenantId, jobId)   ← guard: job must exist IN THIS tenant → JOB_NOT_FOUND
       → INSERT job_contacts
       → writeAuditLog("job_contact.created")   ← OUTSIDE any transaction (single-row, swallows errors)
  → revalidatePath("/jobs/[id]") → return null (stay on page)
```
**Why audit outside here (contrast with WF-4.1):** adding a contact is a single-row mutation — retroactive observation of an already-committed insert. There are no sibling history/event rows that must be atomic with it, so the resilient `writeAuditLog()` (which never breaks the main flow) is correct. The distinguisher is "does the audit need to be atomic with related rows," not preference (R-4.5).

## WF-4.3 — Add a job note (visibility forced internal_only)
```
createJobNoteAction(jobId, prev, formData)   [JobNoteForm — body only, no visibility picker]
  → requireTenant(); validate body
  → createJobNote(...)
       → getJob guard → JOB_NOT_FOUND
       → INSERT job_notes (visibility = 'internal_only', forced in the data layer)
       → writeAuditLog("job_note.created")   ← single-row, outside the txn
  → revalidatePath("/jobs/[id]") → return null
```
**Why visibility is forced, not picked:** the column exists from day one (D-4.10) so Phase 6 doesn't backfill, but Phase 4 has no visibility-control workflow — so the operator can't yet choose a sharing level, and every note is `internal_only`. The form doesn't even submit a visibility field.

## WF-4.4 — Render the job detail page
```
/jobs/[id] (server component)
  → requireTenant(); getJobDetail(tenantId, id)   → notFound() if null (missing OR cross-tenant)
  → Promise.all([ listJobContacts, listJobNotes, listJobEvents ])
  → render: core fields + Contacts (ContactList + ContactForm) + Notes (list + JobNoteForm) + Timeline (events)
```
**Why `getJobDetail` (a join) instead of lean `getJob` + 5 lookups:** the header needs five FK labels (client/location/trade/priority/status names); one join beats six round-trips and keeps the composition in the data layer, not the page (D-4.19). `getJob` stays lean for guards/reload. **Why `Promise.all`:** the three child reads are independent → concurrent, and all-or-nothing — if any rejects the page errors rather than rendering partially (the all-or-nothing parallel-fetch pattern established in Phase 3, `02-decisions.md` D-3.10, its all-or-nothing bullet). Empty states: `ContactList` renders "No contacts yet."; notes render "No notes yet."; the timeline always has ≥1 event (`job.created`).

## WF-4.5 — The dependent-picker pattern (client → location)
```
JobForm (client component): all tenant clients + ALL tenant locations shipped as props
  useState(clientId); visibleLocations = locations.filter(l => l.clientId === clientId)
  <select name="clientId" value={clientId} onChange=…>
  <select key={clientId} name="clientLocationId" disabled={!clientId}>   ← keyed remount
```
**Why ship-all + client-side filter (option d), and why `key={clientId}`:** no fetch-on-change surface (no loading/error/race states), data ships once with the page render. The location `<select>` is `key={clientId}` so changing the client **remounts** it — atomically resetting any prior location selection, so you can never submit client A with a stale location from client B. The `LOCATION_CLIENT_MISMATCH` server guard (WF-4.1) remains as defense-in-depth — the client-side filter is UX, not security. This is the canonical dependent-picker pattern; Phase 5's vendor → vendor-location picker reuses it (R-4.12). Scaling note: fine for dozens of locations; switch to async fetch at hundreds (L-4.4).

## WF-4.6 — Cross-tenant protection & the `*_NOT_FOUND` convention
```
getJob / getJobDetail: WHERE tenant_id = ? AND id = ?  → null (never throws, never leaks)
create guards: getClient/getLocation/getPriority all tenant-scoped → *_NOT_FOUND on miss OR cross-tenant
```
**Why one error for two cases:** a non-existent id and a valid-but-cross-tenant id both return `*_NOT_FOUND`. Distinguishing them ("exists, but not yours") would leak cross-tenant existence. Don't "improve" the errors by separating the cases (D-4.17). Same defense as Phase 3.

## WF-4.7 — Reference seeding (per-tenant priorities, global statuses, sequence row)
```
pnpm db:seed:job-reference → resolves the demo tenant, then:
  priorities  → INSERT if (tenant_id, code) absent          (tenant-scoped, 5 rows)
  job_statuses→ INSERT if code absent                        (GLOBAL, 8 rows, once across the DB)
  tenant_job_sequences → INSERT (tenant_id, 1) if row absent (never resets an advanced counter)
```
**Why split seeding logic by table:** priorities are tenant-owned (keyed per tenant), statuses are global (keyed on code alone, mirroring trades), and the sequence row is per-tenant infra. All three need a "seed on tenant creation" hook that Phase 1 doesn't have yet — grouped as one carry-forward (L-4.5).
