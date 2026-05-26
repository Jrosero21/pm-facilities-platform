# Phase 5 — Decisions

Decisions locked in during Phase 5. Builds on Phase 0–4 decisions. The densest set yet — dispatch touches matching, transactions, concurrency, UI copy, and the Phase 5/6 boundary. Each notes the limitation it creates where relevant (cross-linked to `10-known-limitations.md`).

## D-5.1 — Geo matching is equality-based; `radius` and `county` areas are inert
- **Why:** The matcher needs to compare a job's location against vendor service areas, but there are no client-location coordinates (Phase 2 L-2.8 / Phase 3 L-3.4) and no county column to compare. Equality on `national`/`state`/`city`/`postal_code` is exact and index-friendly; radius (needs coords + distance math) and county (needs a column) can't be evaluated yet.
- **How to apply:** `findCandidateVendorsForJobByFacets` matches `national` OR `state=state` OR `(city=city AND state=state)` OR `postal_code=postal`. `radius` / `county` service-area rows are **stored but never match** (inert). **Sunset:** flips on when coordinates (radius) / a county column (county) land. (L-5.4.)

## D-5.2 — Compliance is non-blocking when absent (`no_data`); only explicit bad statuses exclude
- **Why:** There are zero compliance rows in the demo data; hard-gating on compliance would exclude every vendor and make dispatch impossible. But a vendor with an *explicitly* expired/non-compliant active row should be excluded.
- **How to apply:** the WHERE clause excludes only vendors with an active `vendor_compliance` row in (`expired`,`non_compliant`); absence of any row → `complianceStatus = 'no_data'` (eligible). **TEMPORARY — sunset trigger:** when real compliance data starts landing, flip to compliance-required. Documented so this isn't mistaken for the permanent rule. (L-5.5.)

## D-5.3 — Trade-eligibility and geo-eligibility are independent vendor-level predicates
- **Why:** A vendor matches a job if it covers the trade **and** serves the area — but coverage and service-area are separate tables that may be scoped to different branches. Joining them strictly (trade-at-branch AND area-at-same-branch) would wrongly exclude vendors whose vendor-wide trade coverage pairs with a branch service area (or vice-versa). Phase 5 evaluates them as two independent vendor-level EXISTS predicates.
- **How to apply:** two independent correlated `EXISTS` subqueries (one over `vendor_trade_coverage`, one over `vendor_service_areas`), each honoring the branch-active rule (the contributing row is vendor-wide OR its parent `vendor_location` is active). The branch-join is **deferred and compensated in the UI** — the operator picks the branch, and `chosen_branch_covered_trade` records whether that branch covers the trade (D-5.8).

## D-5.4 — Candidate ranking: primary-trade → tightest-geo → name
- **Why:** Operators want the most-relevant vendor first. A vendor whose *primary* trade matches is more relevant than one for whom it's a secondary trade; a tighter geo match (postal > city > state > national) is more locally present; name is the stable tiebreaker.
- **How to apply:** `ORDER BY primaryTradeMatch DESC, tightestGeoRank ASC, name ASC` (postal=1 … national=4). No performance/proximity ranking in v1 (no perf data, no coordinates — L-5.6). Computed `sql` fragments are `.as()`-aliased so `ORDER BY` can reference them (a Drizzle correlated-subquery gotcha — documented in the `src/server/vendor-matching.ts` comments).

## D-5.5 — Dispatch-time facet snapshot (Option C: denormalized on the assignment)
- **Why:** *Why* a vendor was matched at dispatch time is audit-relevant and must not drift as the job/vendor data evolves. The job's trade can change (Phase 7), a vendor's coverage can change — but the dispatch should preserve what was true when it was made.
- **How to apply:** `job_vendor_assignments` carries `matched_trade_id`, `matched_trade_was_primary`, `tightest_geo_at_dispatch` (enum), `matched_geo_types_at_dispatch` (JSON), `compliance_status_at_dispatch` (enum), `chosen_branch_covered_trade` (nullable bool) — all **immutable** after create. Changing a sent dispatch's scope/match is a Phase 8 change order, not an in-place edit.

## D-5.6 — `matched_trade_id` is a snapshot, not a live pointer
- **Why:** It equals `jobs.primary_trade_id` at dispatch time, but the job's trade may change later (Phase 5+ trade-change workflows, `job_trade_history`). The assignment should record the trade it was matched against.
- **How to apply:** `matched_trade_id` NOT NULL → trades (RESTRICT); set from `job.primaryTradeId` in `createDispatch` and never updated. Schema comment marks it as a defensive snapshot. (D-5.5.)

