# Phase 14 — Server Entry Points

**No HTTP routes / UI this phase** — Phase 14 is an engine + data layer. PM-program CRUD, the review queue, and mass-op screens are deferred to the operator-portal phase (CF-14.2/CF-14.3, B-14.1/B-14.4). The entry points are server data-layer functions (`src/server/pm/`).

## Generation
- **`runDueSchedules({ now?, tenantId? }): Promise<GenerateVisitsResult[]>`** — `run-due-schedules.ts`. Scans active `pm_schedules` with `next_due_at <= now`; for each, resolves `mode = program.auto_generate ? 'auto' : 'review'` (the F1 gate) and calls the generator. The harness-invokable trigger; the live cron is deferred (B-14.2).
- **`generateVisitsForSchedule(scheduleId, { mode: 'auto'|'review', actorUserId? }): Promise<GenerateVisitsResult>`** — `generate-visits.ts`. The CF-13.1 inner workhorse: opens a `pm_generation_runs` row, fans out over live membership → `pm_visits` → (auto) `createJob` + re-check-guarded link-back / (review) park; skip-and-flag per item; advances `next_due_at` once; audits. Throws `SCHEDULE_NOT_FOUND` / `SCHEDULE_INACTIVE` / `PROGRAM_NOT_FOUND`.
- **`GenerateVisitsResult`** = `{ runId, requested, generated, skipped, visits: Array<{ visitId, locationId, status, jobId?, skipReason? }> }`.

## Review / approve
- **`approvePmVisits(runId, { actorUserId }): Promise<{ approved; skipped; alreadyResolved }>`** — `approve-visits.ts`. The F1 review path / batch-approve: per pending visit, lock+recheck → `createJob` (operator-attributed) → re-check-guarded link-back; skip-and-flag; already-`generated` visits counted as `alreadyResolved`. **Operator authz gate (requireTenant/requireRole) is deferred to the action wrapper (CF-14.2).**

## Recurrence
- **`advanceDueDate(from: Date, freq: 'day'|'week'|'month', intervalCount: number): Date`** — `recurrence.ts`. Pure, date-fns-backed.

## Reused (frozen) dependencies
- `createJob` (`@/server/jobs`) — called unchanged (@ NEW, `source_type='preventative_maintenance'`).
- `getSystemUserId` (`@/server/integrations/system-user`) — the auto-run actor.
- `writeAuditLog` (`@/server/audit`) — run + per-visit + approve audit events.

## Error vocabulary
`SCHEDULE_NOT_FOUND`, `SCHEDULE_INACTIVE`, `PROGRAM_NOT_FOUND` + the createJob errors surfaced as per-visit `skip_reason` (`CLIENT_NOT_FOUND`, `LOCATION_NOT_FOUND`, `LOCATION_CLIENT_MISMATCH`, `TRADE_NOT_FOUND`, `PRIORITY_NOT_FOUND`, `STATUS_NOT_FOUND`).
