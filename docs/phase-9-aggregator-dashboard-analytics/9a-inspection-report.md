# Phase 9 — 9a Inspection Report

**Phase:** 9 — Aggregator Dashboard & Analytics MVP (target `v1.0.0-phase-9`)
**Gate:** 9a inspection sweep (design only; no code/schema/migrations/commits)
**Branch:** `phase-9-aggregator-dashboard-analytics` (cut off `main` @ `23e250c`)
**Date:** 2026-05-28
**Status of this doc:** inspection facts only — no design opinions. Opinions belong in the 9a proposal that follows review of this report.

> **Capture note.** All surfaces captured cleanly. Repo/schema/docs from direct inspection; live-DB numbers from an ephemeral read-only script (`scripts/verify-9a-inspection.ts`, run via `npx tsx --env-file=.env.local`) against **`jonnyrosero_pm`** (production — read-only SELECTs only; sandbox not needed for a read sweep). The script has been **deleted** post-capture per the ephemeral-verification-script discipline; all results are inlined below.
>
> **⚠️ Headline substrate finding:** the live DB holds **one tenant ("Demo Aggregator", type `aggregator`) and 3 jobs** of thin seed data. Several history substrates are **empty or near-empty** (`job_billing_events`=0, `job_priority_history`=0, `job_trade_history`=0; all billing tables=0; **every `jobs` business-time column — scheduled/due/completed/closed — is 100% NULL**). This does not block the read-heavy design, but it means Phase 9 analytics must (a) be authored to degrade gracefully on empty/sparse data, and (b) be **verified against synthetic/seeded data**, not production, since production has almost no signal to compute against. See the per-section numbers and the new flag #9 in the cross-cutting list.

---

## 1. Route surface — current `/dashboard` state

- **`/dashboard` already exists** as a Phase-1 stub: `src/app/(app)/dashboard/page.tsx`.
  - Server component. Calls `requireTenant()` (redirects unauthenticated → `/login`, no-tenant → `/no-tenant`).
  - Renders a `<dl>` of identity/context: user name+email, active tenant name+type, roles (comma-joined), membership count.
  - Footer text: *"Phase 1 dashboard stub. Real navigation and operational views begin in later phases."*
  - **This is the surface Phase 9 replaces/builds on.** No operational content today.
- **Root route** `src/app/page.tsx`: unauthenticated marketing-style landing — `<h1>PM Facilities Platform</h1>`, "Phase 1 …" subtitle, "Sign in" link → `/login`. Does **not** redirect an authenticated operator anywhere; it always renders the static landing.
- **Post-login landing = `/dashboard`.** Login page `src/app/(auth)/login/page.tsx` calls `signIn.email({ callbackURL: "/dashboard" })`. Auth handler: `src/app/api/auth/[...all]/route.ts` (Better Auth).
- **Route-group layout:** `(app)` = authenticated routes (dashboard, jobs, clients, vendors …); `(auth)` = login. The `(app)` layout is where tenant context / nav chrome lives.

---

## 2. Job-detail composition baseline

**File:** `src/app/(app)/jobs/[id]/page.tsx`. Server component; fetches via a battery of `list*`/`get*` server readers, then renders these sections top→bottom:

1. Breadcrumb (`Jobs / #{jobNumber}`)
2. Header — job number H1 + status badge
3. Key-fields grid — client, location, trade, priority, status, source, NTE
4. Problem description
5. Initial scope (conditional)
6. Timestamps grid — scheduled start/end, due, completed, closed, created
7. **Scope of work** — published steps + `ScopeDraftsSection` + `GenerateScopeButton`
8. **Dispatch** — `listAssignmentsForJob`; per-assignment status badge, vendor, schedule, NTE, facet line; "Dispatch a vendor" button
9. Contacts — `ContactList` + `ContactForm`
10. **Notes** — `listJobNotes` w/ visibility badges; `JobNoteForm`; `DraftClientUpdateButton`, `ShareNoteButton`
11. Update drafts — `UpdateDraftsSection` (rewriter)
12. **Communications** — `listCommunicationsForJob`; delivery badges; `DeliveryTransitionButtons`
13. **Billing summary** — `BillingSection` (margin + readiness)
14. Proposals — `ProposalList`
15. Change orders — `ChangeOrderList`
16. Vendor invoices (AP) — `VendorInvoiceList`
17. Client invoices (AR) — `ClientInvoiceList`
18. Payments — `LinkedPayments` + "Record payment"
19. Close billing — `CloseBillingButton` (accounting-gated)
20. **Timeline** — `JobTimeline` (merged job events + communications + notes + billing events)

