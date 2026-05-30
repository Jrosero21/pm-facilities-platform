# Phase 9 — Aggregator Dashboard & Analytics MVP · Business Rules

The rules that govern the analytics layer's behavior, bounded to what Phase 9 enforces. Each is enforced by the **reader layer** (`src/server/analytics/*`) or by the dashboard composition — not just convention (the two presentation rules, §8/§9, are noted as such). **This doc is authoritative for the predicate definitions**; `02-decisions.md` (decisions/rationale), `09-api-routes.md` (route behavior), and the SOPs cite these sections rather than re-deriving. Upstream empirical source for the invoice predicates: `9c-manifest.md §4`.

## §1 — Open-population definition

- **A job is "open" iff `job_statuses.is_terminal = false` AND `jobs.is_archived = false`.**
- **Why:** terminal statuses (`COMPLETED`, `CANCELLED`, `CLOSED`, `CLOSED_BILLED`) exclude finished work; `is_archived = false` excludes soft-deleted work the operator has explicitly removed from view. This mirrors the `listJobs()` inventory query (`src/server/jobs.ts`), so a dashboard card's count and the `/jobs?status=` filtered list it links to operate on the **same** population.
- **Enforced by:** every current-state reader (`countOpenJobsBy*`, `countStalledJobs`, `operationalQueue`). Cross-ref: `02-decisions.md §C`.

## §2 — Dual-population rule (foundational analytics principle)

- **Current-state readers filter `is_archived = false`; historical-distribution readers include since-archived jobs.**
- **Why:** archiving is a *current-view* operational state, not a retroactive deletion of historical performance. A completed interval is real history — archiving doesn't un-happen it; excluding since-archived work would systematically bias distributions by hiding finished jobs.
- **Examples:** current-state (`countStalledJobs`, `countOpenJobsByStatus`, `operationalQueue`) → filter archived; historical-distribution (`timeInStatusDistribution`, `timeToDispatchDistribution`) → include since-archived.
- **Forward implication:** **not 9c-specific** — Phase 14 PM analytics, Phase 15 snow analytics, and the future chatbot summaries all inherit this rule. Cross-ref: `02-decisions.md §C`.

## §3 — Strict-AP / AR pending-invoice predicates

Upstream (empirically-verified enum value sets): `9c-manifest.md §4`. Enforced by `countPendingInvoices` (`pending-invoices.ts`); consumed by `/dashboard` panel 9.

- **`vendorPending` (strict AP):** `vendor_invoices WHERE tenant_id=? AND status='approved' AND payment_status<>'paid'`.
  - **Excluded:** `received`, `under_review` (pre-approval — not yet aggregator-committed liability); `disputed` (matches the Phase-8 AP exclusion); `paid` (closed).
  - **Why strict:** matches Phase 8's AP cost/margin readers — one semantic universe for AP across the platform; pre-approval invoices must not inflate the dashboard's pending count.
- **`clientPending` (AR):** `client_invoices WHERE tenant_id=? AND status='sent' AND payment_status<>'paid'`.
  - **Excluded:** `draft` (not yet a receivable); `void` (closed). The `client_invoices.status` enum is `{draft, sent, void}` only; partial-vs-fully-paid lives in the separate `payment_status` enum.
- **`total` = `vendorPending + clientPending`.** Cross-ref: `02-decisions.md §C`.

## §4 — Stalled-job classification

Per-status dwell thresholds (`stalled-rules.ts` → `STALLED_THRESHOLDS_SECONDS`); a job is stalled iff its current-status dwell exceeds its status's threshold (the `SCHEDULED` rule is special — §5):

| Status | Threshold |
|---|---|
| `NEW` | 4 hours |
| `SCHEDULED` | 2 hours past resolved scheduled-start **AND** zero check-ins (§5) |
| `DISPATCHED` | 24 hours |
| `IN_PROGRESS` | 72 hours |
| `ON_HOLD` | 7 days (168 hours) |

- The classifier covers **only the five non-terminal job statuses**; a status with no threshold entry (a terminal status, defensively) is never stalled.
- **Per-job "aging" = "is stalled"** in the MVP (no separate neutral aging readout — a deferred UX decision).
- **Data-blocked note ("lights up as data flows"):** dwell is always available (history exists), so the dwell-based statuses classify today; the `SCHEDULED` rule additionally depends on operator-populated `scheduled_start_at` and so is quieter until that data accrues — built and correct, not degraded.
- **Enforced by:** the shared `isStalled` predicate (consumed by `countStalledJobs`, `operationalQueue`, `isJobStalled`). Cross-ref: `9c-manifest.md §6`; `02-decisions.md §C/§F`.

## §5 — SCHEDULED-stalled on-site predicate

A `SCHEDULED` job is stalled iff **all** hold:
1. `resolveScheduledStartAt(job, assignments)` is **non-null**, AND
2. `resolvedScheduledStart + 2 hours` is **in the past**, AND
3. **zero** `vendor_check_ins` rows exist for any of the job's assignments.

