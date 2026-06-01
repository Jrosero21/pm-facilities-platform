# Phase 14 — System Workflows

The runtime flows of the PM generation engine (`src/server/pm/`). All functions are server data-layer (`"server-only"`); operator authz lives in the deferred action wrapper (CF-14.2).

## 1. Triggered scan (`runDueSchedules({ now?, tenantId? })`)
Source: `src/server/pm/run-due-schedules.ts`. The harness-invokable trigger (live cron deferred — B-14.2).
1. Find **active** `pm_schedules` where `next_due_at <= (now ?? new Date())` (optionally tenant-scoped).
2. For each: load its program; **`mode = program.auto_generate ? 'auto' : 'review'`** (the F1 gate, one line).
3. Call `generateVisitsForSchedule(scheduleId, { mode })`; collect + return the results.

## 2. Generate (`generateVisitsForSchedule(scheduleId, { mode, actorUserId? })`)
Source: `src/server/pm/generate-visits.ts`. The CF-13.1 inner workhorse; record-don't-apply at batch scale.
1. Load the schedule (tenant FROM the row); `SCHEDULE_NOT_FOUND` / `SCHEDULE_INACTIVE`. Load its program (`PROGRAM_NOT_FOUND`).
2. `actor = actorUserId ?? getSystemUserId()` (auto → system; review → operator passes one).
3. Load **active** `pm_schedule_locations` LIVE (`requested = count`).
4. Open ONE `pm_generation_runs` row (requested/0/0, `run_at=now`, `created_by=actor`).
5. **Fan out — SEQUENTIAL, per-item isolation (NO wrapping txn):** for each member location, insert a `pm_visits` row, then:
   - **review:** leave `generation_status='pending_review'`, no job.
   - **auto:** `try { createJob({ clientId: program.clientId, clientLocationId: member, primaryTradeId: program.primaryTradeId, priorityId: program.priorityId, sourceType:'preventative_maintenance', sourceExternalId:'pm:{schedule}:{run}:{location}', problemDescription: program.name, scopeOfWork: program.scopeOfWork, createdByUserId: actor }) }` — createJob owns its txn (IF-4). Then a **re-check-guarded link-back** (`UPDATE pm_visits SET job_id, generation_status='generated' WHERE id=… AND generation_status='pending_review'`); 0 rows → audit `pm_visit_link_orphan`, no throw (CF-13.6). `catch` → **skip-and-flag** (`generation_status='skipped'`, `skip_reason=err.message`, audit `pm_visit_generation_skipped`); the batch continues.
6. Update the run counts (generated/skipped).
7. **Advance recurrence once:** `next_due_at = advanceDueDate(next_due_at, frequency, interval_count)`; `last_generated_at = run_at`. (Idempotent re-fire.)
8. Audit `pm_generation_run` (mode + counts).

## 3. Batch-approve (`approvePmVisits(runId, { actorUserId })`)
Source: `src/server/pm/approve-visits.ts`. The F1 review path; mirrors `approveEmailDraft`.
- Load the run's visits. **`generated`** → counted as `alreadyResolved` (re-call guard at run scale); **`skipped`** → ignored; **`pending_review`** → approvable.
- For each pending: `db.transaction` → `SELECT … FOR UPDATE` re-check pending (else `alreadyResolved`), release lock; resolve the program (via the visit's schedule); `createJob` (its own txn, **`createdByUserId = actorUserId`** — operator-attributed); re-check-guarded link-back (orphan audit). `catch` → skip-and-flag.
- Audit `pm_visits_batch_approved` (runId + approved/skipped/alreadyResolved).

## 4. Recurrence (`advanceDueDate(from, freq, intervalCount)`)
Source: `src/server/pm/recurrence.ts`. Pure, no DB. `day`→addDays, `week`→addWeeks, `month`→addMonths (date-fns), × `intervalCount` (defensive: <1 treated as 1). Harness-unit-testable.
