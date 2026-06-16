# Per-Dispatch Status Tracking — Summary

**Build:** Per-dispatch (per-trip) status tracking — operator hand-advance + single-vendor job auto-follow.
**When:** Out-of-sequence build after Phase 27 / the Phase-19 follow-up pass.
**Branch/commits:** on `main` (local, unpushed at writing) — `0959aa2`, `b9b5792`, `120f8f4`, `0dcd202`,
`377a9b5`, `d3db56c`, `a9d722a`.

## The framing — status lives on the dispatch

A **dispatch** (`job_vendor_assignments` — one row per (job, vendor) trip) is the thing a status lives on,
**not** the job and **not** the vendor. A job is a *collection of dispatches*; **many dispatches per job**
are supported (re-dispatch, multi-trade, comparing offers — the same vendor can even be dispatched twice).
Each dispatch walks its own 9-stage line (`DRAFT → SENT → ACCEPTED → SCHEDULED → CONFIRMED → ON_SITE →
WORK_COMPLETE`, plus terminal `DECLINED` / `CANCELLED`), with its own append-only history
(`job_vendor_assignment_status_history`).

Most of that lifecycle already existed (the reference-table state machine, the history table, the six
vendor-portal transitions). This build closed the operator-side gaps and connected the dispatch line to the
job line.

## What shipped

1. **`PENDING_INVOICE` job status** — a new **non-terminal** "operationally complete, awaiting invoicing"
   stage (category `completed`, sort 5), inserted via the reference seed with a sort_order reflow
   (`ON_HOLD..CLOSED_BILLED` shift to 6..10). Applied to sandbox + prod by-name (data seed, **no migration**).

2. **Shared `advanceJobStatus` helper** — the job-status flip + `job_status_history` write was inlined at
   three sites (`createJob`, `sendDispatch`, `markBillingClosed`); extracted into one `advanceJobStatus(tx, …)`
   so the auto-follow and the existing sites share one definition. `sendDispatch` + `markBillingClosed` were
   refactored onto it (behavior-preserving); `createJob` stays inline (its `null→NEW` fresh-insert history
   can't be reproduced by a read-current helper).

3. **Operator hand-advance** — `setAssignmentStatus` + the `DispatchStatusPicker` on the assignment page: the
   coordinator can move a dispatch's status directly when a vendor calls/texts in (instead of using the magic
   link). **Free movement** (any status, re-open from terminal), tagged `operator` in the audit. `DRAFT`/`SENT`
   are not operator-settable (Send owns that). Same field + history table as the vendor path, two sources.

4. **Single-vendor job auto-follow** — when a job has **exactly one active dispatch**, a dispatch milestone
   carries the job forward: `ON_SITE → IN_PROGRESS`, `WORK_COMPLETE → PENDING_INVOICE` (the one swappable
   `DISPATCH_TO_JOB_ADVANCE` map, forward-only). Wired into **both** the operator core and the vendor core,
   in the same transaction as the dispatch change.

## Verification

`db:check:billing-close` 6/6, `db:check:set-assignment-status` 8/8, `db:check:dispatch-job-follow` 8/8
(incl. multi-vendor no-move, forward-only, ON_HOLD skip, both cores); `db:check:dispatch` (phase-22) and
`db:check:autonomy` (phase-23) still green. `tsc --noEmit` 0, `pnpm build` 0. Plus an **operator live browser
walkthrough** (Claude-in-Chrome, operator-confirmed): Job #3 On Site → job In Progress, Job #4 Work Complete →
job Pending Invoice, both with the Stalled flag clearing (see `11-closeout.md`).
