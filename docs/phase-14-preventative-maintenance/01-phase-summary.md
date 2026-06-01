# Phase 14 — Preventative Maintenance — Phase Summary

**Branch:** `phase-14-preventative-maintenance` · **Implementation commits:** `31383f6 → a149c22` · target tag `v1.5.0-phase-14`.

## What Phase 14 delivered
A **"software within a software"** — Preventative Maintenance as a parallel operating surface that fans out: **one program → many locations → a recurring schedule → BATCHES of visits → jobs.** Batch/mass operations are first-class. PM jobs map into the normal job workflow via `source_type='preventative_maintenance'` (already a live enum value), so a generated PM job is an ordinary job downstream (dispatch, billing, etc.).

## Built (committed)
- **8 PM tables** across 3 migrations (0036–0038), sandbox + prod applied + contract-verified (prod 99→107):
  - `pm_programs`, `pm_schedules`, `pm_schedule_locations` (0036) — the program + interval schedule + fan-out membership.
  - `pm_visits`, `pm_generation_runs`, `pm_assets` (0037) — the per-location occurrence (spawns a job), the F2 batch-event record, and a lightweight asset reference.
  - `pm_visit_checklists`, `pm_visit_results` (0038) — the F6 checklist template / instance pair.
- **Generation engine** (`src/server/pm/`): `generateVisitsForSchedule` (fan-out → visits → jobs, auto + review), `runDueSchedules` (the triggered scan, the F1 branch), `approvePmVisits` (the F1 review path / batch-approve), `recurrence.ts` (`advanceDueDate`, F4 interval math via `date-fns`).
- **Skip-and-flag batch isolation** (F2): one failing location flags that visit + a skip audit; the batch continues.
- **Interval recurrence** + `next_due_at` advance (once per run; idempotent re-fire).
- **Phase-blocking harness** (`scripts/check-pm-generation.ts`) — **24 / 0 green** against sandbox.

## The canonical example (14b)
"Quarterly HVAC filter replacement for Apple stores 1, 5, 20, 23." One program (client=Apple, trade=HVAC, scope='filter replacement', priority=SCHEDULED), one schedule (`frequency='month'`, `interval_count=3` → quarterly), `pm_schedule_locations` = the explicit subset. Each quarter the schedule fires → fan-out over the member locations → N `pm_visits` → N jobs (auto, since `auto_generate=true`).

## Deliberately NOT in this phase
- No **live cron** — `runDueSchedules` is a triggered (harness-invokable) entry; the timer is deferred (B-14.2).
- No **operator UI** — engine + data layer only; PM-program CRUD, the review queue, and mass-op screens are operator-portal-phase concerns (B-14.1/B-14.3/B-14.4, CF-14.2/CF-14.3).
- **Checklist results not yet instantiated** — the template/instance schema exists, but the engine does not yet create `pm_visit_results` per visit (CF-14.1).
- `pm_assets` is a **lightweight reference only**, NOT EAM asset-lifecycle (B-14.5).

## Commit ledger
`31383f6` (14a/14b planning) → `54c4cb4` (0036) → `3b578c3` (0037) → `25f9f15` (0038) → `cf89062` (date-fns) → `a149c22` (engine + harness).
