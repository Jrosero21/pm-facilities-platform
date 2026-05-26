# Phase 5 — Business Rules

Rules introduced in Phase 5, each with the reasoning behind it. Inherits Phase 0–4 rules (source-agnostic, server-side DB access, tenant-scoping, `<entity>.<verb>` audit naming, parent-in-tenant guards, RESTRICT on reference FKs, the audit-inside-txn vs `writeAuditLog` split R-4.5, dependent-picker remount R-4.12, create-returns-fresh-row R-4.7, global-vs-tenant reference split R-4.1).

## R-5.1 — Vendor matching is advisory; the operator picks every dispatch
- The matcher surfaces capable + in-area + compliance-eligible **candidates**, ranked best-first; it never auto-dispatches. The operator chooses the vendor.
- **Why:** Phase 5 is a decision-support tool, not an automation. Aggregator-designated primary vendors + auto-dispatch routing are a future feature (L-5.1). This also keeps the design §2.9-compatible: a future AI agent drafts; a human sends. (D-5.9.)

## R-5.2 — Matching is equality-geo + non-blocking-compliance in v1 (both with sunset triggers)
- Geo match is equality on `national`/`state`/`city`/`postal_code`; `radius` and `county` service areas are **inert**. Compliance is **non-blocking** when absent (`no_data` is eligible); only an active `expired`/`non_compliant` row excludes.
- **Why / sunset:** radius needs client-location coordinates, county needs a county column, hard-gating needs compliance data — none exist yet. Each flips on when its data lands. These are temporary v1 behaviors, not permanent rules. (D-5.1/D-5.2; L-5.4/L-5.5.)
- Candidate ranking is **primary-trade → tightest-geo (postal>city>state>national) → name**; no performance/proximity ranking in v1. (D-5.4.)

## R-5.3 — A dispatch is captured at DRAFT, then SENT (draft-then-send)
- `createDispatch` lands the assignment at **DRAFT** (operator workspace); a separate `sendDispatch` moves it to **SENT** (the vendor is notified). The create form has **no status picker** — DRAFT is automatic.
- **Why:** operator review before the vendor is notified; and forward-compatibility with §2.9 (an AI agent may draft, but a human sends — the agent never auto-sends). (D-5.9/D-5.24.)

## R-5.4 — `createDispatch` (single-entity, 3-write txn); `sendDispatch` (dual-entity)
- **`createDispatch`** — one transaction: assignment (DRAFT) + `job_vendor_assignment_status_history` (null→DRAFT) + `audit_logs` (`job_vendor_assignment.created`). **No `job_events` row.**
- **`sendDispatch`** — one transaction: assignment→SENT + `sent_at`; status_history (DRAFT→SENT); audit (`job_vendor_assignment.sent`); `job_events` (`job.dispatched`); **conditionally** the job-side advance (status→DISPATCHED + `job_status_history` + audit `job.dispatched`).
- **Why:** creating a draft has no job-side effect and shouldn't put noise on the timeline; sending touches both entities. Splitting isolates the dual-entity complexity. Both put audit **inside** the txn (multi-row atomic write, R-4.5/D-5.22). (D-5.24.)

## R-5.5 — `job_events` is the milestone timeline, not an action log
- Operator workspace actions (drafts, edits to non-current state, internal staging) write to typed tables + audit only — **they do not write `job_events`**. `job_events` entries read like a story of the job's lifecycle, not a transcript of every operator action.
- **Why:** a draft that's later abandoned would leave a phantom "vendor assigned" line that Phase 6's chatbot summarization could surface to clients. The timeline's discipline matters most when AI consumes it downstream. **Forward pointer:** Phase 7 AI scope drafting writes to a typed scope-history table + audit (not `job_events`) until approved; Phase 8 invoice drafting likewise. (D-5.24.)

## R-5.6 — `job_events.event_type` prefers specific domain verbs over generic transition verbs
- Use `job.dispatched` (and `job.created`, `job.completed`, …), **not** generic `job.status_changed`. The generic verb is a fallback only — for an operator manually transitioning a status with no specific domain action driving it.
- **Why:** domain verbs make the timeline read naturally for operators and downstream AI. The typed `from→to` lives in `job_status_history`; the event carries the domain narrative. **Phase 5 event vocabulary added:** `job.dispatched`. (Sharpens R-4.11.)

## R-5.7 — Parent-before-child lock order (project-wide multi-entity transaction convention)
- Multi-entity transactions lock rows **parent → child** (e.g. job → assignment → assignment-children). `sendDispatch` locks the job `FOR UPDATE`, then the assignment `FOR UPDATE`, then re-checks both under the locks.
- **Why:** a single fixed lock order prevents deadlocks when concurrent operators transition related entities. **This is the canonical pattern** — Phase 6 review-and-publish, Phase 7 AI scope approval, Phase 8 invoice + job-close all follow it. (D-5.12.)

## R-5.8 — Workflow transitions are explicit, never implicit side effects
- An operation that *could* logically advance a status does not silently do so. `sendDispatch` advances the job only on its designed transition (NEW/SCHEDULED → DISPATCHED) and never does collateral changes (e.g. it does **not** lift an ON_HOLD).
- **Why:** every status change should have a deliberate operator action attached — preserves audit clarity, prevents cross-workflow coupling. **Forward pointer:** Phase 6 note publication, Phase 7 scope approval, Phase 8 invoice creation do not silently advance job status. (D-5.11/D-5.13.)

