# Phase 4 — Decisions

Decisions locked in during Phase 4. Builds on Phase 0–3 decisions. Dense — the central operational entity touches many concerns. Each notes the limitation it creates where relevant (cross-linked to `10-known-limitations.md`).

## D-4.1 — `priorities` tenant-scoped, `job_statuses` global (inverts D-3.1 for one, follows it for the other)
- **Why:** The global-vs-tenant split follows a principle: **GLOBAL** = data the platform's own code reasons about semantically (`trades` for capability matching; `job_statuses` for state machines / dispatch / analytics); **TENANT-SCOPED** = data that encodes a tenant's business semantics the platform doesn't itself reason about (`priorities`). Trades stayed global (D-3.1); priorities **invert** that because aggregators customize priority meaning; statuses **follow** D-3.1 because the platform drives lifecycle off them.
- **How to apply:** `priorities` carries `tenant_id` NOT NULL + unique `(tenant_id, code/name)`; `job_statuses` has no `tenant_id` + global unique `(code)`/`(name)`, mirroring `trades`. **Forward pointer:** future status taxonomies (`dispatch_assignment_statuses` Phase 5; `proposal_statuses` / `invoice_statuses` / `change_order_statuses` Phase 8) follow the **global** pattern.

## D-4.2 — Nullable `description` column on reference tables
- **Why:** Carries operator-facing intent (tooltip / picker subtext / status banner) without hardcoding copy in the frontend; nullable so future rows aren't blocked on copy at migration time.
- **How to apply:** `priorities.description` and `job_statuses.description` are `varchar(255)` NULL, seeded with operator-facing copy. Pattern for all reference tables going forward. **`trades` lacks it** — a Phase 3-era gap; a one-line ALTER + backfill someday (`10-known-limitations.md`).

## D-4.3 — Tenant-scoped external-mapping shape (Phase 12 forward pointer)
- **Why:** The §12 argument that external mappings stay 2-D lands inside a tenant context: an aggregator's ServiceChannel account is theirs, not shared. So `external_priority_mappings` / `external_status_mappings` will be keyed `(tenant_id, external_system_id, external_value → internal_value_id)` — 2-D *within* a tenant. This is why tenant-scoping `priorities` doesn't break external mapping.
- **How to apply:** No Phase 4 code; documented so Phase 12 doesn't re-litigate the global-vs-tenant question for priorities/statuses.

## D-4.4 — `source_type` is a DB enum carrying all 8 values from day one
- **Why:** Source-agnostic is a core product rule (§2.1). Locking the full channel vocabulary at the DB layer from day one means jobs are source-agnostic now, not retrofitted.
- **How to apply:** `jobs.source_type` enum(`manual`, `internal_client_portal`, `external_client_portal`, `email_ingestion`, `forwarded_email`, `api`, `preventative_maintenance`, `snow_event`) NOT NULL default `manual`; `source_external_id` varchar(255) nullable. **ServiceChannel is NOT a `source_type` value** — it maps to the generic `external_client_portal` channel; the specific external system is recorded later via Phase 12's `external_systems` / `external_work_order_links`. (Anchor sentence for every future chat that proposes adding `servicechannel` to the enum — don't.)

## D-4.5 — `job_number` is a per-tenant monotonic sequence via a counter table
- **Why:** A human-facing id the roadmap requires; per-tenant so each aggregator's numbering is independent; gapless/monotonic so it reads as a real work-order number.
- **How to apply:** `tenant_job_sequences` (tenant_id PK, next_number) is read `SELECT … FOR UPDATE` and bumped **inside the createJob transaction** (R-4.3/R-4.4). UUID stays the PK; `job_number` is the display id, unique `(tenant_id, job_number)`. Per-tenant prefix display (e.g. "DEMO-00001") deferred — a render-time concern, not built now.

## D-4.6 — `scope_generation_status` is `varchar(32)`, not an enum
- **Why:** Phase 7 owns the scope-generation lifecycle; pre-committing its vocabulary in an enum would force a migration when Phase 7 designs the real states. Mirrors the `audit_logs.action` flexible-vocabulary precedent.
- **How to apply:** `varchar(32)` NOT NULL default `not_started`. Phase 4 vocabulary = `not_started` only; Phase 7 documents and populates the rest.

## D-4.7 — Trade and priority are form-required but DB-nullable on jobs
- **Why:** The manual create flow requires a trade + priority (operator triage), but non-manual intake (email/API) may arrive unclassified — forcing NOT NULL columns would block source-agnostic intake.
- **How to apply:** `jobs.primary_trade_id` / `priority_id` are nullable columns; `createJobAction` requires them at the form level. Loosen the form for intake paths later, not the column.

