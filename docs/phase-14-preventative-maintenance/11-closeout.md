# Phase 14 — Preventative Maintenance — Closeout

**Target tag:** `v1.5.0-phase-14` · **Branch:** `phase-14-preventative-maintenance` → `main` · **Closed:** 2026-06-01

## 1. Goal (roadmap — Phase 14)
Preventative Maintenance as a "software within a software": one program → many locations → a recurring schedule → BATCHES of visits → jobs. Batch/mass operations first-class. PM jobs flow into the normal job workflow via `source_type='preventative_maintenance'`. Engine + data layer this phase; live cron + operator UI deferred (the P12/P13 framework-not-activation precedent).

## 2. Completed deliverables
- **8 `pm_*` tables** (migrations 0036–0038), sandbox + prod applied + contract-verified.
- **Generation engine** (`src/server/pm/`): `generateVisitsForSchedule` (fan-out → visits → jobs, auto + review), `runDueSchedules` (the triggered scan, F1 branch), `approvePmVisits` (review path / batch-approve), `advanceDueDate` (F4 interval math).
- **Skip-and-flag** batch isolation (F2); **interval recurrence** + idempotent next-due advance (F4); **visit-spawns-job** with the orphan-audit discipline (F5).
- **Phase-blocking harness** — 24 assertions, 24/0 green.

## 3. Files (the implementation commits)
- `src/server/schema/pm.ts` (+ barrel) — the 8 tables · `db/migrations/0036…0038`.
- `src/server/pm/{recurrence,generate-visits,run-due-schedules,approve-visits}.ts`
- `scripts/check-pm-generation.ts` · `package.json` runner (`db:check:pm-generation`) · `date-fns@4.4.0` (pnpm).
- `docs/phase-14-preventative-maintenance/` (14a/14b planning + this 11-doc set + carryforwards).
- Ledger: `31383f6`(14a/14b) → `54c4cb4`(0036) → `3b578c3`(0037) → `25f9f15`(0038) → `cf89062`(date-fns) → `a149c22`(engine + harness).

## 4. DB changes
8 tables / 3 migrations (full detail + FK matrix in `08-db-changes.md`). Prod: **99 → 107 tables**. uuidv7 PKs; FK delete-rules per precedent (tenant CASCADE; client/trade/priority RESTRICT on programs; visit→job SET NULL).

## 5. Server entry points
`generateVisitsForSchedule`, `runDueSchedules`, `approvePmVisits`, `advanceDueDate`. No HTTP routes/UI (engine layer). See `09-api-routes.md`.

## 6. Workflows
Scan due schedules → per program mode (auto/review) → open run → fan out over live membership → visit per location → (auto) createJob + link / (review) park → skip-and-flag → advance next-due once → audit. Batch-approve mirrors approveEmailDraft. See `05-system-workflows.md`.

## 7. Business rules
R-14.1…R-14.10 (fan-out width, PM source_type, auto-system/review-operator attribution, NEW landing, idempotent recurrence, skip-and-flag, review gate, re-call guard, tenant isolation, empty fire). Each cites its harness assertion. See `06-business-rules.md`.

## 8. Verification — `check-pm-generation.ts`, **24 passed / 0 failed, true exit 0** @ `a149c22` (read from a fresh file-captured run; idempotent-teardown re-run also 24/0):
- **A fan-out (4):** requested === live membership; generated === requested, skipped 0; visits all generated + jobId; one run, counts match.
- **B attribution (4):** job source_type PM; createdBy === system (auto); sourceExternalId `pm:{schedule}:{run}:{location}`; client/location/NEW.
- **C recurrence (3):** next_due advanced 3 months; last_generated set; not-yet-due re-fire → no new run (idempotent).
- **D skip-and-flag (4):** generated === good, skipped === 1, requested === good+1; poison skipped w/ reason + null jobId; good visits generated (no abort); run counts split.
- **E review + approve (5):** review fire → pending_review, no jobs; no jobs on fire; approve → jobs exist; approved jobs operator-attributed + PM; re-approve → alreadyResolved, approved 0.
- **F isolation (1):** unknown/cross-tenant schedule → SCHEDULE_NOT_FOUND.
- **G empty fire (1):** 0-membership → run requested=0, no visits, no throw.
- (+ 2 setup assertions = 24 total.)

The harness is sandbox-guarded (module-top env-swap + hard-exit if not _sandbox), destructive, self-seeding (live Acme + a poison client + T-B), teardown-in-finally + defensive pre-clean; the phase-9 seed is left intact. Migrations 0036–0038 verified `-E` + FK-matrix on sandbox and prod. tsc green throughout.

**Process notes (honest record):** (1) The 14c spec said "autoincrement" PKs, but the controlling "match jobs.ts EXACTLY" instruction + FK type-matching forced **uuidv7 varchar(36)** (all live tables use it) — surfaced as a design deviation, ratified. (2) The dep-add spec said `npm install` + `package-lock.json`, but **this repo is pnpm** — npm's arborist crashed against the pnpm `node_modules` (no mutation); used `pnpm add` + committed `pnpm-lock.yaml`. (3) First harness run was RED (21/3); all three were harness/contract issues, not engine bugs — diagnosed (tenant-scoped createJob throws LOCATION_NOT_FOUND not _MISMATCH for a cross-tenant location → poison must be same-tenant/different-client; runDueSchedules correctly re-fired prior schedules → deactivate them before the review test; `alreadyResolved` only caught concurrent flips → refined to count already-generated visits at run scale) and fixed at the true cause, never by weakening an assertion.

## 9. Known limitations
No live cron (B-14.2), no operator UI (CF-14.2/14.3, B-14.1/14.4), checklist results not instantiated (CF-14.1), per-location override room-left not built (B-14.3), pm_assets lightweight-only (B-14.5), visit→job orphan window (CF-13.6 analog). Full list in `10-known-limitations.md`.

## 10. Carry-forwards
`closeout-carryforwards.md` — B-14.1…B-14.5, CF-14.1…CF-14.3, the pnpm/date-fns note + inherited (CF-13.x, CF-12.x, FB-10*, CF-11.x) + watchpoints.

## 11. Recommended next-phase focus
**Phase 15 — Snow** (roadmap; `snow_event` is already a live `jobs.source_type`). Snow has the same **batch/event-driven** shape as PM (a weather event fans out over a client's serviced locations → a batch of jobs) — it builds directly on the fan-out + skip-and-flag + batch-event substrate this phase proved. The PM activation track (live cron B-14.2, operator UI CF-14.2/14.3, checklist execution CF-14.1) is the parallel work whenever PM goes live.

## 12. Sign-off
Engine + data layer complete; harness 24/0 green (`a149c22`); 11 closeout docs written. Commit docs → tag `v1.5.0-phase-14` + push + ff-merge to `main` + cut `phase-15` are the gated remaining steps.
