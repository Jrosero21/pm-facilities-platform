# Phase 14 — Decisions

The F1–F7 resolutions (locked at 14b) + the implementation-time rulings. Each cites its proving harness assertion (groups A–G in `scripts/check-pm-generation.ts`) where one exists.

## Forks (F1–F7)
- **F1 — auto-create-by-default.** `pm_programs.auto_generate` (default true). The CF-13.1 shared-helper seam: `generateVisitsForSchedule` is the inner generator both paths call. Auto fires the visit→job spawn without a gate; review (`auto_generate=false`) lands `pending_review` visits awaiting `approvePmVisits`. **The §2.5 human gate = the existence of that separate `approvePmVisits` fn + the one-line `mode = program.autoGenerate ? 'auto' : 'review'` branch in `run-due-schedules.ts`.** *Proof:* A (auto), E (review + approve).
- **F2 — skip-and-flag.** Each `createJob` is wrapped in try/catch per visit; a failure sets that visit `generation_status='skipped'` + `skip_reason` (the createJob error) + a skip audit, and the batch CONTINUES. One `pm_generation_runs` row carries requested/generated/skipped counts. *Proof:* D (poison location skipped, good visits still generated, batch didn't abort).
- **F3 — engine + visit lifecycle + batch-approve in scope.** Mass-dispatch + generic mass-update UI deferred (B-14.4).
- **F4 — interval recurrence.** `frequency('day'|'week'|'month')` × `interval_count`; `next_due_at` advanced **once per run** via `date-fns` (`advanceDueDate`); `last_generated_at` tracks the fire. Triggered `runDueSchedules`, NOT live cron (B-14.2). *Proof:* C (advance 3 months, idempotent re-fire).
- **F5 — visit spawns a job.** `pm_visits.job_id` nullable-until-spawned; `createJob` per visit (`source_type='preventative_maintenance'`); the link-back is re-check-guarded and audits-not-throws on the orphan window (the CF-13.6 analog). *Proof:* B (attribution).
- **F6 — checklist template / instance.** `pm_visit_checklists` = program-level template; `pm_visit_results` = per-visit instance. Schema present; result instantiation deferred (CF-14.1).
- **F7 — no new seed.** Acme's locations exercise the fan-out; the harness queries LIVE locations and seeds a 2nd if <2. *Proof:* setup assertion ("Acme has >=2 live locations").

## Implementation-time rulings
- **PK convention = `uuidv7 varchar(36)` (RATIFIED, not open).** The 14c spec line said "autoincrement", but its overriding instruction was "match jobs.ts EXACTLY; do not invent a new idiom" — and ALL live tables + every FK-target parent use `varchar(36)` uuidv7. An int-autoincrement PK would be the invented idiom AND mismatch FK column types. uuidv7 was used and is now live across all 8 PM tables; ratified.
- **8 tables, not the roadmap's 7.** `pm_generation_runs` was added (0037) as the **F2 batch-event record** (requested/generated/skipped + run actor) — the audit substrate skip-and-flag needs.
- **Program-level scope/trade/priority placement.** The program carries the template values; each visit inherits; each spawned job receives them. Per-location override = schema room-left, not built (B-14.3).
- **`date-fns@4.4.0` via pnpm.** F4's month-safe math. **This repo is pnpm** (`pnpm add` / `pnpm-lock.yaml`), not npm — banked for future package specs (an `npm install` crashed npm's arborist against the pnpm `node_modules`).

## Inherited discipline applied
- **CF-13.1 shared-helper-autonomy-seam pattern was APPLIED here** (the inner `generateVisitsForSchedule` both paths call; the future auto-path-after-confidence is the email analog). The email autonomy item (CF-13.1) itself stays open.
- IF-4 ordering (createJob owns its txn, called outside any visit-lock txn) + the CF-13.6 orphan-audit-not-throw discipline carried from Phase 13.