**Acceptance-criterion read:** the Phase 9 criterion *"job detail contains timeline + dispatch + notes + billing basics"* is **already satisfied** by the existing page (sections 8, 10, 13–19, 20). Phase 9 likely adds **nothing** to job-detail except possibly aging/stalled annotation — to be decided in the proposal, not here.

---

## 3. History tables — the analytics substrate

All history tables confirmed present in schema (`src/server/schema/job-history.ts`, `dispatch-assignments.ts`, `communications.ts`, `billing-events.ts`, `audit-logs.ts`).

### 3a. Transition-capture shape (the critical question)

All four status-style history tables use the **`from_*_id` → `to_*_id` + `created_at`** shape (NOT `effective_from`/`effective_to`). Time-in-status is computed by **diffing consecutive `created_at` per (job/assignment), ordered ASC** — the next row's `created_at` is the current interval's end; the open (latest) interval ends at `NOW()`. First row has `from_*_id = NULL` (initial set). This is exactly the shape the roadmap's *time-in-status / time-to-dispatch / time-to-completion* analytics need. ✅

### 3b. Table-by-table (columns confirmed from schema)

| Table | Key columns | Indexes | Notes |
|---|---|---|---|
| `job_status_history` | id, tenant_id, job_id, from_status_id (nullable), to_status_id, changed_by_user_id (nullable), note, created_at | `(tenant_id, job_id)` | transition diff source for time-in-status |
| `job_priority_history` | …from_priority_id/to_priority_id… | `(tenant_id, job_id)` | priority change audit |
| `job_trade_history` | …from_trade_id/to_trade_id… | `(tenant_id, job_id)` | trade reassignment audit |
| `job_events` | id, tenant_id, job_id, event_type (varchar 64, **not enum**), actor_user_id, summary, metadata (json), created_at | `(job_id, created_at)`, `(tenant_id, job_id)` | unified timeline feed |
| `job_vendor_assignment_status_history` | id, tenant_id, assignment_id, from_status_id, to_status_id, changed_by_user_id, note, created_at | `(tenant_id, assignment_id)` | **keyed by assignment_id, not job_id** — join through `job_vendor_assignments` to reach job |
| `communication_logs` | id, tenant_id, job_id, channel, direction, source_type, source_id, visibility, summary, delivery_status, sent_at, delivered_at, read_at, status, created_at, updated_at | `(tenant_id, job_id, created_at)`, `(source_type, source_id)`, `(tenant_id, delivery_status)`, `(tenant_id, channel)`, `(tenant_id, recipient_type, recipient_id)` | rich; has its own `(tenant, delivery_status)` + `(tenant, channel)` indexes useful for comms analytics |
| `job_billing_events` | id, tenant_id, job_id, event_type (varchar 64), actor_user_id, summary, amount (dec 12,2), currency, proposal_id, change_order_id, vendor_invoice_id, client_invoice_id, payment_id, metadata, created_at | `(job_id, created_at)`, `(tenant_id, job_id)`, `(tenant_id, event_type)` | **`(tenant_id, event_type)` index already exists** — directly supports billing-flavored dashboard counts |
| `audit_logs` | id, tenant_id (nullable), user_id, actor_label, action, target_type, target_id, metadata, ip_address, user_agent, created_at | `(tenant_id)`, `(user_id)`, `(action)`, `(created_at)` | Phase-1 system audit; exists |

### 3c. Billing event taxonomy

`job_billing_events.event_type` is **varchar(64), not a DB enum** (documented vocabulary: `proposal.*`, `change_order.*`, `vendor_invoice.*`, `client_invoice.*`, `payment.recorded`, `nte.exceeded`, `nte.overridden`). The "21-type taxonomy" lives in code/docs, not as a column constraint. **Distinct values in live data: none — `job_billing_events` has 0 rows.** (No billing activity has been generated against the seed data, so the taxonomy can only be confirmed from code, not from data.)

`job_events` distinct types present: `job.created` (3), `job.dispatched` (1).

### 3d. Live row counts & samples

| Table | Live `COUNT(*)` |
|---|---|
| `job_status_history` | **4** |
| `job_priority_history` | **0** |
| `job_trade_history` | **0** |
| `job_events` | **4** |
| `job_vendor_assignment_status_history` | **2** |
| `communication_logs` | **2** |
| `job_billing_events` | **0** |
| `audit_logs` | **40** |

