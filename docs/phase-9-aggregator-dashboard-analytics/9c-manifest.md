# Phase 9 — 9c Manifest (analytics reader layer)

**Phase:** 9 — Aggregator Dashboard & Analytics MVP
**Sub-batch:** 9c — analytics reader layer (`src/server/analytics/`)
**Branch:** `phase-9-aggregator-dashboard-analytics` · **HEAD:** `a648c52` (9b.6)
**Date:** 2026-05-28
**Predecessors:** `01-design-proposal.md` (§3/§5/§7/§8), `9c-inspection-report.md` (9c.1, approved)
**Status:** manifest draft — gates 9c.3 construction. Each section ends with a **Decision** or **FORK**. Forks resolved before 9c.3; none carried into construction.

> **Pre-draft inspection (this gate):** **MariaDB 11.4.10**; enum value sets pinned (§4); `LAG()` window functions **supported**; `PERCENTILE_CONT … WITHIN GROUP (ORDER BY <numeric>) OVER (…)` and `MEDIAN()` **supported** (window-function form only — verified `p50=2` on a numeric column; the first probe's "not supported" was a type-rejection from passing a varchar `id`); `TIMESTAMPDIFF(SECOND,…)` **supported**. Phase-8 reader opening templated from `src/server/billing/margin.ts` (§2). One correction vs the prior paste-back's proposed signatures: **all entity IDs are `varchar(36)` strings, not `number`** (§3).

---

## Section 1 — Scope statement

9c builds the **analytics reader layer** at `src/server/analytics/` — the only data-layer work in Phase 9. Every function is a **pure, read-only, tenant-scoped aggregate** over the substrate Phases 4–8 built (jobs, job_status_history, job_vendor_assignments, vendor/client invoices, reference tables), mirroring the Phase 8 `src/server/billing/` reader pattern exactly (explicit `tenantId` first param, `async`, `import "server-only"`, bare `db` client, money-as-decimal-strings, empty→`[]`/`0`/`"0.00"`). It realizes the roadmap §8 Phase-9 metric list, honors §2.7 (analytics designed from day one — data-blocked metrics return well-typed empties and "light up as data flows"), and §5.5 (reads the history tables rather than recomputing from mutable current state).

**Non-scope (explicit):** no schema changes (the `job_status_history (tenant_id, job_id, created_at)` composite is **deferred** to closeout `10-known-limitations.md` as a scale watchpoint, §11); no UI; no seed (9d); no `/dashboard` composition (9e); no `/jobs` `?status=/?priority=` filter extension (9e); no job-detail aging badge (9f); no server actions/routes (analytics readers are consumed directly by 9e's RSC).

**Decision:** scope as stated; **9c is read-only, no schema touches.** No fork.

---

## Section 2 — Module layout

Mirror `src/server/billing/` exactly (9c.1 §1): **file-per-domain, flat, no subfolders** (billing has none), each file opening with `import "server-only";`. Template opening (from `src/server/billing/margin.ts`, verbatim):
```ts
import "server-only";

import Big from "big.js";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { … } from "@/server/schema";
```

Final files under `src/server/analytics/` (**9 modules** — reconciled to as-built at 9c.7):

**Pure modules (no DB access):**
| File | Exports |
|---|---|
| `stalled-rules.ts` | `STALLED_THRESHOLDS_SECONDS`, `URGENCY_TIER_ORDER`, `UrgencyTier`, `HIGH_PRIORITY_RANK_CUTOFF`, **`isStalled(input)`** classifier (constants + classifier co-located per 9c.6 Step 3) |
| `resolve-scheduled-start-at.ts` | `resolveScheduledStartAt(job, assignments)` (job-level primary, earliest-assignment fallback) |
| `percentile.ts` | `percentile(sortedAsc, q)`, `summarizeSeconds(values)` (extracted mid-9c.6 when the 2nd consumer appeared) |

**DB-touching readers (tenant-scoped; explicit `tenantId` first param; `import "server-only"`):**
| File | Exports |
|---|---|
| `open-jobs.ts` | `countOpenJobsByStatus`, `countOpenJobsByPriority`, `topClientsByOpenJobs`, `topTradesByOpenJobs` |
| `pending-invoices.ts` | `countPendingInvoices` (strict-AP/AR per §4) |
| `time-in-status.ts` | `timeInStatusDistribution` (consumes `percentile`) |
| `dispatch-timing.ts` | `timeToDispatchDistribution` (consumes `percentile`) |
| `stalled-jobs.ts` | `countStalledJobs` (consumes `stalled-rules`, `resolve-scheduled-start-at`) |
| `operational-queue.ts` | `operationalQueue` (consumes `stalled-rules`, `resolve-scheduled-start-at`) |

**Decision:** **(a) flat layout per Phase-8 convention** — billing has no subfolders, so no `internal/` subdir; the three pure modules sit flat alongside the readers (precedent: billing's flat `money.ts`/`totals.ts`/`role-gates.ts`). No fork.

**Reconciliation (9c.7):** §2 originally specified **8** files. `percentile.ts` was extracted mid-9c.6 when a second consumer (`dispatch-timing`) appeared — the "extract when the second consumer appears" pattern that `stalled-rules.ts` itself established. The stalled classifier was **co-located in `stalled-rules.ts`** rather than split into a separate `stalled-predicates.ts` (a single classifier over the constants in the same module — extraction would have been mechanical without conceptual benefit). **Net: 9 files, all conventions consistent.**

---

## Section 3 — Reader signatures (locked)

> **CORRECTION (pre-draft):** all entity primary keys in this schema are **`varchar(36)` UUIDs → TypeScript `string`**, not `number`. The prior paste-back's proposed signatures used `number` for ids; every id below is `string`. Counts are `number`. Money (none in these readers) would be `string`.

```ts
// open-jobs.ts
export async function countOpenJobsByStatus(tenantId: string): Promise<Array<{
  statusId: string; statusCode: string; statusLabel: string; category: string; count: number;
}>>;
export async function countOpenJobsByPriority(tenantId: string): Promise<Array<{
  priorityId: string; priorityCode: string; priorityLabel: string; rank: number; count: number;
}>>;
export async function topClientsByOpenJobs(tenantId: string, limit?: number): Promise<Array<{
  clientId: string; clientName: string; count: number;
}>>;
export async function topTradesByOpenJobs(tenantId: string, limit?: number): Promise<Array<{
  tradeId: string; tradeCode: string; tradeLabel: string; count: number;
}>>;

// time-in-status.ts
export async function timeInStatusDistribution(tenantId: string): Promise<TimeInStatusResult>; // §5A

// dispatch-timing.ts
export async function timeToDispatchDistribution(tenantId: string): Promise<DispatchTimingResult>; // §5A shape family

// pending-invoices.ts
export async function countPendingInvoices(tenantId: string): Promise<{
  vendorPending: number; clientPending: number; total: number;
}>;

// stalled-jobs.ts
export async function countStalledJobs(tenantId: string): Promise<{
  total: number; byStatus: Array<{ statusCode: string; count: number }>;
}>;

// operational-queue.ts
export async function operationalQueue(tenantId: string, limit?: number): Promise<QueueEntry[]>; // §5B
```

**Decision (limit defaults):** `operationalQueue` default **`limit = 20`** (design §3). `topClientsByOpenJobs` / `topTradesByOpenJobs` default **`limit = 5`** each. **Optional-with-default** (`limit?: number`, default applied in body) — matches the "caller may override" ergonomics; Phase 8 readers that take bounds are rare, so no strict convention to violate. No fork.

**Decision (open = non-terminal):** "open jobs" is `job_statuses.is_terminal = 0` throughout — no hardcoded status codes. No fork.

---

## Section 4 — Pending-invoice predicates (PINNED, corrected semantics)

Enum value sets confirmed live (MariaDB 11.4.10):
- `vendor_invoices.status` = **`received, under_review, approved, disputed, paid`**
- `vendor_invoices.payment_status` = **`unpaid, partially_paid, paid`**
- `client_invoices.status` = **`draft, sent, void`**
- `client_invoices.payment_status` = **`unpaid, partially_paid, paid`**

**Semantic per value (which states are "pending" for the aggregator dashboard):**

`client_invoices` (AR — money the client owes us):
| status | meaning | pending? |
|---|---|---|
| `draft` | not yet issued to client | **NO** — operator scratch, not actionable AR |
| `sent` | issued, awaiting payment | **YES (if not fully paid)** |
| `void` | cancelled | NO |

| payment_status | meaning | pending gate |
|---|---|---|
| `unpaid` | nothing received | pending |
| `partially_paid` | some received, balance open | pending |
| `paid` | settled | not pending |

→ **`clientPending` = `client_invoices` WHERE `tenant_id = ?` AND `status = 'sent'` AND `payment_status <> 'paid'`** (i.e. `payment_status IN ('unpaid','partially_paid')`).
Rationale: a *draft* AR invoice isn't a receivable yet (not issued); a *sent* invoice not yet fully paid is the outstanding receivable; *void* and *paid* are closed.

`vendor_invoices` (AP — money we owe the vendor):
| status | meaning | pending? |
|---|---|---|
| `received` | logged, not yet operator-reviewed | NO (not yet actionable for payment) |
| `under_review` | operator reviewing | NO (not yet approved to pay) |
| `approved` | approved for payment | **YES (if not fully paid)** |
| `disputed` | contested | NO (excluded from AP, per Phase 8) |
| `paid` | settled | NO |

| payment_status | meaning | pending gate |
|---|---|---|
| `unpaid` / `partially_paid` | balance open | pending |
| `paid` | settled | not pending |

→ **`vendorPending` = `vendor_invoices` WHERE `tenant_id = ?` AND `status = 'approved'` AND `payment_status <> 'paid'`**.
Rationale: AP "pending" = **approved but unpaid** (we owe it, it's actionable). `received`/`under_review` are pre-approval (operator hasn't committed to pay); `disputed` is excluded (matches Phase 8 margin/AP exclusion); `paid` is closed. This is the strict, operator-actionable definition.

`total = vendorPending + clientPending`.

**Decision: STRICT AP pending.** Predicate: `vendor_invoices WHERE tenant_id=? AND status='approved' AND payment_status<>'paid'`. **Approved.** Pre-approval statuses (`received`, `under_review`) and `disputed`/`paid` all excluded. The strict gate matches the Phase 8 AP readers — a single semantic universe for AP across the platform; pre-approval invoices are not yet aggregator-committed liability and must not inflate the dashboard's pending count. Documented at closeout in `06-business-rules.md` with the one-line exclusion rationale (`received`/`under_review` excluded).

These predicates are the authoritative source for closeout `06-business-rules.md` (§11).

---

## Section 5 — Return shape decisions

### A. `timeInStatusDistribution` — `TimeInStatusResult`

**Decision: per-status aggregated percentiles (variant b).** The dashboard surfaces percentile cards, not raw distributions; the reader does the math.

```ts
export type TimeInStatusResult = Array<{
  statusId: string;
  statusCode: string;
  statusLabel: string;
  category: string;
  count: number;          // number of completed intervals observed for this status
  p50Seconds: number;
  p90Seconds: number;
  meanSeconds: number;
}>;
```

> **Decision: per-status percentiles `{count, p50Seconds, p90Seconds, meanSeconds}`; p95 deferred; percentile computation APP-SIDE. Approved.** `PERCENTILE_CONT … WITHIN GROUP (ORDER BY <numeric>) OVER (…)` and `MEDIAN()` *are* available on MariaDB 11.4.10 (verified — first probe's "not supported" was a varchar type-rejection), but they are **window-only** (no plain `GROUP BY` ordered-set aggregate), so a multi-status result would require `PARTITION BY status` + a `DISTINCT`/dedup wrapper. **The math goes app-side: the SQL computes each interval's duration via `LAG()` + `TIMESTAMPDIFF(SECOND,…)` (both verified) and returns interval rows grouped/tagged by status; the reader buckets per status and computes p50/p90/mean with a tiny pure, unit-testable helper `percentile(sortedSeconds: number[], q: number): number`.** This is a fair carve-out from the Phase-8 "SQL does the work" convention — **predicate filtering and grouping stay in SQL; percentile computation over already-grouped data goes app-side** (simpler, more testable under CF-8c.8.3, trivially extensible). `p95` deferred (trivially addable from the same intervals when tail-data warrants). Location decision documented in §9 alongside the `operationalQueue` decision.

`DispatchTimingResult` (same family, single bucket — there's no per-status grouping for time-to-dispatch):
```ts
export type DispatchTimingResult = {
  count: number;          // jobs with a first-assignment observed
  p50Seconds: number;
  p90Seconds: number;
  meanSeconds: number;
};
```
Empty data → `{ count: 0, p50Seconds: 0, p90Seconds: 0, meanSeconds: 0 }` (the "lights up as data flows" zero, §8).

### B. `operationalQueue` — `QueueEntry`

**Decision: full composed row (no N+1).** One query (or one query + in-app urgency tagging) returns everything the 9e UI renders. (Matches Phase 8's composed-shape readers, e.g. `JobListItem`.)

```ts
export type QueueEntry = {
  jobId: string;
  jobNumber: number;                       // jobs.job_number is int unsigned → number
  clientName: string;
  clientLocationName: string | null;
  statusCode: string;
  statusLabel: string;
  priorityCode: string | null;            // priority_id is nullable → may be null
  priorityRank: number | null;
  currentStatusEnteredAt: Date;           // latest job_status_history.created_at (fallback jobs.created_at)
  ageInCurrentStatusSeconds: number;
  dueAt: Date | null;
  isOverdue: boolean;                     // now > due_at (data-blocked while due_at NULL)
  isStalled: boolean;
  isUnassignedHighPriority: boolean;      // no assignments AND rank <= HIGH_PRIORITY_RANK_CUTOFF
  urgencyTier: UrgencyTier;               // 'stalled' | 'overdue' | 'unassigned-high-priority' | 'aged'
  assignmentCount: number;
};
```

> **CORRECTION (pre-draft):** `jobId` is `string` (uuid); `jobNumber` is `number` (int unsigned); `priorityCode`/`priorityRank` are **nullable** (jobs.priority_id is nullable — a job may have no priority, in which case `isUnassignedHighPriority` is false and it can't be in the high-priority tier).

**FORK resolved → full row.** No open fork; recommendation accepted as the locked shape unless Jonny revises a field.

---

## Section 6 — `stalled-rules.ts` data structure

**Decision: literal-object-as-const (MVP), keyed by `job_statuses.code`.**
```ts
export const STALLED_THRESHOLDS_SECONDS = {
  NEW: 4 * 3600,            // 4h — untriaged
  SCHEDULED: 2 * 3600,     // 2h past resolved scheduled-start with no on-site
  DISPATCHED: 24 * 3600,   // 24h — vendor not progressing
  IN_PROGRESS: 72 * 3600,  // 72h — work dragging
  ON_HOLD: 7 * 24 * 3600,  // 7d — hold gone cold
} as const satisfies Record<string, number>;

export const URGENCY_TIER_ORDER = ['stalled', 'overdue', 'unassigned-high-priority', 'aged'] as const;
export type UrgencyTier = typeof URGENCY_TIER_ORDER[number];

export const HIGH_PRIORITY_RANK_CUTOFF = 2; // rank <= 2 = EMERGENCY/URGENT
```
Covers exactly the 5 non-terminal `job_statuses` codes (NEW/SCHEDULED/DISPATCHED/IN_PROGRESS/ON_HOLD); terminal statuses are outside the classifier by construction (design §5). The `SCHEDULED` rule additionally requires "no on-site check-in past the resolved scheduled-start" — encoded in the `stalled-jobs`/`queue` query logic, not the threshold map (the map holds the duration; the predicate holds the on-site condition).

**Decision:** literal map for MVP; lift to a richer per-status structure (or a `stalled_thresholds` table per design §5) only if rules grow beyond one threshold-seconds value. No fork.

---

## Section 7 — `resolveScheduledStartAt` helper

**Decision: narrow structural parameter types (no schema coupling, unit-testable).**
```ts
export function resolveScheduledStartAt(
  job: { scheduledStartAt: Date | null },
  assignments: ReadonlyArray<{ scheduledStartAt: Date | null }>,
): Date | null;
```
Semantic: return `job.scheduledStartAt` if non-null; else the **earliest** non-null `assignments[].scheduledStartAt`; else `null`. Shared by the `SCHEDULED`-stalled rule and `timeToScheduled` (a future metric) so the two never diverge (design §5/§7). No fork.

---

## Section 8 — Empty-state / zero-data behavior

Locked per 9c.1 §1.C: array readers → `[]`; count readers → `0`; structured readers → struct with zero/empty internals (e.g. `DispatchTimingResult` all-zeros, `countStalledJobs → {total:0, byStatus:[]}`); single-row getters → `null` (none in this set). **Never throw on empty; never null-for-empty-list.** Data-blocked metrics (`due_at`/`scheduled_start_at`/`completed_at` NULL today) run their queries, get zero rows, and return empties — **no reader-side sentinels or special-casing.** No fork.

---

## Section 9 — Query implementation notes

**Engine: MariaDB 11.4.10.** `LAG()`/window functions, `TIMESTAMPDIFF(SECOND,…)`, and `PERCENTILE_CONT … WITHIN GROUP (…) OVER (…)` / `MEDIAN()` are all **supported** — but the percentile functions are **window-only** (no plain `GROUP BY` aggregate form), which is why per-status percentiles are aggregated app-side (§5A) rather than in SQL.

**Open-population definition (amended 2026-05-29 at 9c.4; dual-population refinement at 9c.5).** **Open = `job_statuses.is_terminal = false` AND `jobs.is_archived = false`.** The `is_archived` filter mirrors the existing `listJobs()` inventory query so dashboard cards and the `/jobs` filter they link to operate on the same population. An archived job is soft-deleted from the operator's working surface; including it in dashboard counts would surface work the operator has explicitly removed from view. **Dual-population rule for history-anchored readers:** *current-state* readers (`countOpenJobsBy*`, `countStalledJobs`, `operationalQueue`) apply `is_archived = false` (they ask "what is true / actionable now"); *historical-distribution* readers (`timeInStatusDistribution`, `timeToDispatchDistribution`) **include since-archived jobs** — a completed interval is real historical performance and archiving doesn't retroactively un-happen it; excluding it would systematically bias the distributions by hiding finished work. **This current-state vs historical-record split is a foundational analytics principle** (not 9c-specific) that recurs platform-wide (Phase 14 PM analytics, Phase 15 snow analytics, future chatbot summaries); closeout `06-business-rules.md` carries it as such.

**`vendor_check_ins` keying (corrects 9c.1 §2.B).** `vendor_check_ins` is keyed by **`assignment_id` only** (FK → `job_vendor_assignments`) — it has **no `job_id` column** (9c.1 §2.B wrongly claimed both). The on-site lookup joins `vendor_check_ins` → `job_vendor_assignments` on `assignment_id` to reach the job. There is no status field; the **presence** of ≥1 check-in row = "vendor went on-site" (presence-check is the MVP form; an `occurred_at <= now` filter is a future refinement for workflows that might pre-create check-in rows).

**Completed-intervals-only for distributions.** `timeInStatusDistribution` / `timeToDispatchDistribution` count **completed intervals only**; the current-dwell *open* interval is surfaced by `countStalledJobs` and `operationalQueue` (for "is this stalled now?" / dwell tie-break), **never mixed into distribution percentiles.** Statistical reason: open intervals are **right-censored** observations; mixing them with complete observations produces systematically biased-low percentile estimates. (Mechanically: the LAG diff yields `NULL` for the first row per job — and the open interval is simply never emitted — so "completed only" falls out of the `prev_dwell IS NOT NULL` filter.)

- **`timeInStatusDistribution`** — SQL computes per-interval durations with **`LAG()`**: for each job, `created_at - LAG(created_at) OVER (PARTITION BY job_id ORDER BY created_at)` gives the dwell of the *previous* status; the open (latest) interval is `NOW() - created_at`. Filter `tenant_id = ?`. Return interval rows tagged by the status they measure (`from_status` of each transition = the status whose dwell just ended). The reader buckets by status and computes p50/p90/mean in TS (`percentile()` pure helper). **NB (9c.1 §5 gotcha):** `job_status_history` has only `(tenant_id, job_id)` — the `ORDER BY created_at` within partition filesorts; benign at current volume, banked as a scale watchpoint (§11).
- **`timeToDispatchDistribution`** — `SELECT job_id, MIN(jva.created_at) AS first_assigned, j.created_at` grouped per job (filter `tenant_id`), interval = `first_assigned - j.created_at`; aggregate p50/p90/mean in TS.
- **`countOpenJobsBy*`** — straightforward `COUNT(*) … GROUP BY` joined to the reference table, `WHERE tenant_id = ? AND js.is_terminal = 0`. Served by existing `(tenant_id, current_status_id)` / `(tenant_id, priority_id)` / `(tenant_id, client_id)` / `(tenant_id, primary_trade_id)` indexes.
- **`countPendingInvoices`** — two `COUNT(*)` queries with the §4 predicates; served by `(tenant_id, status)` on both invoice tables.
- **`countStalledJobs` / `operationalQueue`** — base query: open jobs (`is_terminal=0`) joined to their latest `job_status_history` row (per-job latest `created_at`) for `currentStatusEnteredAt`, joined to priorities, with `assignmentCount` via correlated count or join-group. Stalled/overdue/unassigned-high-priority flags + `urgencyTier` + ordering computed in **app code** over the base rows (clearer than a multi-CTE urgency-rank SQL at this scale, and the tier logic references the `stalled-rules` constants + `resolveScheduledStartAt`/on-site check). The on-site condition for `SCHEDULED`-stalled checks `vendor_check_ins` existence for the job's assignments. Order by `urgencyTier` rank then longest-dwell then oldest `created_at`; slice to `limit`. **This is the one reader where app-side composition is preferred over pure-SQL** — an **approved, documented deviation** from "SQL does the work" (see the §9 Decision below + closeout `02-decisions.md`), justified by the multi-signal tier logic + tiny data volume (revisit only if the queue query becomes a hotspot).

**Decision (operationalQueue tier logic): APP-SIDE classification over a base SQL query. Approved.** The base query (tenant-scoped open jobs — `is_terminal=0` — with computed-on-read `ageInCurrentStatusSeconds` and `assignmentCount`, joined to status/priority/client/location labels) returns the candidate set; **TypeScript classifies each row into the urgency tier per the design §5 precedence (stalled > overdue > unassigned-high-priority > aged), then sorts (tier rank → longest-dwell → oldest) and slices to N=20.** This **EXPLICITLY DEVIATES** from the Phase-8 "SQL does the work" convention: the multi-signal tier rule with explicit precedence is more legible and testable in TS than nested SQL `CASE`; volume is small post-filter; testability is higher. Documented as a deviation in closeout `02-decisions.md` so future readers don't refactor it into the harder pure-SQL form. The §5A app-side percentile decision is the sibling carve-out (same "filter/group in SQL, compute app-side" principle).

---

## Section 10 — Construction plan (9c.3 → 9c.7)

1. **9c.3** — `stalled-rules.ts` + `resolve-scheduled-start-at.ts` (pure modules, no DB; smallest correct units). Verify with an ephemeral `scripts/verify-9c3-pure.ts` exercising `resolveScheduledStartAt` truth cases + the percentile helper if it lands here.
2. **9c.4** — `open-jobs.ts` + `pending-invoices.ts` (simpler readers). Ephemeral `scripts/verify-9c4-*.ts` against production (read-only) — assert queries run and return well-typed results.
3. **9c.5** — `time-in-status.ts` + `dispatch-timing.ts` + `stalled-jobs.ts` (history-anchored). Ephemeral verify scripts.
4. **9c.6** — `operational-queue.ts` (composite; depends on stalled-rules + resolve-scheduled-start-at). Ephemeral verify.
5. **9c.7** — `tsc --noEmit` + `eslint` clean; **single commit** for all 9c construction. Ephemeral `verify-*` deleted before commit.

Verify scripts run against **production read-only** (aggregations only, no writes) — 9c's bar is "SQL runs without error against real data, returns well-typed results." 9d exercises readers against seeded sandbox data for value-correctness. **Decision:** locked order (utilities → simple → hard → composite). No fork.

---

## Section 11 — Closeout forward-notes

- `10-known-limitations.md`: **deferred index** `job_status_history (tenant_id, job_id, created_at)` (time-in-status filesort scale watchpoint).
- `06-business-rules.md`: (a) the **§4 pending-invoice predicates** (strict AP = `approved`+unpaid; AR = `sent`+unpaid; pre-approval `received`/`under_review` and `disputed`/`paid` excluded); (b) the **open-population definition** (`is_terminal=false AND is_archived=false`); (c) the **dual-population rule** (current-state readers exclude archived; historical-distribution readers include since-archived) — carried as a **foundational analytics principle**, not 9c-specific (recurs Phase 14/15/chatbot); (d) the **SCHEDULED-stalled on-site predicate** (stalled iff resolved scheduled-start is >2h past AND zero `vendor_check_ins` exist for the job's assignments); (e) the **completed-intervals-only** rule for distribution readers with the right-censoring statistical justification.
- `02-decisions.md`: **reader-construction-discipline (established 9c.4):** when construction surfaces an operationally-correct refinement beyond the literal manifest (e.g. the `is_archived` exclusion, the dual-population rule), **surface it for confirmation at the sub-batch gate** rather than silently shipping OR rigidly following literal text. The manifest is the contract; reality discovered during construction refines the contract through explicit gates, and the refinement is folded back into the manifest before commit.
- `02-decisions.md`: the **explicit-`tenantId`-parameter** convention (vs `requireTenant`-internal), inherited from Phase 8; the **app-side percentile** decision (MariaDB 11.4.10 *does* support `PERCENTILE_CONT`/`MEDIAN` but window-only; intervals computed in SQL via `LAG()`+`TIMESTAMPDIFF`, percentiles in TS); the **app-side queue tier classification** decision (operationalQueue does the multi-signal urgency precedence in TS over a base SQL query — documented deviation from "SQL does the work" with rationale); and the **MariaDB 11.4.10 engine baseline** (window/`TIMESTAMPDIFF`/percentile-function availability that these decisions depend on).
- `09-api-routes.md`: 9c adds **no routes** (readers consumed by 9e).
- `chatbot-knowledge.md`: analytics-readers-mirror-billing-readers; "lights up as data flows" empty-state semantics.
- `9c-inspection-report.md` (traceability): the **`vendor_check_ins` keying correction** — keyed by `assignment_id` only (not also `job_id`); corrects 9c.1 §2.B. (Recorded in manifest §9; the closeout doc set should reflect the corrected keying.)
- **9d forward-bank (seed-coverage requirement):** the 9d synthetic sandbox seed must give **coverage across**: stalled-vs-fresh jobs (the demo tenant is uniformly stalled — confirmed 3× across 9c.4/9c.5/9c.6 smokes); all four **urgency tiers** (stalled / overdue / unassigned-high-priority / aged); **data-blocked metric populations** (jobs with `due_at` / `scheduled_start_at` / `completed_at` set, so overdue + SCHEDULED-stalled + time-to-scheduled/completion light up); and **billing states** (pending AR/AP rows so `countPendingInvoices` is non-zero). Spec'd in the 9d manifest.
- `10-known-limitations.md` — **operational note for future phases (tool-output reliability):** three distinct intermittent tool-output anomalies were encountered during Phase 9 construction — (1) format-string interpolation on raw `%` characters in inline SQL; (2) empty-stdout race on fast-exiting commands; (3) cross-file output bleed in the tool-output channel. Verification discipline that proved reliable: **file-capture** (`> file.out` then read the file) for load-bearing assertions; **grep against committed text** for doc verification; **re-probe with corrected inputs** when a feature-test returns an ambiguous failure (e.g. the `PERCENTILE_CONT` varchar type-rejection that first read as "unsupported"). Inline stdout should not be trusted for load-bearing claims in future phases.

---

## Section 12 — Design-proposal §7 correction note

Design proposal §7 sourced pending-invoice counts from `job_billing_events`; the correct substrate is the invoice tables' `status` + `payment_status` (§4). **This manifest §4 is authoritative.** A one-line pointer will be added to `01-design-proposal.md §7` **at closeout** (in the same pass that updates the other phase docs — not fragmented now). Not a re-decision. No fork.
