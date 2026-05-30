# Phase 9 — Chatbot Knowledge (Aggregator Dashboard & Analytics Primer)

The analytics-domain primer for the future Phase-16 chatbot. **Fact-density over narrative** (an index, not a tutorial). Scope = Phase 9 (the dashboard + analytics readers) only; other domains have their own primers. Operator phrasings are canonical in `03-user-sop.md`; precise rules in `06-business-rules.md`; rationale in `02-decisions.md`; flows in `05-system-workflows.md`; boundaries in `10-known-limitations.md`.

## Mental model

- **Phase 9 = the first complete internal aggregator MVP.** `/dashboard` composes ~10 analytics readers (`src/server/analytics/*`) over the substrate Phases 1–8 built. When an operator asks "what's the current state of operations," the dashboard is the answer.
- **Read-heavy.** No new write paths, no new workflow state machines; the only schema change is two `jobs` indexes (`08-db-changes.md`). The new layer is read-only aggregation.
- **"Stalled / aged" is a read-time classification**, never a stored status — recomputed each render from a per-status threshold map.

## Concepts to recognize (plain definition → precise rule)

- **"Open" job** — not yet complete/cancelled and not archived (`06 §1`).
- **"Stalled"** — in its current status longer than that status allows (NEW 4h · SCHEDULED 2h-past-start-with-no-check-in · DISPATCHED 24h · IN_PROGRESS 72h · ON_HOLD 7d) (`06 §4/§5`).
- **"Overdue"** — a `due_at` that has passed (`06 §7`).
- **"Pending invoice"** — vendor (AP) `approved` + not paid; client (AR) `sent` + not paid (`06 §3`).
- **"Urgency tier"** — stalled > overdue > unassigned-high-priority > aged, first match (`06 §7`).
- **"Open vs historical population"** — the **dual-population rule** (`06 §2`): current-state reads exclude archived; historical distributions include since-archived.

## Operator Q&A (short answers + source-of-truth)

- **Q: How many jobs are stalled right now?** → `countStalledJobs(tenantId)`; predicate `06 §4/§5`; surfaced on dashboard panel 1 ("Needs attention").
- **Q: Why does this job have a "Stalled" badge?** → `isJobStalled` returned true — its current-status dwell crossed the threshold (`06 §4`), or it's SCHEDULED past start with no check-in (`06 §5`). Same classification as the dashboard queue (`02 §F`).
- **Q: Why is the pending-invoice count what it is?** → strict predicates (`06 §3`); excluded: pre-approval/`disputed`/`paid` (AP), `draft`/`void`/`paid` (AR).
- **Q: What does "0 jobs in ON_HOLD" mean?** → an affirmative count of zero (open population, `06 §1`), not missing data.
- **Q: Why is time-to-dispatch / time-in-status empty?** → not enough completed intervals yet (or the operator-populated source column is still NULL) — "lights up as data flows" (`06 §2/§4`).
- **Q: Can I see archived jobs in the queue?** → No (current-state, `06 §1`). But historical distributions **include** them (`06 §2`).
- **Q: Dashboard queue vs the `/jobs` list?** → the queue is action-oriented (top-20 by urgency tier, `06 §7`); `/jobs` is the full filterable inventory. Both share the open-population definition.
- **Q: Why doesn't the operator see pending-invoice counts?** → read-vs-write asymmetry (`06 §10`): `canSeeFinancials` gates the panel (`accounting | tenant_admin | super_admin`); a plain operator doesn't qualify.

## Architectural facts

- **9 modules / 10 reader functions** in `src/server/analytics/` (`01-phase-summary.md`). All take `tenantId` **explicitly**; `requireTenant()` runs at the request boundary, not inside readers.
- **Paired aggregate + single-row reader** (`02 §F`): `countStalledJobs` (aggregate) and `isJobStalled` (single-row) share the same `isStalled` predicate (`stalled-rules.ts`) → the dashboard queue and the job-detail badge never disagree.
- **App-side computation, by design** (`02 §C`): the percentile math and the urgency-tier classification happen in TypeScript over SQL-filtered/grouped rows (documented deviations from "SQL does the work").

## Discipline knowledge (so the chatbot doesn't mislead)

- **Dual-population (`06 §2`):** never conflate "not shown in the queue" with "didn't happen" — archived work is excluded from current-state views but counts in historical distributions.
- **Right-censoring (`06 §6`):** "median time in status X" is the median of **completed** intervals only, not all intervals (open intervals are censored and excluded).
- **Read-vs-write asymmetry (`06 §10`):** "can see X" and "can do X" are **different** role gates; a tenant admin can *see* pending counts but cannot *perform* the accounting actions.

## Source-doc pointers

Predicate questions → `06-business-rules.md` · decision rationale → `02-decisions.md` · workflow → `05-system-workflows.md` · operator language → `03-user-sop.md` · dev/ops → `04-admin-sop.md` · boundaries → `10-known-limitations.md`.