## D-4.8 — `is_archived` boolean, distinct from `current_status_id`
- **Why:** Record lifecycle ("is this job-record live in lists?") and workflow state ("New/Completed/Closed/…") are orthogonal axes (the R-3.11 two-status principle). Overloading the workflow status with archival would lose information.
- **How to apply:** `jobs.is_archived` boolean NOT NULL default false; list queries filter `is_archived = false`. No archive UI in Phase 4 — the column exists for when one is built.

## D-4.9 — Business timestamps are `datetime`; audit timestamps are `timestamp`
- **Why:** `scheduled_start_at`/`scheduled_end_at`/`due_at`/`completed_at`/`closed_at` are business times that can be years out or far past — `timestamp`'s 2038 ceiling and implicit TZ conversion are wrong for them. `created_at`/`updated_at` are DB-managed audit times where `timestamp` + `defaultNow`/`onUpdateNow` is right.
- **How to apply:** the five business columns are `datetime` (nullable); `created_at`/`updated_at` stay `timestamp`. Mixing is deliberate.

## D-4.10 — `job_notes` and `job_attachments` carry `visibility` from day one
- **Why:** Anything an operator adds to a job that might eventually be shared externally needs a visibility axis; adding the column now avoids a backfill on populated tables when Phase 6 builds the visibility-control workflows.
- **How to apply:** both tables carry `visibility` enum(`internal_only`, `vendor_visible`, `client_visible`, `client_and_vendor_visible`, `requires_review`) NOT NULL default `internal_only`. Phase 4 only ever sets `internal_only`. **Broader rule:** anything shareable externally carries a `visibility` column from day one — forward pointer to Phase 5 `dispatch_messages` and Phase 6 communication tables.

## D-4.11 — `event_type` is `varchar(64)` with a documented vocabulary, not an enum
- **Why:** The job-event vocabulary grows every phase (5/6/7/8 each add events); an enum would force a migration each time. Mirrors `audit_logs.action`.
- **How to apply:** `job_events.event_type` varchar(64); vocabulary documented in `06-business-rules.md` R-4.11 and `07-chatbot-knowledge.md`. Phase 4 events: `job.created`, `job.status_changed`, `job.priority_changed`, `job.trade_changed`, `job.note_added`, `job.contact_added`.

## D-4.12 — Defer two `jobs` indexes per D-3.11 discipline
- **Why:** `(tenant_id, due_at)` (Phase 5 SLA/overdue view) and `(tenant_id, source_type)` (Phase 9/12 source analytics) have no consumer yet; the consuming query defines the right composite. Adding now would likely pick the wrong shape.
- **How to apply:** not created in Phase 4; flagged in `10-known-limitations.md` L-4.6.

