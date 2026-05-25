# Phase 4 — User SOP

Procedures for an aggregator user (operator/tenant_admin) creating and viewing jobs. All screens live under the protected `(app)` shell and act within your active tenant.

## SOP-4.1 — Create a job
1. Nav bar → **Jobs** → **New job**.
2. **Client** (required) — pick the client. The **Location** dropdown stays disabled ("Select a client first") until you choose a client, then lists only that client's locations. Switching client resets the location choice.
3. **Location** (required) — the branch/site the work is at.
4. **Trade** (required) — what kind of work (e.g. Plumbing, HVAC). **Priority** (required) — Emergency / Urgent / High / Routine / Scheduled (most-urgent first).
5. **Problem description** (required) — what's wrong, in plain language.
6. **Initial scope** (optional) — leave blank if not yet scoped.
7. **Create job** → you land on the new job's detail page. The job gets the next per-tenant **job number** (#1, #2, …) and starts at status **New**.
- Errors: the form requires client/location/trade/priority/problem; a mismatched client/location pair or an unknown reference returns a friendly message (e.g. "That location does not belong to the selected client.").

## SOP-4.2 — View jobs
- **Jobs** lists all non-archived jobs in your tenant, newest first, with job #, client, location, status, priority, and created date. Click a job # to open its detail page.

## SOP-4.3 — View a job's detail
The detail page shows: the job number + current status, the core fields (client, location, trade, priority, status, source, not-to-exceed), the problem description, the initial scope (if entered), the scheduling/completion timestamps, and three sections — **Contacts**, **Notes**, and a **Timeline** of events.

## SOP-4.4 — Add a contact to a job
- On the job detail page, **Add a contact** (name required; optional title/email/phone, "Primary contact" checkbox, notes). It appears in the job's contacts table, primary first.

## SOP-4.5 — Add a note to a job
- On the job detail page, **Add a note** (body required). It appears in the Notes list, newest first. All Phase 4 notes are **internal-only** — there is no visibility picker yet (notes are not shared with vendors or clients in this phase).

## Worked example — Job #1
In the `demo` tenant: a job created for client **Apple**, location **Apple 5th Ave**, trade **Plumbing**, priority **High**, status **New**, source **Manual**, problem "Toilet clog in main floor restroom. Water backing up. Reported by store manager." — with one contact (**Store Manager**) and one note ("Vendor dispatched for emergency response."). Its timeline shows a single **Job #1 created** event.

## What users cannot do yet
- Edit, archive, or delete jobs, contacts, or notes (create + view only this phase).
- Change a job's status, priority, or trade after creation (status transitions arrive with dispatch in Phase 5).
- Set note visibility (hardcoded internal-only; Phase 6).
- Attach files/photos to a job (the table exists but has no UI; gated on file-upload infrastructure).
- Dispatch a vendor, generate an AI scope, or invoice (Phases 5 / 7 / 8).
- Search, filter, or page through long job lists.
