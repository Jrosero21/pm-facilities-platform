# Phase 4 — Business Rules

Rules introduced in Phase 4, each with the reasoning behind it. Inherits Phase 0–3 rules (source-agnostic, server-side DB access, tenant-scoping, audited auth, soft-delete, `<entity>.<verb>` audit naming, parent-in-tenant guards, RESTRICT on reference FKs).

## R-4.1 — Reference data split: tenant-scoped vs global by principle
- `priorities` are **tenant-scoped**; `job_statuses` are **global** (like `trades`).
- **Why:** GLOBAL = data the platform's own code reasons about semantically (statuses drive state machines / dispatch / analytics; trades drive capability matching). TENANT-SCOPED = data that encodes a tenant's business semantics the platform doesn't itself reason about (priorities). Future status taxonomies (Phase 5/8) follow the global pattern; tenant-customizable vocabularies follow the tenant-scoped pattern. (D-4.1.)

## R-4.2 — Jobs are source-agnostic; `source_type` is a fixed channel vocabulary
- Every job has a `source_type` from the 8-value enum, default `manual`. The internal job model is identical regardless of origin — external portals, email, and API are input channels that set `source_type`.
- **ServiceChannel is not a `source_type` value.** It maps to the generic `external_client_portal`; the specific external system is recorded via Phase 12's `external_systems` / `external_work_order_links`.
- **Why:** §2.1 — the app owns the core workflow; sources are channels. Keeping the enum generic (not vendor-specific) is what makes the app source-agnostic rather than ServiceChannel-centric. (D-4.4.)

## R-4.3 — `job_number` is a per-tenant monotonic sequence, allocated under a row lock
- `job_number` is a per-tenant integer (`unique (tenant_id, job_number)`), allocated from `tenant_job_sequences` via `SELECT … FOR UPDATE` **inside** the createJob transaction, then the counter is bumped.
- **Hard rule:** allocation happens only inside the job-insert transaction, with the counter row locked `FOR UPDATE`. No outside-transaction allocation, no application-level locks. The row is ensured to exist via `INSERT … ON DUPLICATE KEY UPDATE` before the lock.
- **Why:** the row lock serializes concurrent creates so numbering is gapless and unique; doing it in-transaction makes the number atomic with the job. (D-4.5 / D-4.16.)

## R-4.4 — The canonical `createJob` transaction (7 steps, in order)
Every job creation runs these seven steps in **one** DB transaction, in this order:
1. Ensure the tenant's sequence row (`INSERT … ON DUPLICATE KEY UPDATE next_number=next_number`).
2. Lock + read it (`SELECT next_number … FOR UPDATE`) → `n`.
3. Insert the job (`job_number = n`, `current_status_id = NEW`).
4. Bump the counter (`next_number = n + 1`).
5. Insert the initial `job_status_history` row (`from_status_id = NULL`, `to_status_id = NEW`, `changed_by_user_id = creator`).
6. Insert the `job_events` row (`event_type = 'job.created'`).
7. Insert the `audit_logs` row (`action = 'job.created'`) — directly via `tx.insert`.
- **Why:** the four written rows (job + history + event + audit) plus the counter bump must be atomic — any partial state is corrupt. This is the template for every future multi-step create (Phase 5 `createDispatch`). (D-4.15.)

## R-4.5 — Audit placement: inside the txn for multi-step writes, `writeAuditLog()` for single-row
- **Multi-step writes that include history/event rows** → audit via `tx.insert(auditLogs)` **inside** the transaction (atomicity over resilience). E.g. `createJob`.
- **Single-row mutations** (retroactive observation of an already-committed change) → audit via `writeAuditLog()` **outside** any transaction (resilience over atomicity — the helper swallows errors so audit never breaks the main flow). E.g. `createJobContact`, `createJobNote`.
- **The distinguisher** is "does the audit row need to be atomic with related history/event rows," not preference. **Why:** an outside-txn audit on a multi-row write could leave a job with history/event but no audit row — a quiet integrity hole worse than a rollback-and-retry. (D-4.15.)

## R-4.6 — `*_NOT_FOUND` errors are tenant-scoped (no cross-tenant existence leak)
- `CLIENT_NOT_FOUND` / `LOCATION_NOT_FOUND` / `PRIORITY_NOT_FOUND` / `JOB_NOT_FOUND` etc. are returned for **both** a non-existent id and a valid-but-cross-tenant id.
- **Why:** a distinct "exists but not in your tenant" response would leak cross-tenant existence (information disclosure). Don't "improve" the errors by distinguishing the two cases. (D-4.17; same as Phase 3 vendor coverage.)

