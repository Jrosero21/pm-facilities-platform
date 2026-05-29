# Phase 9 — 9a Design Proposal

**Phase:** 9 — Aggregator Dashboard & Analytics MVP (target `v1.0.0-phase-9`)
**Gate:** 9a design proposal (design only; no code/schema/migrations/commits)
**Branch:** `phase-9-aggregator-dashboard-analytics`
**Date:** 2026-05-28
**Predecessor:** `00-inspection-report.md` (reviewed + approved)
**Status:** **approved (2026-05-28).** All six forks resolved; this proposal is the authoritative reference for sub-batches 9b–9g. Each section ends with a resolved **Decision** line; the full resolution summary is in tail §A.

---

## Section 1 — Phase 9 scope statement

Phase 9 delivers the platform's **first complete internal aggregator MVP**: a `/dashboard` surface (roadmap §8 Phase 9, v1.0.0) where an aggregator operator sees, at a glance, the live operational state of their tenant's work — what's open, where it's stuck, what needs attention now — backed by basic operational analytics computed from the history substrates that Phases 4–8 already laid down. The roadmap acceptance criteria are: the aggregator can operate the basic workflow; the dashboard shows useful live counts; job detail contains timeline + dispatch + notes + billing basics (already satisfied — see §9); analytics use historical records where possible; phase docs updated.

Phase 9 is **read-heavy, not write-heavy**. The substrate exists; Phase 9 composes it. This inverts the Phase-8 weighting: the data-layer addition is small and additive (a handful of tenant-wide aggregate readers + two deferred indexes — §6, §8), while the bulk of the work is **composition, aggregation-query design, and dashboard UX** (cards, table widgets, an action-oriented queue, role-based section emphasis — §2–§5). There are essentially no new write paths and no new workflow state machines. The one new *business concept* — "stalled / aged" — is a read-time classification over existing timestamps, not a stored status (§5).

**Out of scope** (flag if it creeps in): client portal (Phase 11), vendor portal (Phase 10), external portal integrations (Phase 12), AI chatbot / assistant (Phase 16), advanced materialized analytics tables (beyond the two indexes), tenant-configurable thresholds, real-time / websocket updates, and advanced charting libraries. These are named explicitly in the tail "Out-of-scope reminders."

**Decision:** scope as stated. **Approved.**

---

## Section 2 — Route structure

The current `/dashboard` is a Phase-1 identity stub at `src/app/(app)/dashboard/page.tsx` and is the post-login landing (`signIn.email({ callbackURL: "/dashboard" })`). Phase 9 **replaces its body** while keeping the route and the `(app)` tenant-guarded layout.

The question is whether dashboard content forks by role at the *route* level or the *section* level.

- **A — single composed `/dashboard`, role-based section emphasis.** One route. The page renders all sections it's allowed to, gating individual sections by role: operator sees queue + status/priority cards + open-by-client/trade; accounting additionally sees AR/AP roll-ups (pending-invoice counts); tenant_admin/super_admin see both. Role gating is a pure predicate per section (the Phase-8 `isAccountingRole` pattern), not a router decision.
- **B — role-specific sibling routes** (`/dashboard/operator`, `/dashboard/accounting`, …). Each role lands on its own page; shared widgets imported across them.

Option B multiplies routes, duplicates layout, forces a post-login role-routing decision, and fights the "first *complete* internal aggregator MVP" framing where one operator often wears several hats. Option A is cheaper, keeps a single canonical landing, and defers any multi-page split to a later phase if dashboards grow.

**Decision:** single composed `/dashboard` with per-section role gating via pure predicates. **Approved.**

---

## Section 3 — The job queue: `/dashboard` vs `/jobs`

Phase 4 already ships `/jobs` as the tenant's full job inventory (`listJobs(tenantId)`: all non-archived jobs, newest-first, plain table, no filters/search/pagination — per inspection §5). Phase 9's "aggregator job queue" must not duplicate that.

