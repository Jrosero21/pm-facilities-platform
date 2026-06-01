# Phase 14 — Chatbot / Agent Knowledge

Phase-16-facing concept map of the Preventative-Maintenance subsystem.

## What it is
PM is a **fan-out engine** for recurring maintenance: one **program** → a recurring **schedule** → an explicit subset of a client's **locations** → BATCHES of **visits** → **jobs**. It is a parallel operating surface ("software within a software") that ultimately produces ordinary jobs (`source_type='preventative_maintenance'`).

## The entity chain (8 tables, migrations 0036–0038)
- `pm_programs` — the program: client + trade + priority + a program-level **scope_of_work** (the template) + the **auto_generate** flag.
- `pm_schedules` — the **interval** recurrence: `frequency` (day/week/month) × `interval_count`, with `next_due_at` + `last_generated_at`.
- `pm_schedule_locations` — the **fan-out membership**: which client_locations a schedule covers (an explicit subset, selectable).
- `pm_visits` — one scheduled **occurrence** per location; `generation_status` (generated/skipped/pending_review); `job_id` (nullable until spawned — F5).
- `pm_generation_runs` — the batch-event record (requested/generated/skipped counts).
- `pm_assets` — a **lightweight** equipment reference (NOT EAM lifecycle).
- `pm_visit_checklists` / `pm_visit_results` — template / instance (schema present; result population deferred).

## Entry points (server data layer)
- `runDueSchedules({ now?, tenantId? })` — scan + fan out due schedules (auto or review per program).
- `generateVisitsForSchedule(scheduleId, { mode, actorUserId? })` — the inner generator.
- `approvePmVisits(runId, { actorUserId })` — batch-approve a review run's pending visits.
- `advanceDueDate(from, freq, intervalCount)` — pure recurrence math.

## Auto vs review
- **auto** (`auto_generate=true`): a due schedule spawns jobs directly (deterministic — no gate).
- **review** (`auto_generate=false`): a due schedule lands `pending_review` visits; an operator's `approvePmVisits` turns them into jobs (the §2.5 gate). Auto jobs are system-attributed; approved jobs are operator-attributed.

## Boundaries an agent must respect
- **No live cron** — generation is triggered (B-14.2); **no operator UI yet** (CF-14.2/14.3, B-14.1/14.4) — the engine + data layer are complete and harness-proven (24/0).
- **Skip-and-flag, not abort** — a bad location is flagged + skipped; the batch continues.
- **Idempotent recurrence** — once fired, `next_due_at` advances; no double-generation.
- **Checklist results not yet instantiated** (CF-14.1).
- `pm_assets` is a reference, not an asset-management system (B-14.5).