**Interval computability — CONFIRMED.** Busiest job (`019e61b8…`) ordered ASC shows the expected chain: row 1 `from=NULL → to=NEW @ 03:39:33`, row 2 `from=NEW → to=SCHEDULED @ 03:39:34`. The interval for the first status = row2.created_at − row1.created_at; the open interval = NOW − last.created_at. So `(next.created_at − this.created_at)` per ordered row is the correct time-in-status computation — **no schema change required.** (Caveat: seed transitions are 1 second apart — real durations will only appear with realistic data.)

**Sample shapes observed:**
- `job_status_history` — first row per job has `from_status_id = NULL`, `changed_by_user_id` populated, `note` NULL.
- `job_events` — `metadata` is JSON (e.g. `{"assignmentId":…,"vendorId":…}` on `job.dispatched`); `summary` human-readable ("Dispatched to Sunbelt HVAC").
- `job_vendor_assignment_status_history` — keyed by `assignment_id` (one assignment, DRAFT→SENT chain); must join via `job_vendor_assignments` to reach a job.
- `communication_logs` — 2 outbound `client_portal` rows, both `delivery_status='draft'` (never sent), rich recipient/visibility columns populated.
- `audit_logs` — 40 rows, action vocab like `scope_draft.published/approved/discarded` with JSON metadata; this is the richest history substrate present.

---

## 4. Phase 8 billing readers — what's already queryable

Directory: `src/server/billing/`. Reader functions (reuse, do not duplicate):

| File | Reader | Purpose |
|---|---|---|
| `client-invoices.ts` | `getClientInvoice`, `listClientInvoicesForJob`, `listClientInvoiceLineItems` | AR fetch |
| | `sumApprovedClientInvoiceTotals(tenantId, jobId)` | Σ sent AR (revenue input to margin) |
| | `resolveClientMarkupDefault` | markup prefill |
| `vendor-invoices.ts` | `getVendorInvoice`, `listVendorInvoicesForJob`, `listVendorInvoiceLineItems` | AP fetch |
| | `sumApprovedVendorInvoiceTotals(tenantId, jobId)` | Σ approved AP (cost input to margin) |
| `proposals.ts` | `getProposal`, `listProposalsForJob`, `listProposalLineItems` | proposal fetch |
| `change-orders.ts` | `getChangeOrder`, `listChangeOrdersForJob`, `listChangeOrderLineItems` | CO fetch |
| | `getEffectiveNte(tenantId, jobId)` | base snapshot + Σ approved CO |
| `nte.ts` | `resolveClientNteRule`, `listClientNteRules` | NTE ladder resolution / admin list |
| `payments.ts` | `getPayment`, `listPaymentsForClientInvoice`, `listPaymentsForVendorInvoice`, `listPaymentsForJob` | payment fetch |
| `events.ts` | `listJobBillingEvents(tenantId, jobId)` | financial timeline (actor-joined) |
| `close.ts` | `getBillingCloseReadiness(tenantId, jobId)` | advisory readiness + concern counts |
| `margin.ts` | `getJobMargin(tenantId, jobId)` | {revenue, cost, margin} per job (CF-8c.7.1, shipped 8c.8) |
| `totals.ts` | `roundHalfUp`, `computeLineExtended`, `computeMarkup` | pure calc helpers |
| `money.ts` | `isDecimalStr`, `assertCommonLineFields` | pure validators |
| `role-gates.ts` | `isAccountingRole(roleKeys, isSuperAdmin)` | pure accounting predicate |

**Gap for dashboard:** every reader above is **per-job** (`(tenantId, jobId)` signature). There is **no tenant-wide aggregate reader** (e.g. "count of pending client invoices across all jobs", "tenant AR/AP totals"). Phase 9's "invoice pending count" and billing-flavored cards will need **new tenant-scoped aggregate readers** — composed from the same tables, but not currently present. Flag for the proposal.

---

## 5. Job-list / queue surface

**File:** `src/app/(app)/jobs/page.tsx` → `listJobs(tenantId)` in `src/server/jobs.ts`.