Three shapes were considered:
- **(a) Separate action-oriented queue** — `/dashboard` hosts "what needs attention now": a bounded, urgency-ordered list (stalled / overdue / unassigned-high-priority / aged), distinct in *semantics* from `/jobs`. `/jobs` stays the inventory surface.
- **(b) Top-N preview of `/jobs`** — the dashboard just shows the newest N jobs, linking to `/jobs` for more. Adds little operational value; it's the same ordering as `/jobs`.
- **(c) Re-skin `/jobs` into the dashboard** — collapse the two. Loses the plain inventory view and overloads one surface.

Option (a) is the only one that earns its place: an **action surface** (triage queue) is categorically different from an **inventory surface** (searchable list). The queue answers "what should I touch first," `/jobs` answers "find me job X."

**Queue selection rule (authoritative; the composite is defined in §5):**
- Take the tenant's **open** jobs (`job_statuses.is_terminal = false`).
- Rank by **composite operational urgency** (§5): `stalled-now` > `overdue (past due_at)` > `unassigned + high-priority` > `aged-in-current-status`.
- Return the **top N = 20** (default; a single constant in the analytics module). Ties broken by longest time-in-current-status, then `created_at` ascending (oldest first).
- Each row links to `/jobs/[id]`; each row shows *why* it surfaced (its dominant urgency reason as a badge).

**`/jobs` filter extension (in scope for Phase 9).** The status and priority cards (§4) navigate to a *filtered* inventory: `/jobs?status=<id>` and `/jobs?priority=<id>`. `/jobs` has no filters today (inspection §5), so Phase 9 adds `?status=` and `?priority=` query-param support to the `/jobs` list. This is a small but explicit Phase-9 deliverable (sub-batch 9e) — the cards require it to be useful.

**Decision:** distinct action queue on `/dashboard`. `/jobs` remains as-is (the searchable inventory). N=20, ordered by composite urgency, tie-break longest-dwell-then-oldest. **Approved.**

---

## Section 4 — Status, priority, and "open jobs by X" cards

"**Open**" is defined once, structurally: `job_statuses.is_terminal = false`. The dashboard layer hardcodes **no status codes** — it iterates reference rows and uses the `category` / `is_terminal` affordances. (Live vocab from inspection §6: open statuses are NEW, SCHEDULED, DISPATCHED, IN_PROGRESS, ON_HOLD; terminal are COMPLETED, CANCELLED, CLOSED, CLOSED_BILLED.)

- **Status cards** — iterate global `job_statuses WHERE is_terminal = false`, ordered by `sort_order`. Each card = count of the current tenant's jobs at that status. Click → `/jobs` filtered to that status. (Implies `/jobs` gains a `?status=` filter — a small extension noted in the sub-batch plan, §B.) Cards may be visually grouped by `category` (open / in_progress / on_hold).
- **Priority cards** — `priorities` is **tenant-scoped**; iterate the *active tenant's* priorities ordered by `rank` (EMERGENCY=1 … SCHEDULED=5). Each card = open-jobs-at-priority count. Click → `/jobs?priority=`.
- **Open jobs by client** — **table widget**, not a card grid (clients are unbounded per tenant). Top N clients by open-job count, descending, with the count; "see all" link. A card grid doesn't scale to arbitrary client counts.
- **Open jobs by trade** — **table widget** for the same reason (15 global trades today, but treat as unbounded and consistent with client). Top N trades by open-job count. (Trades are global; counts are still tenant-scoped via the jobs filter.)

**Refresh cadence:** server-render on page load (React Server Component, the existing pattern). **No real-time, no websockets.** Optional soft refresh on tab `focus` (a thin client affordance that re-requests the page) — included as a nicety, not a requirement.

**Decision:** status + priority as **card grids** (iterating reference tables), client + trade as **top-N table widgets**, server-render only. The schema affordances dictate the shape. **Approved.**

---

## Section 5 — Stalled job detection

No `stalled` / `aged` / `SLA` notion exists in schema, code, or business-rules docs (inspection §9). Phase 9 authors it. **Stalled is a read-time classification, never a stored status** — it's recomputed on every dashboard render from existing timestamps, so it never goes stale and needs no write path or backfill.