## D-4.13 — No uniqueness on `source_external_id` at the column level
- **Why:** "one external WO id → one internal job" is a Phase 12 invariant with richer rules (per external_system, mapping logic, idempotency keys) — it belongs in the `external_work_order_links` linking table, not a column constraint.
- **How to apply:** `source_external_id` has no unique index. (Can't be hit in Phase 4 — no external integrations exist yet.) Don't add `UNIQUE(tenant_id, source_type, source_external_id)` thinking it helps; Phase 12 owns duplicate detection.

## D-4.14 — The initial `job_status_history` row carries `changed_by_user_id = creator`
- **Why:** Treating the first row as a transition (null → NEW by user X) rather than an initialization marker makes "who set this job's current status?" queryable uniformly for every row.
- **How to apply:** `createJob` writes the initial history row with `from_status_id = null`, `to_status_id = NEW`, `changed_by_user_id = creator`. Same convention applies to `job_priority_history` / `job_trade_history` when they get their first rows (Phase 5+).

## D-4.15 — Audit-inside-txn for multi-step writes; `writeAuditLog()` outside for single-row
- **Why:** `createJob` is a multi-row atomic write (job + status_history + event + audit) where consistency across all four matters more than individual-row resilience — if audit is outside and fails, you get a job with history/event but no audit row, a quiet integrity hole. A single-row mutation is retroactive observation of an already-committed change, where the swallow-errors helper is right.
- **How to apply:** **multi-step writes that include history/event rows → `tx.insert(auditLogs)` inside the transaction** (atomicity). **single-row mutations → `writeAuditLog()` outside** (resilience, swallows errors). The distinguisher is "does the audit row need to be atomic with related history/event rows," not preference. **Forward pointer:** Phase 5 `createDispatch` (assignment + status_history + event + audit) follows the createJob pattern; Phase 6 single-row add-note may use `writeAuditLog`. (R-4.5.)

## D-4.16 — Eager seed + lazy ensure for `tenant_job_sequences`
- **Why:** Complementary, not redundant. The eager seed (one row per tenant at next_number=1) establishes the "every active tenant has a sequence row" invariant and keeps verification clean; the lazy `ON DUPLICATE KEY UPDATE` ensure in `createJob` handles edge cases (seed missed, tenant created without the hook, manual recovery).
- **How to apply:** `db/seeds/job-reference.ts` seeds the Demo Aggregator's row; `createJob` ensures the row exists inside the txn before locking it.

## D-4.17 — Tenant-scoped `*_NOT_FOUND` errors (no cross-tenant existence leak)
- **Why:** Returning a distinct "exists but not in your tenant" error would leak cross-tenant existence. The guards return `*_NOT_FOUND` for **both** a non-existent id and a cross-tenant id.
- **How to apply:** `getClient`/`getLocation`/`getPriority`/`getJob` are tenant-scoped (null on cross-tenant); the create paths throw `*_NOT_FOUND` uniformly. Don't "improve" by distinguishing not-found from cross-tenant (same as Phase 3 vendor coverage).

## D-4.18 — Create functions return a freshly-read row
- **Why:** Relying on DB-managed `created_at`/`updated_at` means those values aren't known without a read-back; constructing the row in-memory would omit them and risk drift from DB defaults.
- **How to apply:** `createJob` → `getJob` reload; `createJobContact`/`createJobNote` re-select the inserted row. Mirrors Phase 3 `createVendor`. Canonical "create returns a read-back row" convention.

## D-4.19 — `getJobDetail` is a purpose-built one-query join, distinct from lean `getJob`
- **Why:** The detail page needs five FK labels (client/location/trade/priority/status names); one join beats six round-trips and keeps composition in the data layer, not the view. `getJob` stays lean for guards + the createJob reload.
- **How to apply:** `getJobDetail(tenantId, id)` joins the label names (row-level equivalent of `listJobs`). It's narrow by design — Phase 5/6/9 detail/dashboard reads will write their own purpose-built queries rather than reuse it. Not establishing a "must reuse" pattern.

## D-4.20 — Dependent-picker remount pattern (`<select key={parentId}>`)
- **Why:** When a child picker's options depend on a parent selection (location depends on client), switching the parent must atomically reset the child to avoid a stale cross-parent selection.
- **How to apply:** `JobForm` ships all tenant locations and filters client-side by selected client (option d); the location `<select>` is `key={clientId}` so it remounts (resetting to its placeholder) on client change. **Forward pointer:** Phase 5's vendor → vendor-location picker reuses this pattern (R-4.12). Client-side filtering scales to dozens; switch to async fetch at hundreds (`10-known-limitations.md` L-4.4).

## D-4.21 — `getTrade(id)` helper for parent-guard consistency
- **Why:** `createJob` needs a trade existence check. The other four parent guards (`getClient`, `getLocation`, `getPriority`, `getJobStatusByCode`) are helpers; adding `getTrade` keeps all five uniform rather than leaving one inline query. Phase 5 (dispatch) and Phase 8 (billing) will reuse the same "does this trade exist?" lookup.
- **How to apply:** `getTrade(id)` in `src/server/trades.ts` — global (no tenant parameter, mirrors `getJobStatusByCode`); returns `TradeRow | null`. `createJob`'s trade guard calls it (added in batch 4c; the inline query it replaced is gone).

## D-4.22 — Completed vs Closed are distinct terminal statuses
- **Why:** Phase 8 billing lets multiple invoices land against a **Completed** job before it moves to **Closed**. Collapsing them would lose the "work done but not yet billed/closed" state. At the DB level both are `category = 'completed'` and `is_terminal = true`; the distinction is workflow semantics, not a schema difference.
- **How to apply:** seeded into `job_statuses` with descriptive copy — Completed = "Vendor has marked the work complete. Awaiting closeout, invoicing, or final review."; Closed = "Job is fully closed including all closeout documents, invoicing, and final review. No further activity expected." (`06-business-rules.md` R-4.9.) **Forward pointer:** Phase 8 invoicing workflows reference this distinction (a Completed job accepts invoices; Closed does not).