## D-5.7 — `dispatch_assignment_statuses` is GLOBAL (applies the D-4.1 forward pointer)
- **Why:** The platform reasons about the dispatch lifecycle semantically (the matcher, `sendDispatch`'s state machine, analytics all branch on these codes) — so by the D-4.1 principle (GLOBAL = platform reasons about it; TENANT = encodes tenant business semantics) it's global, mirroring `job_statuses`/`trades`.
- **How to apply:** no `tenant_id`; global unique `(code)`/`(name)`; resolved by code via `getDispatchAssignmentStatusByCode` (mirrors `getJobStatusByCode`). D-4.1's explicit forward pointer ("dispatch_assignment_statuses Phase 5 follows the global pattern") is now realized.

## D-5.8 — `chosen_branch_covered_trade` is a dedicated query, not matcher output
- **Why:** The matcher's `tradeScope` (vendor_wide/branch/both) is **vendor-level**; this boolean is about *the specific branch the operator picked*, which may not be one of the covered branches. They can't be derived from one another.
- **How to apply:** `branchCoversTrade(tenantId, vendorLocationId, tradeId)` — one query against `vendor_trade_coverage` for an active branch-level row — run in `createDispatch`'s guards. `null` when no branch was chosen (vendor-wide dispatch).

## D-5.9 — Draft-then-send (createDispatch lands DRAFT; a separate sendDispatch sends)
- **Why:** Operators should review a dispatch before the vendor is notified (operator-review-before-notify). The roadmap §8 lists `draft` as the first status. **Dual-purpose:** this also makes the design forward-compatible with §2.9 (AI agents operate under policy, never mutate state directly) — a future AI agent (Phase 16) drafts the assignment; the operator does the send. The agent never auto-sends.
- **How to apply:** `createDispatch` → DRAFT (operator workspace, off the job timeline — R-5.5); `sendDispatch` → SENT (the milestone). Phase 16's chatbot dispatch flow plugs into this without modification.

## D-5.10 — "Dispatchable" and "advance-to-Dispatched" are two distinct status sets
- **Why:** "Can I send a dispatch from this job?" and "does sending advance the job to DISPATCHED?" are different questions. Advancing on *any* non-Dispatched status would regress a job (e.g. IN_PROGRESS → DISPATCHED rolls backward when a second vendor is dispatched mid-job).
- **How to apply:** **DISPATCHABLE** = {NEW, SCHEDULED, DISPATCHED, IN_PROGRESS, ON_HOLD} (sendDispatch accepts these). **ADVANCE-TO-DISPATCHED** = {NEW, SCHEDULED} only. From DISPATCHED it's a no-op; from IN_PROGRESS/ON_HOLD the job status is left unchanged. Terminal statuses (COMPLETED/CANCELLED/CLOSED) are rejected `JOB_NOT_DISPATCHABLE`. (R-5.9.)

## D-5.11 — Dispatching from ON_HOLD does NOT lift the hold
- **Why:** A hold's reason is unknown to the dispatch flow; silently lifting it on dispatch would be an implicit, unaudited status change. Lifting a hold is a deliberate operator decision.
- **How to apply:** ON_HOLD is dispatchable (the second vendor / mid-hold dispatch is legitimate) but **not** in the advance set — dispatching fires the assignment transitions + `job.dispatched` event, leaving the job in ON_HOLD. The operator lifts the hold via a future explicit `updateJobStatus`/`liftHold` action. (Generalized as D-5.13.)

## D-5.12 — Parent-before-child lock order (job → assignment) — project-wide convention
- **Why:** `sendDispatch` mutates two entities (the assignment and the job). Concurrent operators transitioning related entities can deadlock if different code paths acquire row locks in different orders. A single fixed order prevents this.
- **How to apply:** lock the **parent (job) `FOR UPDATE` first**, then the **child (assignment) `FOR UPDATE`**, then re-check both under the locks. **This is the canonical multi-entity transaction pattern** — Phase 6 review-and-publish, Phase 7 AI scope approval, Phase 8 invoice + job-close all follow parent-before-child. (R-5.7.)

## D-5.13 — Workflow transitions are explicit, never implicit side effects
- **Why:** Operations that *could* logically advance a status (dispatch potentially lifting a hold; invoice creation potentially closing a job; note publication potentially changing status) must not silently do so. Every status change should have a deliberate operator action attached — this preserves audit clarity and prevents accidental cross-workflow coupling.
- **How to apply:** `sendDispatch` advances the job only on the explicit, designed transition (NEW/SCHEDULED → DISPATCHED); it never does collateral status changes. **Forward pointer:** Phase 6 note publication, Phase 7 scope approval, Phase 8 invoice creation likewise do not silently advance job status. (R-5.8.)

## D-5.14 — "Primary" in the UI means the vendor's primary *trade*, never an aggregator-designated primary *vendor*
- **Why:** The matcher's `primaryTradeMatch` describes whether the matched coverage row is the vendor's self-described primary trade specialty (R-3.6). An operator reading bare "primary" would reasonably hear "our primary vendor for this job" — a future feature (aggregator designates a primary vendor per (client, location, trade) for auto-dispatch routing) that **does not exist** in Phase 5. Locking the copy now keeps the precedent clean for every future Phase 6/7/8 surface.
- **How to apply:** UI copy always says **"Primary trade: HVAC"** (or "Trade: HVAC (one of their trades)") — never bare "primary." `07-chatbot-knowledge.md` carries the disambiguation. The aggregator-designated-primary-vendor concept is deferred (L-5.1). (R-5.10.)

## D-5.15 — Form pre-fill discipline (single/best/sensible defaults pre-selected)
- **Why:** Every blank field is a decision the operator must make; pre-filling the obvious ones cuts the canonical dispatch to ~7 clicks. The matcher already ranks candidates, vendors often have one branch/contact, and a sensible schedule default exists.
- **How to apply:** single candidate → "selected" info panel (not a radio to click); multiple → radio-card list with the top-ranked pre-selected; single branch/contact → auto-selected; multiple contacts → primary pre-selected; scheduled-start defaults to tomorrow 9 AM; scope pre-filled (D-5.23). **Forward phases apply this discipline.** (R-5.11.)

## D-5.16 — Status badge colors carry semantic meaning, app-wide
- **Why:** Color is a scanning aid, not decoration. `pending` (sent, awaiting vendor) is the operator-action-blocking signal that deserves a distinct color (amber = "may need a nudge").
- **How to apply:** category → color, used everywhere identically: `draft`→neutral, `pending`→amber, `active`→blue, `completed`→green, `cancelled`→red. Don't vary per page. (R-5.13; `05-system-workflows.md` WF-5.4.)

## D-5.17 — `sort_order` uses 10-step values; Phase 4 is not renumbered
- **Why:** 10-step gaps (10, 20, …, 90) leave room to insert a status later without renumbering existing rows.
- **How to apply:** `dispatch_assignment_statuses.sort_order` = 10…90. Phase 4's `job_statuses` (1–8 sequential) is a minor predecessor inconsistency — **tolerate it, do not retroactively renumber** (the cross-doc cleanup cost outweighs the benefit). Forward convention. (R-5.14.)

## D-5.18 — `dispatch_messages` has NO recipient or delivery fields (Phase 5/6 boundary)
- **Why:** Phase 5 doesn't send; the operator forwards messages manually outside the system. Recipient routing (CC/BCC, address-book, channel-specific addresses) and delivery tracking (send/bounce/read) are a cohesive Phase 6 concern. A half-built `recipient_email`/`recipient_contact_id` here would leak that concern into Phase 5 and force Phase 6 to extend or work around it.
- **How to apply:** the table holds content + metadata only (`direction`, `message_type`, `subject`, `body`, `visibility`, `sent_by_user_id`, `status`). The recipient for an assignment's messages is implicitly the assignment's `vendor_contact_id`. (L-5.2; the recipient layer was deliberately dropped during the 5b review.)

## D-5.19 — `message_type` is `varchar(64)` vocabulary; `delivered_at`/`read_at` deferred
- **Why:** the dispatch-message vocabulary will grow (mirrors `job_events.event_type` / `audit_logs.action`); delivery timestamps belong to Phase 6's delivery layer (D-5.18).
- **How to apply:** `message_type` varchar(64) — Phase 5 vocab: `dispatch_notice`, `reminder`, `schedule_request`, `schedule_confirmation`, `cancellation`, `general`. `direction` enum(`outbound`,`inbound`) is added now (Phase 6 §9 structurally needs it; spares a backfill — same rationale as Phase 4's `job_notes.visibility`, D-4.10) defaulting `outbound`. No `delivered_at`/`read_at` columns.

## D-5.20 — `declined` and `cancelled` are distinct codes sharing the `cancelled` category
- **Why:** Decline-rate analytics need the distinct code, but operationally the two terminal-negative states behave identically (a grouping convenience). Category is the grouping axis; code is the precise state.
- **How to apply:** both seeded as distinct codes (DECLINED sort 40, CANCELLED sort 90), both `category = 'cancelled'`, both `is_terminal = true`. Splitting the category later (if Phase 9 surfaces a need) is an UPDATE, not a migration.

## D-5.21 — `vendor_check_ins` and `vendor_check_outs` are two tables with identical v1 schemas
- **Why:** The roadmap §8 lists them separately (source-of-truth); there's no reason to override that now. But check-outs will *probably* diverge (work_summary/signature/parts_used) — that's not a reason to pre-build those columns.
- **How to apply:** two tables, intentionally identical minimal shape (`occurred_at`, `note`, `recorded_by_user_id`). Divergent columns are added when real divergence happens (Phase 6/8), not preemptively. Roadmap-aligned + minimal + divergence-as-needed.

## D-5.22 — Audit-inside-txn for the multi-row dispatch writes (R-4.5 reused)
- **Why:** `createDispatch` (assignment + status_history + audit) and `sendDispatch` (assignment update + status_history + audit + event + conditional job-side rows) are multi-row atomic writes where the audit row must be atomic with its siblings — the same reasoning as `createJob`.
- **How to apply:** both use `tx.insert(auditLogs)` **inside** the transaction (not `writeAuditLog`). The createJob audit-rule split (D-4.15/R-4.5) carries forward unchanged.

## D-5.23 — Scope pre-fill falls back to the problem description, with a conditional label
- **Why:** Pre-filling scope from `approvedScopeOfWork ?? scopeOfWork` leaves the textarea blank when a job was created without a scope (common) — violating the pre-fill discipline (D-5.15). Falling back to the problem description keeps the field non-blank; a conditional label keeps the operator honest about what they're looking at.
- **How to apply:** `approvedScopeOfWork ?? scopeOfWork ?? problemDescription ?? ""`. When it falls through to the problem description, the label reads "(no scope written yet — using the problem description as a starting point — edit as needed)" instead of "(pre-filled from the job — edit as needed)". (Surfaced by the manual click-through; fix-forward commit.)

## D-5.24 — `createDispatch` is single-entity; `sendDispatch` is dual-entity
- **Why:** Creating a draft touches only the assignment (no job-side effect, no timeline noise); sending touches both the assignment and the job. Splitting them keeps `createDispatch` a clean 3-write txn (like `createJob` minus the counter) and isolates the dual-entity complexity in `sendDispatch`.
- **How to apply:** `createDispatch` = assignment + status_history(null→DRAFT) + audit(`job_vendor_assignment.created`), **no** `job_events` row (R-5.5 — drafts are operator workspace, not job milestones). `sendDispatch` = the dual-entity transaction (D-5.12). (R-5.4.)

## D-5.25 — Facet snapshot is re-derived server-side at submit, not submitted by the UI
- **Why:** The UI's matcher run is for display only; trusting client-submitted facets would risk stale or tampered snapshots. Re-deriving server-side guarantees the snapshot reflects what the matcher would say at dispatch time.
- **How to apply:** `createDispatch`'s guards call `findCandidateVendorsForJob`, find the chosen vendor's candidate row, and capture the facets; if the vendor is no longer a candidate (coverage archived between form-load and submit) it rejects `VENDOR_NO_LONGER_CANDIDATE`. The matcher is index-driven and cheap (5a EXPLAIN), so the re-derive cost is trivial.

## D-5.26 — No `(job_id, vendor_id)` uniqueness on `job_vendor_assignments`
- **Why:** A job legitimately accumulates multiple dispatches to the same or different vendors — re-dispatch after a decline, a second vendor for a multi-trade job, comparing competing offers. A unique `(job_id, vendor_id)` constraint would block these real workflows.
- **How to apply:** no uniqueness index; many rows per `(job, vendor)` allowed. The "one active dispatch per (job, vendor)" rule, if ever wanted, is a `createDispatch` workflow guard, not a DB constraint. (5b lock (c).)