## R-4.7 — Create functions return a freshly-read row
- `createJob` returns `getJob(...)`; `createJobContact`/`createJobNote` re-select the inserted row.
- **Why:** DB-managed `created_at`/`updated_at` (and any DB defaults) aren't known without a read-back; constructing the row in-memory would omit or drift from them. Canonical convention (mirrors Phase 3 `createVendor`). (D-4.18.)

## R-4.8 — `is_archived` (record lifecycle) is distinct from `current_status_id` (workflow state)
- A job carries both a workflow status (`current_status_id` → `job_statuses`, e.g. New/Completed/Closed) and a soft-delete flag (`is_archived`). List queries default to `is_archived = false`.
- **Why:** "is this job-record live in lists?" and "what workflow state is the job in?" are orthogonal axes — a Closed job is still a live record you want in history/analytics; archiving hides a record without changing its workflow meaning. (R-3.11 principle, D-4.8.)

## R-4.9 — Completed vs Closed are distinct terminal statuses
- **Completed** = the vendor has marked the work done; paperwork/invoicing/final review may still be pending. **Closed** = everything done including closeout documents, invoicing, and final review; no further activity expected.
- **Why:** Phase 8 billing lets multiple invoices land against a **Completed** job before it moves to **Closed**. Collapsing the two would lose the "work done but not yet billed/closed" state. (Both are `category = completed`, both `is_terminal = true`.)

## R-4.10 — Anything shareable externally carries a `visibility` column from day one
- `job_notes` and `job_attachments` carry `visibility` (5-value enum, default `internal_only`). Phase 4 only ever sets `internal_only`.
- **Why:** adding the column now avoids a backfill on populated tables when Phase 6 builds visibility-control workflows. The rule generalizes: anything an operator adds that might be shared with vendors/clients gets a `visibility` column at creation — forward pointer to Phase 5 `dispatch_messages` and Phase 6 communication tables. (D-4.10.)

## R-4.11 — `job_events.event_type` is a documented string vocabulary, not an enum
- `event_type` is a `varchar(64)`. **Phase 4 vocabulary:** `job.created`, `job.status_changed`, `job.priority_changed`, `job.trade_changed`, `job.note_added`, `job.contact_added`.
- **Why:** the vocabulary grows every phase (5 adds `job.vendor_assigned`, `job.eta_confirmed`; 6 adds comms events; 7 scope events; 8 billing events) — an enum would force a migration each time. Phases 5/6/7/8 each add their own event types without a migration, documenting them as they land. Mirrors `audit_logs.action`. (D-4.11.)
- **v2.11.0 (job edit) adds:** `job.location_changed` and `job.scope_updated` (the latter covers a `problem_description` and/or `scope_of_work` edit; metadata lists which changed). The previously-reserved `job.priority_changed` / `job.trade_changed` now actually fire (from `updateJob`). The NTE edit is a **billing** event (`nte.adjusted`, `job_billing_events`), not a `job_events` row.

## R-4.12 — Dependent pickers remount on parent change (`<select key={parentId}>`)
- When a child picker's options depend on a parent selection, the child `<select>` is keyed by the parent id so a parent change remounts it, atomically resetting the child selection.
- **Why:** prevents submitting a stale child selection that no longer belongs to the chosen parent (e.g. client A's location after switching to client B). The server-side parent-match guard remains as defense-in-depth. Phase 5's vendor → vendor-location picker reuses this. (D-4.20.)

## R-4.13 — Trade and priority are form-required but DB-nullable
- The manual create form requires a trade + priority; the `jobs.primary_trade_id` / `priority_id` columns are nullable.
- **Why:** manual entry triages trade/priority up front, but non-manual intake (email/API) may arrive unclassified — a NOT NULL column would block source-agnostic intake. Enforce at the form, not the column. (D-4.7.)

## R-4.14 — History tables record the initial value as a transition, with the actor
- The first `job_status_history` row is `from_status_id = NULL → to_status_id = NEW`, `changed_by_user_id = creator`. Same convention for `job_priority_history` / `job_trade_history` when their first rows are written.
- **Why:** treating the initial row as a transition (not an init marker) makes "who set this job's current status/priority/trade?" queryable uniformly across every row. (D-4.14.)

## R-4.15 — Reference + sequence rows must exist per tenant (seed-on-creation deficit)
- A tenant needs seeded `priorities`, `job_statuses` (global, shared), and a `tenant_job_sequences` row before jobs can be created cleanly. Phase 4 hand-seeds the Demo Aggregator.
- **Why / carry-forward:** there is no "seed on tenant creation" hook yet (Phase 1) — all three depend on it. Until then, a new tenant would have empty priority/status pickers and (absent the lazy ensure) no sequence row. The `createJob` lazy `ON DUPLICATE KEY` ensure covers the sequence row defensively; priorities/statuses have no such fallback. (L-4.5.)