- Query: select id, jobNumber, clientName, locationName, statusName, priorityName, createdAt; inner-join clients/locations/statuses, left-join priorities; `WHERE tenant_id = ? AND is_archived = false`; `ORDER BY created_at DESC`.
- UI: a plain `<table>` (Job#, Client, Location, Status, Priority, Created). Job# links to detail.
- **No filters, no sort controls, no search, no pagination, no aging/priority emphasis.** Returns all non-archived jobs in one fetch.

**Fork implication:** the Phase-9 "aggregator job queue" is materially more than today's `/jobs`. Open question for the proposal: extend `/jobs` with filter/sort/aging columns, or build a distinct `/dashboard` queue surface (or both). No decision here.

---

## 6. Reference data for cards

**`job_statuses` — GLOBAL, 9 rows** (ordered by `sort_order`):

| sort | code | name | category | is_terminal |
|---|---|---|---|---|
| 1 | NEW | New | open | no |
| 2 | SCHEDULED | Scheduled | open | no |
| 3 | DISPATCHED | Dispatched | in_progress | no |
| 4 | IN_PROGRESS | In Progress | in_progress | no |
| 5 | ON_HOLD | On Hold | on_hold | no |
| 6 | COMPLETED | Completed | completed | **yes** |
| 7 | CANCELLED | Cancelled | cancelled | **yes** |
| 8 | CLOSED | Closed | completed | **yes** |
| 9 | CLOSED_BILLED | Closed (Billed) | completed | **yes** |

**`priorities` — TENANT-SCOPED, 5 rows** (only the one tenant; ordered by `rank`, lower = more urgent): EMERGENCY (1), URGENT (2), HIGH (3), ROUTINE (4), SCHEDULED (5).

**`trades` — GLOBAL, 15 rows:** APPL, CARP, CLEAN, DOOR, ELEC, FLOOR, GLASS, HANDY, HVAC, LAND, LOCK, PAINT, PEST, PLUMB, ROOF (all `active`).

**`dispatch_assignment_statuses` — GLOBAL, 9 rows** (`sort_order` 10–90): DRAFT(draft), SENT(pending), ACCEPTED(active), DECLINED(cancelled, terminal), SCHEDULED(active), CONFIRMED(active), ON_SITE(active), WORK_COMPLETE(completed, terminal), CANCELLED(cancelled, terminal).

**Key design facts:**
- `job_statuses` carries **`category`** {open, in_progress, on_hold, completed, cancelled} and **`is_terminal`** — status cards can roll up by category and exclude the 4 terminal statuses (COMPLETED/CANCELLED/CLOSED/CLOSED_BILLED) from "open" counts **without hardcoding codes**. "Open jobs" = `is_terminal = false`.
- `priorities` is the **one tenant-scoped** reference table — priority cards must iterate the *active tenant's* set ordered by `rank`. Note collision-of-name: a `SCHEDULED` exists in **both** `job_statuses` and `priorities` (and `dispatch_assignment_statuses`) — they are distinct rows in distinct tables; don't conflate.
- `dispatch_assignment_statuses` (also category + is_terminal) is the substrate for time-to-dispatch / time-to-arrival (ON_SITE) / dispatch funnel metrics via `job_vendor_assignment_status_history`.

---

## 7. Role surface

- **Roles table** `src/server/schema/roles.ts`: `key` (unique), `label`, `scope` enum {global, tenant}, description. **Live list confirmed — 6 roles, exactly as the Phase-1 plan expected:**
  - `super_admin` — **scope `global`**
  - `tenant_admin` — scope `tenant`
  - `operator` — scope `tenant`
  - `accounting` — scope `tenant`
  - `vendor_user` — scope `tenant`
  - `client_user` — scope `tenant`
- **Auth context:** `src/server/auth-context.ts` exposes `AuthContext { user, sessionId, memberships, activeTenant, roleKeys[], isSuperAdmin }`.
  - `requireAuth()`, `requireTenant()` (→ `/no-tenant` if no active tenant), `requireRole(...allowed)`, `enforceAccountingGate(ctx)`.
- **Pure-predicate pattern confirmed** (Phase 8 §E discipline): `src/server/billing/role-gates.ts` → `isAccountingRole(roleKeys, isSuperAdmin)`. This is the model Phase 9 should follow for any dashboard role visibility (pure predicate + thin request guard).

---

## 8. Tenant-scoping pattern

- **Standard confirmed:** every read takes `tenantId` and filters `eq(TABLE.tenantId, tenantId)`; the request layer obtains it via `const ctx = await requireTenant(); ctx.activeTenant.tenantId`.
- Active tenant resolved from `pm_active_tenant` cookie, falling back to first/sole active membership.
- This is the **project-wide read-path standard** (seen across billing + jobs readers). Phase 9 aggregate readers must follow it: `fn(tenantId, …)` signature, tenant filter in every query.
- DB client: `src/server/db.ts` (drizzle + mysql2 pool, `DATABASE_URL`). Schema barrel: `src/server/schema/index.ts` (34 files).

---

## 9. The "stalled job" question — current substrate

- **No existing `stalled`/`aged`/`SLA`/threshold notion in schema or code.** No threshold tables. No business-rule doc defines aging windows.
- `docs/phase-4-jobs/06-business-rules.md`, `phase-5-dispatch/06-business-rules.md`, `phase-6-communications/06-business-rules.md`: **none** define aging/stalled/SLA durations. (Phase 4 R-4.4 only notes `due_at` uses `datetime` to avoid TZ conversion.)
- Forward-references that name Phase 9 as the consumer:
  - **Phase 4** `10-known-limitations.md`: `(tenant_id, due_at)` index (SLA/overdue) and `(tenant_id, source_type)` index (source analytics) **deliberately not created** — "consumer defines the right composite" → **Phase 9 adds them when the consuming query exists.**
  - **Phase 5** `08-db-changes.md`: Phase 9 may add dispatch analytics indexes (`sent_at`, status, vendor) and reconsider matcher correlated-subquery → JOIN/GROUP BY.
  - **Phase 3** `10-known-limitations.md`: `vendor_performance_scores` table to be computed in Phase 9.
  - **Phase 6** `10-known-limitations.md`: Phase 9 named for agent-run failure-rate monitoring + cumulative token-cost analytics + model-string normalization.
  - **Roadmap §8** Phase-9 AI capabilities (future): "identify stalled jobs / identify SLA risks."
- **Conclusion:** *stalled* and *aged* are **greenfield definitions for Phase 9 to author** (likely: aged = in current status > N days via latest `job_status_history.created_at`; stalled = no `job_events`/status change in > M days). Thresholds are a proposal decision — none are pre-locked.

---

## 10. Open carry-forwards that might interact with Phase 9

From `docs/phase-8-billing-proposals/closeout-carryforwards.md` (11 items). Only those touching dashboard/analytics/read-path:

- **CF-8c.8.3 — no test framework (FLAG).** Repo has no test runner / no `*.test.ts`; ephemeral `scripts/verify-*.ts` are the de-facto test layer. Phase 9 analytics aggregations (interval diffs, roll-ups) are correctness-sensitive — proposal should weigh whether to stand up a runner or continue the ephemeral-script pattern. (Also blocks CF-8c.8.1 runtime role-gate integration test.)
- All other CF-8c items (NTE archive event, multi-currency NTE, CO decision vocab, draft-discard writer, overpayment tracking, emergency_nte_multiplier, dispute-resolution writer) are **billing-internal and do not interact** with dashboard work.
- Cross-phase analytics carry-forwards (not in the 8c ledger but relevant): vendor_performance_scores (P3), dispatch analytics indexes + matcher rewrite (P5), agent-run failure/cost analytics (P6/P7). These are **candidate scope** for Phase 9 analytics — proposal decides what's MVP vs deferred.

---

## Cross-cutting flags for the proposal (facts, not decisions)

1. `/dashboard` is a live Phase-1 stub that **will be replaced** — not greenfield-empty.
2. Job-detail **already meets** its Phase-9 acceptance criterion; likely no job-detail work beyond optional aging annotation.
3. History tables use **`from→to` + `created_at`**, so interval analytics are computable by consecutive-row diffing — **no schema change needed** for time-in-status / time-to-* metrics.
4. Billing readers are **all per-job**; tenant-wide aggregate readers (invoice-pending count, AR/AP roll-ups) **do not exist yet** and must be added.
5. `job_statuses.category` + `is_terminal` enable status roll-ups without hardcoding codes; **`priorities` is tenant-scoped** (iterate per active tenant).
6. **No aging/stalled definition exists anywhere** — Phase 9 authors it from scratch.
7. Deferred indexes `(tenant_id, due_at)` and `(tenant_id, source_type)` were explicitly left for the consuming phase = Phase 9.
8. No test framework (CF-8c.8.3) — decide the verification approach for analytics correctness.
9. **Live substrate is one tenant + 3 jobs of thin seed data.** `job_billing_events` and all billing tables are empty; **all `jobs` business-time columns (scheduled/due/completed/closed) are 100% NULL**; priority/trade history empty. Consequences: (a) several roadmap metrics — *time-to-scheduled, time-to-completion, invoice-pending count* — currently have **zero data to compute from**; (b) the only non-trivial history substrate is `job_status_history` (4 rows) + `audit_logs` (40 rows); (c) Phase 9 must seed realistic synthetic data (sandbox DB) to develop/verify analytics, and every aggregate reader must render correctly at zero rows. This reinforces flag #8: a seed-then-verify harness is the natural Phase-9 verification approach.