**Where thresholds live (FORK):**
- **(a) single constants module** — `src/server/analytics/stalled-rules.ts` exports per-status thresholds + the classifier. One file, version-controlled, trivially testable.
- **(b) a `stalled_thresholds` table** — DB-stored, queryable, but premature: no UI to edit it, no tenant variance needed yet, adds a migration + a read on every dashboard load.
- **(c) per-tenant configurable from day one** — full settings UI + storage. Clear over-build for an MVP with one tenant.

Option (a) lifts cleanly to (b)/(c) later: the classifier signature (`isStalled(statusCode, enteredAt, now, ...) → boolean`) is identical whether thresholds come from a constant map or a table row. No refactor cost to defer.

**Proposed default thresholds — mapped to *real* `job_statuses` codes** (Jonny edits the numbers). Note: the illustrative list in the brief used `ASSIGNED` and `WORK_COMPLETE`, which are **not** job statuses — `WORK_COMPLETE` is a *dispatch-assignment* status, and there is no `ASSIGNED` job status. Corrected mapping below; stalled rules apply only to **non-terminal** job statuses (a terminal job can't be "stalled"):

| Job status (real code) | category | Stalled-after (proposed default) | Signal basis |
|---|---|---|---|
| `NEW` | open | **4 hours** | time since entering NEW (job_status_history / created_at) — untriaged |
| `SCHEDULED` | open | **2 hours past scheduled start with no on-site** | `scheduled_start_at` passed + no `vendor_check_ins` row — *data-caveat below* |
| `DISPATCHED` | in_progress | **24 hours** | time in DISPATCHED — vendor not progressing the assignment |
| `IN_PROGRESS` | in_progress | **72 hours** | time in IN_PROGRESS — work dragging |
| `ON_HOLD` | on_hold | **7 days** | time in ON_HOLD — hold gone cold |

**Classifier scope — non-terminal job statuses only (by construction).** The stalled classifier walks exactly the five **non-terminal** `job_statuses` (NEW / SCHEDULED / DISPATCHED / IN_PROGRESS / ON_HOLD). A terminal job (COMPLETED / CANCELLED / CLOSED / CLOSED_BILLED) cannot be "stalled." `WORK_COMPLETE` and the other *dispatch-assignment* statuses are **out of scope for this classifier** — they belong to the assignment lifecycle, not the job lifecycle, and are surfaced (if needed) through dispatch readers, not the stalled module.

**"Awaiting close" is deliberately *not* a stalled-rule here.** A job sitting in `COMPLETED` un-billed/un-closed is a real backlog concern, but `COMPLETED` is `is_terminal = true`, so it's outside the open-job set the stalled classifier walks. That concern is already served by Phase 8's `getBillingCloseReadiness` reader and surfaces in the accounting roll-ups (§7, invoice-pending), not the operational stalled queue. Flagged so the two lifecycles aren't conflated.

**Time-in-status source:** the latest `job_status_history` row for the job gives the timestamp it *entered* its current status; `now − that.created_at` is the dwell time. Where a job has no history rows (shouldn't happen — Phase 4 writes an initial transition), fall back to `jobs.created_at`.

**Composite urgency score (feeds the §3 queue), highest wins:**
1. **Stalled-now** — `isStalled` true for the current status per the table above.
2. **Overdue** — `now > jobs.due_at` (data-caveat below).
3. **Unassigned + high-priority** — no `job_vendor_assignments` row **and** priority `rank ≤ 2` (EMERGENCY/URGENT).
4. **Aged-in-status** — dwell time beyond a soft fraction (e.g. ½) of the stalled threshold but not yet stalled.

**Authoritative scheduled-start source (two columns exist).** The `SCHEDULED`-stalled rule and the "time to scheduled" metric (§7) both need *a* scheduled start. Two exist: job-level `jobs.scheduled_start_at` (operator intent) and assignment-level `job_vendor_assignments.scheduled_start_at`. **The authoritative source is `jobs.scheduled_start_at`, falling back to the earliest `job_vendor_assignments.scheduled_start_at` when the job-level field is null.** This rule lives once in `src/server/analytics/` as a small shared helper (`resolveScheduledStartAt(job, assignments)`) so the metric reader and the stalled classifier consume identical logic and can never diverge.

**⚠️ "Lights up as data flows" — not a degraded MVP.** The `SCHEDULED`-stalled rule and the `overdue` urgency tier both depend on operator-populated date columns that are **100% NULL in production today** (`jobs.scheduled_start_at`, `jobs.due_at`). The queries are built and correct; these tiers are simply *quiet until the data exists*. At launch the queue ranks correctly on the available signals (**stalled-in-status + unassigned-high-priority + aged**) and grows richer **automatically** as operator discipline populates `due_at` / `scheduled_start_at` — no code change, no backfill. This must be characterized as *"lights up as data flows"* (not "degraded") in the closeout's `06-business-rules.md` and `chatbot-knowledge.md`, so future readers understand why some queue tiers may be quiet on day one. (Roadmap §2.7: analytics designed from day one, surfacing historical/operator data as it accrues.)

**Decision (threshold structure):** single constants module at `src/server/analytics/stalled-rules.ts`. Lift-to-table-later when tenant-configurable thresholds become a future enhancement. **Approved.**

**Decision (threshold numbers):** defaults approved pending operational tuning — `NEW`=4h, `SCHEDULED`=2h-past-start-with-no-onsite, `DISPATCHED`=24h, `IN_PROGRESS`=72h, `ON_HOLD`=7d. `WORK_COMPLETE` is a dispatch-assignment status not a job status; "awaiting close" is out of scope for the stalled classifier and is handled by Phase 8's `getBillingCloseReadiness`. **Approved.**

**Decision (composite urgency):** `stalled` > `overdue` > `unassigned + high-priority (rank ≤ 2)` > `aged`. **Approved.**

---

## Section 6 — Analytics query substrate: compute-on-read vs materialized

With one tenant and 3 jobs (inspection), and **no scheduled-job runner anywhere in the platform** (no cron, no worker — confirmed: nothing in `package.json` scripts or the codebase runs background jobs), materialization (summary tables refreshed on a schedule) is pure over-build. There's nothing to refresh it, and nothing to refresh.

**Recommendation: compute-on-read.** Every dashboard metric is a live aggregation query executed at render time. The relevant `jobs` indexes already exist (`jobs_tenant_status_idx`, `_priority_idx`, `_client_idx`, `_trade_idx`, `_created_idx` — inspection §3/§6), so the status/priority/client/trade roll-ups are already well-served. The **two deferred indexes** that the consuming phase (= Phase 9) was always going to add (inspection §9, Phase-4 carry-forward) get added now in a Phase-9 migration:
- `(tenant_id, due_at)` — overdue detection on the queue.
- `(tenant_id, source_type)` — source-type filtering / source analytics (roadmap §2.1 source-agnostic surfacing).

Each aggregation lives as a **pure reader** in a new `src/server/analytics/` directory — structurally parallel to Phase 8's `src/server/billing/` — tenant-scoped via `requireTenant` at the call site and `eq(table.tenantId, tenantId)` in every query (the project-wide read-path standard, inspection §8).

**Decision:** **compute-on-read + add the two deferred indexes** in 9b. **Approved.**

---

## Section 7 — Metric → substrate map

The authoritative table the 9c builders work from. "Data-blocked" = query is built and correct but current data yields empty/zero until operators populate the source column; render an empty state, no special-casing.

| Metric | Substrate | Notes |
|---|---|---|
| **Open jobs by status** | `jobs JOIN job_statuses` WHERE `is_terminal=false`, GROUP BY status | Current-state read; uses `jobs_tenant_status_idx`. Cheap. |
| **Open jobs by priority** | `jobs JOIN priorities` (tenant-scoped) WHERE open, GROUP BY priority | Iterate active tenant's priorities by `rank`. |
| **Open jobs by client** | `jobs JOIN clients` (tenant-scoped) WHERE open, GROUP BY client | Top-N table widget. |
| **Open jobs by trade** | `jobs JOIN trades` WHERE open, GROUP BY `primary_trade_id` | Top-N table widget. Jobs with NULL trade bucket as "Unassigned trade." |
| **Time in status** | `job_status_history` consecutive-row diff (`next.created_at − this.created_at`; open interval ends at `now`) | Per-job interval list; aggregate to median/avg per status. Confirmed computable (inspection §3d). |
| **Time to dispatch** | first `job_vendor_assignments.created_at − jobs.created_at` per job | `job_vendor_assignments` has `created_at` + `(tenant_id, job_id)` index (verified). Alt: first transition out of NEW in `job_status_history`. |
| **Time to scheduled** | `resolveScheduledStartAt(job, assignments) − jobs.created_at` | **DATA-BLOCKED** (`scheduled_start_at` 100% NULL). Authoritative source via the shared `resolveScheduledStartAt` helper (§5): `jobs.scheduled_start_at`, fallback earliest `job_vendor_assignments.scheduled_start_at`. Same helper feeds the SCHEDULED-stalled rule. Render empty state. |
| **Time to arrival** | `vendor_check_ins.check_in_at − job_vendor_assignments.created_at` | **`vendor_check_ins` is keyed by BOTH `job_id` and `assignment_id`** (verified) — no status-history join needed; simpler than the inspection implied. Data-blocked until check-ins exist. |
| **Time to completion** | `jobs.completed_at − jobs.created_at` | **DATA-BLOCKED** (`completed_at` 100% NULL). Render empty state. |
| **Vendor assignment count** | `COUNT(*) FROM job_vendor_assignments` per job, aggregated tenant-wide | New tenant-aggregate reader; per-job count is trivial. |
| **Invoice pending count** | `COUNT(*) FROM vendor_invoices` + `client_invoices`, pending statuses, tenant-wide | **NEW tenant-wide aggregate reader required** — Phase 8 readers are all per-job (inspection §4). AR/AP split. |

All metrics are built now, **including the data-blocked ones**: the queries are written and correct; they render empty states gracefully and light up with zero additional work once `scheduled_start_at` / `completed_at` / check-ins are populated. Dispatch-timing metrics that need it join through `job_vendor_assignments` (status history keys on `assignment_id`, not `job_id` — inspection); `vendor_check_ins`, conveniently, does not.

**Decision:** map as above; build data-blocked metrics with empty states now. **Approved.**

---

## Section 8 — Aggregate readers (the only new data-layer work)

Phase 8's billing readers are all per-job (`fn(tenantId, jobId)` — inspection §4). The dashboard needs **tenant-wide** roll-ups, so Phase 9 adds a new reader directory `src/server/analytics/`:

```
countOpenJobsByStatus(tenantId)              → [{ statusId, code, name, category, count }]
countOpenJobsByPriority(tenantId)            → [{ priorityId, code, name, rank, count }]
topClientsByOpenJobs(tenantId, limit=10)     → [{ clientId, name, count }]
topTradesByOpenJobs(tenantId, limit=10)      → [{ tradeId, code, name, count }]  (+ NULL-trade bucket)
timeInStatusDistribution(tenantId)           → per-status { median, avg, n } from job_status_history diffs
timeToDispatchDistribution(tenantId)         → { median, avg, n } from first assignment − job created
countPendingInvoices(tenantId)               → { ar: n, ap: n }   (AR + AP split)
countStalledJobs(tenantId)                   → { total, byStatus: [...] }  (uses stalled-rules module)
operationalQueue(tenantId, limit=20)         → ranked [{ job, urgencyReason, dwellMs }]  (the §3/§5 composite)
```

Conventions: each is a **pure reader, no writes**; tenant-scoped; returns plain serializable rows for the RSC to render. `operationalQueue` and `countStalledJobs` import the `stalled-rules` module (§5) so the queue and the stalled card share one source of truth. Where the dashboard drills into a single job (e.g. an expand/hover showing margin or close-readiness), **reuse Phase 8 per-job readers** (`getJobMargin`, `getBillingCloseReadiness`) — do not duplicate them.

**Decision:** add `src/server/analytics/` with the readers above. The minimal data-layer addition Phase 9 needs. **Approved.**

---

## Section 9 — Job-detail composition

Inspection §2 confirms `src/app/(app)/jobs/[id]/page.tsx` already renders timeline + dispatch + notes + billing (proposals, COs, AP/AR invoices, payments, close, merged timeline). The Phase-9 acceptance criterion "job detail contains timeline, dispatch, notes, and billing basics" is **already met**.

**Recommendation: one small additive change only** — render an **aging / stalled indicator** in the job header when the job is currently stalled or aging, sourced from the *same* `stalled-rules` module the dashboard uses (so the badge on `/dashboard` and the badge on `/jobs/[id]` can never disagree). A non-stalled job shows nothing new. No other rework of the job-detail page.

**Decision:** minimal additive aging/stalled header indicator, shared classifier. **Approved.**

---

## Section 10 — Verification + seed strategy

The live DB is nearly empty (1 tenant, 3 jobs, most history tables 0 rows; all `jobs` business-time columns 100% NULL — inspection §3d/§6). Interval math, distributions, the stalled classifier, and the urgency queue **cannot be meaningfully verified against current data**. CF-8c.8.3 (no standing test framework) makes this acute for correctness-sensitive aggregation.

**FORK:**
- **(a) Author a synthetic sandbox seed + ephemeral verify scripts.** A seed for `jonnyrosero_pm_sandbox` covering varied statuses, priorities, ages (jobs deliberately aged into each stalled bucket), assignment/check-in states, and billing states; plus `scripts/verify-9*.ts` that assert each aggregation against the *known* seeded shape (e.g. "exactly 2 jobs are stalled in IN_PROGRESS"). Sandbox-only; never touches production.
- **(b) Skip seed; rely on Jonny manually populating data** through the UI before eyeballing the dashboard. Cheap now, but non-deterministic and unrepeatable; no regression guard.
- **(c) Defer verification into the future CF-8c.8.3 test harness** when it lands. Leaves Phase 9 analytics shipped-but-unverified in the interim.

Option (a) gives a deterministic dev environment, makes the verify scripts first-class Phase-9 artifacts (consistent with the ephemeral-verification-script discipline — written, run with `--conditions=react-server`, results captured in commit + docs, then deleted), and provides the only credible way to prove the interval/stalled/queue math is correct before real data exists. The seed itself (`scripts/seed-sandbox-phase9.ts`) is the one script that is **retained** (a deliverable), while the per-batch `verify-*` scripts are ephemeral.

**Decision:** retained sandbox seed at `scripts/seed-sandbox-phase9.ts` plus ephemeral `scripts/verify-*.ts`. Sandbox-only — never runs against production DB. The seed becomes a Phase-9 deliverable. **Approved.**

---

## A. Decisions resolved

All six forks resolved on review (2026-05-28). Recorded here as the authoritative summary; the per-section Decision lines carry the same rulings.

1. **§2 Route structure** — single composed `/dashboard` with per-section role gating via pure predicates. **Approved.**
2. **§3 Job queue** — distinct action queue on `/dashboard`; `/jobs` remains the searchable inventory. N=20, composite-urgency order, tie-break longest-dwell-then-oldest. **Approved.**
3. **§5 Stalled thresholds — structure** — single constants module `src/server/analytics/stalled-rules.ts`; lift to a table later if/when thresholds become tenant-configurable. **Approved.**
4. **§5 Stalled thresholds — numbers** — defaults approved pending operational tuning: `NEW`=4h, `SCHEDULED`=2h-past-start-no-onsite, `DISPATCHED`=24h, `IN_PROGRESS`=72h, `ON_HOLD`=7d. "Awaiting close" is out of the stalled classifier (handled by Phase 8 `getBillingCloseReadiness`). **Approved.**
5. **§5 Composite urgency order** — `stalled` > `overdue` > `unassigned + high-priority (rank ≤ 2)` > `aged`. **Approved.**
6. **§10 Verification/seed** — retained sandbox seed `scripts/seed-sandbox-phase9.ts` + ephemeral `scripts/verify-*.ts`; sandbox-only, never production; seed is a Phase-9 deliverable. **Approved.**

*(Non-fork items, also confirmed: §4 card-vs-table shapes, §6 compute-on-read + two deferred indexes, §7 metric map incl. building data-blocked metrics now, §8 the `analytics/` reader list, §9 the single additive job-detail badge.)*

---

## B. Phase 9 sub-batch outline (tentative; revisable post-review)

- **9b — schema gate.** Add the two deferred indexes `(tenant_id, due_at)` and `(tenant_id, source_type)`. No other schema change. Migration + the standard `db:generate` identifier/engine checks.
- **9c — analytics reader layer.** `src/server/analytics/` (the §8 readers) + `stalled-rules.ts`. Pure readers, tenant-scoped.
- **9d — sandbox seed + verify.** `scripts/seed-sandbox-phase9.ts` (retained) + ephemeral `scripts/verify-9c.ts`/`verify-9e.ts` asserting aggregations against the seeded shape.
- **9e — `/dashboard` composition.** Replace the stub: status/priority card grids, client/trade top-N table widgets, the operational queue, per-section role gating. Also the small `/jobs?status=&priority=` filter extension the cards link into.
- **9f — job-detail aging annotation.** The single additive header badge (§9), sharing `stalled-rules`.
- **9g — phase docs + closeout.** The eleven docs under `docs/phase-9-…/`, closeout from roadmap §10, tag `v1.0.0-phase-9`, next-phase branch.

*(Ordering note: 9d depends on 9c's readers existing to verify; 9e depends on 9c. 9d could also run partly before 9c to stand up the seed first — sequencing finalized in 9b review.)*

---

## C. Out-of-scope reminders (each a later phase)

- **Client portal** — external client self-service views. Phase 11.
- **Vendor portal** — external vendor-facing surfaces. Phase 10.
- **External portal integrations** — ServiceChannel et al. ingestion/sync. Phase 12.
- **AI chatbot / assistant** — "identify stalled jobs / SLA risks" conversationally. Phase 16. (Phase 9 builds the *data* it will later consume, not the assistant.)
- **Materialized analytics tables** — scheduled summary rollups. Deferred until volume + a job runner justify them.
- **Tenant-configurable thresholds** — editable stalled/SLA settings per tenant. Future enhancement on top of the §5 constants module.
- **Real-time / websocket updates** — live-pushing dashboard. Phase 9 is server-render-on-load only.
- **Advanced charting** — trend lines, time-series visualizations, charting libraries. Phase 9 ships counts + distributions (median/avg), not graphs.

---

## D. Roadmap citations

- **§8 Phase 9** — Aggregator Dashboard & Analytics MVP: deliverables (`/dashboard`, aggregator job queue, status/priority cards, basic operational analytics, job aging + stalled indicators, phase docs), the core-analytics metric list (§7), and acceptance criteria (§1).
- **§2.7** — analytics designed from day one: Phase 9 is where the history substrates laid down since Phase 4 become operator-visible signal. This section is also the basis for the **"build data-blocked metrics now, render empty states, light up automatically"** pattern (§5, §7) — metrics whose source columns are operator-populated are built and correct immediately and surface signal as the data accrues, rather than being deferred until data exists.
- **§5.5** — preserve auditability via history tables: Phase 9 *reads* `job_status_history` / `job_events` / `vendor_check_ins` / billing events rather than recomputing from mutable current state, honoring the history-first discipline.
- **§2.1** — source-agnostic: the dashboard surfaces all `source_type`s uniformly (the `(tenant_id, source_type)` index supports source analytics without centering any one channel).