- **`resolveScheduledStartAt`:** returns `job.scheduledStartAt` if non-null; else the earliest `assignment.scheduledStartAt`; else `null` (a null resolved start → not stalled — the rule requires a scheduled start to be past).
- **"Zero check-ins"** = literal absence of rows in `vendor_check_ins` joined via `job_vendor_assignments` on **`assignment_id`** (the table keys on `assignment_id` only — `08-db-changes.md`). Presence of ≥1 row = the vendor went on-site. `vendor_check_ins` has no status field — **rows are presence-as-truth**.
- **Forward note:** a future workflow that pre-creates check-in rows *before* actual arrival would warrant an `occurred_at <= now` filter; presence-only is the MVP form. Cross-ref: `9c-manifest.md §9`.

## §6 — Completed-intervals-only (statistical censoring rule)

- **Historical-distribution readers count completed intervals only.** The current (still-open) dwell of a status is surfaced by the current-state readers (`countStalledJobs`, `operationalQueue`), **never mixed** into distribution percentiles.
- **Why:** an open interval is a **right-censored** observation; mixing censored with completed observations biases percentile estimates systematically low.
- **Implementation:** `timeInStatusDistribution` attributes each interval to the **departed** status (`from_status_id`), duration = `created_at − LAG(created_at)` over the per-job history; the first row per job (no `LAG` predecessor) and the still-open interval are dropped. `timeToDispatchDistribution` measures `job.created_at → MIN(assignment.created_at)` per job with ≥1 assignment (`INNER JOIN` drops never-dispatched jobs — the metric doesn't apply).
- **Forward implication:** any future distribution reader over history tables must respect this. Cross-ref: `9c-manifest.md §9`; `02-decisions.md §C`.

## §7 — Composite urgency-tier precedence

The operational queue classifies each open row into exactly one tier by **first match**, highest precedence first (`URGENCY_TIER_ORDER`, `stalled-rules.ts`):

1. **`stalled`** — per §4/§5.
2. **`overdue`** — `due_at` non-null AND `due_at < now` (and not already stalled).
3. **`unassigned-high-priority`** — priority **rank ≤ 2** AND assignment count = 0 (and not stalled/overdue).
4. **`aged`** — the fallback (none of the above).

- **High-priority cutoff:** `HIGH_PRIORITY_RANK_CUTOFF = 2` → `EMERGENCY` (rank 1) or `URGENT` (rank 2).
- The queue sorts by tier rank → longest dwell → oldest `created_at`, then slices to N=20.
- **Data-blocked note:** the `overdue` tier depends on operator-populated `due_at` (largely NULL today) — quiet until it accrues.
- **Enforced by:** `operationalQueue` (app-side classification — a documented deviation from "SQL does the work," `02-decisions.md §C`). Cross-ref: `9c-manifest.md §6`.

## §8 — Color encoding (presentation rule)

The "do not vary per page" palette is a **hard constraint**. Phase 9 maps the analytics domain onto the existing semantic palette (`src/components/dashboard/tier-colors.ts`):

- **Urgency tier → color:** `stalled` → **red** · `overdue` → **amber** · `unassigned-high-priority` → **amber** · `aged` → **neutral**.
- **Status category → color:** `open` (NEW, SCHEDULED) → **neutral** · `in_progress` (DISPATCHED, IN_PROGRESS) → **blue** · `on_hold` (ON_HOLD) → **amber** · `completed` (COMPLETED, CLOSED, CLOSED_BILLED) → **green** · `cancelled` (CANCELLED) → **red**.
- **Priority cards are uncolored** (rank position + count only; color is reserved for tiers + status categories).
- **Structural enforcement:** the tier map is typed `Record<UrgencyTier, string>`, so adding a tier forces a compile error until its color is assigned. Cross-ref: `02-decisions.md §E`; `9e-manifest.md §4`.

## §9 — Count-in-heading pattern (operator-ergonomics rule)

- **List/table section headings include a row count** ("Section name · N items") to give a scanning operator an immediate quantitative anchor (parallel to the stalled summary's prominent "N stalled jobs").
- **Why:** surfaced during the 9e.6 manual pass — the queue's missing count caused brief disorientation. **Convention only** (no code-level enforcement); future list/table surfaces (Phase 10/11 portals, reports) should follow. Cross-ref: `02-decisions.md §E`.

## §10 — Read-vs-write role-gating asymmetry

- **Read-side dashboard panels may extend visibility beyond the corresponding write-side action's gate when the information is summary-level and management-context-relevant.**
- **Concrete:** `canSeeFinancials` (read; the pending-invoice counts) = `accounting | tenant_admin | super_admin`, while the Phase-8 accounting **actions** (`enforceAccountingGate`) = `accounting | super_admin` (no `tenant_admin`).
- **Why:** a tenant admin needs *awareness* of financial state (management context) but should not *act* on it (segregation of accounting duties); read and write serve different concerns.
- **Forward implication:** future portal phases apply the same asymmetry consideration when setting role gates. Source: `src/server/role-predicates.ts`. Cross-ref: `02-decisions.md §E` (the verbatim foundational principle); `09-api-routes.md`.
