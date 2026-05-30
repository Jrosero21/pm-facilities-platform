# Phase 9 — Aggregator Dashboard & Analytics MVP · Phase Summary

**Version:** `v1.0.0-phase-9` · **Branch:** `phase-9-aggregator-dashboard-analytics` · **Roadmap:** §8

## What Phase 9 is

Phase 9 is the platform's **first complete internal aggregator MVP** — the operator-facing dashboard and analytics layer composed over the substrate Phases 1–8 laid down. It is a **read-heavy, composition phase, not a write-heavy build phase** (the inverse of Phase 8's weighting): the data-layer addition is small and additive (a set of tenant-scoped aggregate readers + two long-deferred indexes), and the bulk of the work is **aggregation-query design, dashboard composition, and operator UX**. There are no new write paths and no new workflow state machines.

The one new *business concept* — **"stalled / aged"** — is a **read-time classification** over existing timestamps (per-status dwell vs a threshold map), never a stored status. Several metrics are **data-blocked by design**: the `overdue` and `SCHEDULED`-stalled signals depend on operator-populated columns (`jobs.due_at` / `scheduled_start_at`) that are largely NULL today — the queries are built and correct, render empty states, and **light up automatically as the data accrues** (roadmap §2.7). This is characterized as *"lights up as data flows,"* not a degraded MVP.

The platform stays **source-agnostic** throughout — the dashboard reads jobs/history/billing regardless of how a job entered the system; ServiceChannel and every other channel are equal citizens.

## What shipped

**Analytics reader layer (9c)** — `src/server/analytics/` (9 modules, 10 reader functions):
- **Pure modules** — `stalled-rules.ts` (the threshold map + `isStalled` classifier predicate + urgency-tier vocabulary), `percentile.ts` (`percentile` / `summarizeSeconds`), `resolve-scheduled-start-at.ts`.
- **Current-state readers** — `open-jobs.ts` (`countOpenJobsByStatus` / `ByPriority` / `topClientsByOpenJobs` / `topTradesByOpenJobs`), `pending-invoices.ts` (`countPendingInvoices`, strict AP/AR), `stalled-jobs.ts` (`countStalledJobs`), `operational-queue.ts` (`operationalQueue` — composite-urgency top-N).
- **Historical-distribution readers** — `time-in-status.ts` (`timeInStatusDistribution`), `dispatch-timing.ts` (`timeToDispatchDistribution`).

**Schema (9b)** — the only schema change in Phase 9: two non-unique secondary indexes on `jobs`, `jobs_tenant_due_idx (tenant_id, due_at)` and `jobs_tenant_source_idx (tenant_id, source_type)`, deferred since Phase 4 to "the consuming phase" (= Phase 9). Migration `0024`. See `08-db-changes.md`.

**Sandbox seed + retained harness (9d)** — `scripts/seed-sandbox-phase9.ts` + `seed-sandbox-phase9-fixture.ts` (a deterministic 35-job demo tenant covering every status / priority / urgency tier / billing state) and `scripts/check-analytics-readers.ts` (a fixture-derived-oracle regression harness, 23 assertions across the readers). The harness is the project's **first standing regression artifact** — a partial answer to CF-8c.8.3. Invocable via `pnpm db:check:analytics-readers`.

**Dashboard + filter (9e)** — `/dashboard` replaces the Phase-1 stub with a composed, role-gated operational surface (9 panels: stalled summary, operational queue, status/priority cards, top clients/trades, time-in-status + time-to-dispatch, pending invoices). `/jobs` gains `?status=` / `?priority=` filters so cards link through. New shared primitives: `role-predicates.ts`, `empty-state.tsx`, `dashboard/tier-colors.ts`, a route-level `dashboard/loading.tsx`.

**Job-detail aging badge (9f)** — `isJobStalled` (the single-row counterpart to `countStalledJobs`) drives a "Stalled" badge in the `/jobs/[id]` header, classifying identically to the dashboard queue.

## Sub-batch ledger

| Sub-batch | Scope | Commit |
|---|---|---|
| 9a | Design proposal + inspection report (6 forks resolved) | `4484a36` |
| (chore) | gitignore `.claude/` tooling dir | `d5839dd` |
| 9b | Schema gate: 2 deferred indexes (migration `0024`) | `a648c52` |
| 9c | Analytics reader layer (9 modules) | `2ae0576` |
| 9d | Sandbox seed + retained analytics-readers harness | `08b77f1` |
| 9e | Dashboard composition + `/jobs` filter extension | `d53405b` |
| 9f | Job-detail aging badge | `3966c4a` |
| 9g | Phase closeout (this doc set) | _(this commit)_ |

Human-gated throughout; no agent (Phase 9 has no agent deliverable). Decisions in `02-decisions.md`; rules in `06-business-rules.md`; bounded edges in `10-known-limitations.md`; the formal close + verification record in `11-closeout.md`.