## R-5.9 — Dispatchable set vs advance set (the specific codes)
- **DISPATCHABLE** (sendDispatch accepts): `NEW`, `SCHEDULED`, `DISPATCHED`, `IN_PROGRESS`, `ON_HOLD`. Terminal (`COMPLETED`/`CANCELLED`/`CLOSED`) → `JOB_NOT_DISPATCHABLE`.
- **ADVANCE-TO-DISPATCHED** (sendDispatch moves the job): `NEW`, `SCHEDULED` only. From `DISPATCHED` it's a no-op; from `IN_PROGRESS`/`ON_HOLD` the job status is unchanged (never regress IN_PROGRESS; never auto-lift a hold).
- **Why:** dispatching is allowed across an active job's life (re-dispatch, multi-trade, mid-job additions) but must not roll the job's lifecycle backward. (D-5.10.)

## R-5.10 — "Primary" refers ONLY to the vendor's primary trade, never an aggregator-designated primary vendor
- The matcher's `primaryTradeMatch` = the matched coverage row is the vendor's primary trade specialty (R-3.6). UI copy says **"Primary trade: HVAC"**, never bare "primary."
- **Why:** bare "primary" reads as "our primary vendor for this job" — a future auto-dispatch feature that doesn't exist. Scoping the word now keeps the precedent clean for every future vendor-characteristic surface. (D-5.14; L-5.1.)

## R-5.11 — Forms pre-select the most likely / only / best option (pre-fill discipline)
- Single-candidate pickers render as selected-with-context rather than required-selection; multi-candidate pickers pre-select the top-ranked; single branch/contact auto-select; multiple contacts pre-select the primary; scheduled-start defaults to tomorrow 9 AM; scope is pre-filled.
- **Why:** every blank field is a decision operators have to make; every pre-fill eliminates a decision where one is obvious. **Phase 5 introduced this discipline; forward phases apply it.** (D-5.15.)

## R-5.12 — `dispatch_scope` is an operator-editable immutable snapshot
- The new-dispatch form pre-fills the scope from `approvedScopeOfWork ?? scopeOfWork ?? problemDescription`; the operator may edit; `createDispatch` stores the submitted value, **immutable thereafter**.
- **Why:** the dispatched scope is what the vendor was told to do at dispatch time. The job's own scope columns keep evolving (Phase 6 updates, Phase 7 AI generation) — that's a different artifact. Changing a sent dispatch's scope requires a Phase 8 change order. When the pre-fill falls back to the problem description, the form label says so (D-5.23). (D-5.5.)

## R-5.13 — Status badge colors are semantic and uniform app-wide
- `dispatch_assignment_statuses.category` → color: `draft`→neutral, `pending`→**amber** (awaiting vendor response — operator-action-blocking), `active`→blue (vendor engaged), `completed`→green, `cancelled`→red (declined or cancelled). Same palette everywhere; never varied per page.
- **Why:** color is a scanning aid carrying meaning. The amber "pending" is the operator-action signal. (D-5.16.)

## R-5.14 — `sort_order` uses 10-step values (forward convention; don't renumber Phase 4)
- `dispatch_assignment_statuses.sort_order` = 10, 20, … 90, leaving room to insert without renumbering. Phase 4's `job_statuses` (1–8 sequential) is a tolerated predecessor inconsistency — **not** retroactively renumbered.
- **Why:** future insertions shouldn't churn existing rows or cross-doc references; the cleanup cost of retrofitting Phase 4 outweighs the benefit. (D-5.17.)

## R-5.15 — `dispatch_messages` is content + metadata only; the recipient + delivery layers are Phase 6
- The table has **no recipient fields and no delivery-tracking fields** — not `recipient_contact_id`, `recipient_email`, CC/BCC, `delivered_at`, or `read_at`. It records what was written (`direction`, `message_type`, `subject`, `body`, `visibility`, `sent_by_user_id`, `status`). The recipient for an assignment's messages is implicitly the assignment's `vendor_contact_id`.
- **Why:** Phase 5 doesn't send (the operator forwards manually); the recipient-routing + delivery layer is a cohesive Phase 6 concern. Keeping a half-built recipient field here would only leak that concern into Phase 5. `message_type` is a `varchar(64)` vocabulary; `direction` (outbound/inbound, default outbound) is added now so Phase 6 doesn't backfill. (D-5.18/D-5.19; L-5.2.)

## R-5.16 — `declined` and `cancelled` are distinct codes in one category; check tables are two
- DECLINED and CANCELLED are distinct status codes (decline-rate is computable from the code) sharing `category = 'cancelled'` (operational grouping where they behave identically). `vendor_check_ins` and `vendor_check_outs` are two tables with identical v1 schemas (roadmap-aligned; diverge when real divergence happens).
- **Why:** category groups; code is precise. Two check tables follow the roadmap and stay minimal rather than pre-building speculative check-out columns. (D-5.20/D-5.21.)
