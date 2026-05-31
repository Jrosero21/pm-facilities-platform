# Phase 14 — Preventative Maintenance — 14a Inspection Report

**Branch:** `phase-14-preventative-maintenance` @ `21ecd2f` (off main). **Read-only sweep** — no schema/migration/code. Every load-bearing verdict file-captured (§10). All DB calls named `jonnyrosero_pm` / `jonnyrosero_pm_sandbox` explicitly (WP-12.1).

PM is "software within a software": one **program** fans out → many **locations** → a recurring **schedule** → BATCHES of **visits/jobs**. Batch/mass operations are first-class. Roadmap §8 core tables: `pm_programs, pm_schedules, pm_schedule_locations, pm_assets, pm_visits, pm_visit_checklists, pm_visit_results`.

## Survey 1 — jobs.source_type enum (live)
```
enum('manual','internal_client_portal','external_client_portal','email_ingestion',
     'forwarded_email','api','preventative_maintenance','snow_event')
```
✅ **`preventative_maintenance` present** (and `snow_event`, the Phase-15 placeholder). **No enum migration is a Phase-14 prerequisite** — PM jobs map into this existing channel. Schema source: `src/server/schema/jobs.ts:71` (`"preventative_maintenance"`).

## Survey 2 — PM scaffolding + collision check
- **The 7 `pm_*` tables are net-new** — `grep pm_programs|pm_schedules|pm_visits|pm_assets|pm_visit` in src/+db = **0 matches**. The only `preventative` hit is the enum value above.
- **Collision scan (load-bearing-term reuse):**
  | Term | Hits | Verdict |
  |---|---|---|
  | `program` | 0 | free |
  | `visit` | 0 | free |
  | `checklist` | 0 | free |
  | `asset` | 0 | free |
  | `recurrence` / `cadence` / `cron` | 0 | free |
  | **`schedule`** | **132** | **LOAD-BEARING** ⚠ |
- **⚠ `schedule` is already meaningful** — it's `scheduled_start` (77 hits, the Phase-5 dispatch ETA/scheduling on `job_vendor_assignments`) + the **`SCHEDULED` job status** + minor `reschedule`/`schedule_status`. Phase-14 `pm_schedules` is a **recurrence definition** — a *different* meaning. **WP-13.1-analog naming-care flag:** `pm_schedules` (recurrence) must read unambiguously vs. the existing dispatch "scheduled_start" / `SCHEDULED` status. Recommend keeping the `pm_` prefix strictly and never bare "schedule" in PM column names where confusion is possible.

## Survey 3 — createJob batch target + record-don't-apply precedent
- **`createJob`** — `src/server/jobs.ts:236`, `createJob(input: CreateJobInput): Promise<JobRow>`. Validates CLIENT_NOT_FOUND / LOCATION_NOT_FOUND / LOCATION_CLIENT_MISMATCH / TRADE_NOT_FOUND / PRIORITY_NOT_FOUND / STATUS_NOT_FOUND; **hardcodes NEW** status; runs its **OWN 7-step transaction** (counter lock → insert → bump → status-history → job.created event → **in-txn audit**). This is the per-visit creation target for batch generation (frozen — call as-is).
- **Email draft→job precedent (the pattern PM batch mirrors at scale):** `createJobFromDraft` (`ingest-email.ts:366`, the **shared inner helper** holding the readiness check + the `createJob` call — the CF-13.1 autonomy seam) + `approveEmailDraft` (`:410`, adds the **§2.5 human-approval gate** as the outer line) + `rejectEmailDraft` (`:499`). IF-4 ordering: createJob runs its own txn outside the draft lock, then a re-check-guarded link. **PM batch generation = this shape, fanned out over N locations.**

## Survey 4 — fan-out target + reference data + seed fixture
- **`client_locations` columns:** `id, tenant_id, client_id, name, location_code, address_line1, address_line2, city, state_province, postal_code, country, status, created_at, updated_at, created_by_user_id`. (The fan-out target: one program → many of these.)
- **Seed fan-out (sandbox `phase9-seed-tenant`):** **Acme Corp = 4 locations**, Globex = 2, Initech = 1, Umbrella = 1. ✅ Multi-location clients exist → fan-out is exercisable on the existing seed (Acme is the natural fan-out fixture). *(Acme's 4 = the 3 fixture locations + 1 auto-stub persisted from a prior external-ingest harness run.)*
- **Reference data:** global `trades` (HVAC/PLUMB/ELEC/…), tenant `priorities` (EMERGENCY/URGENT/HIGH/ROUTINE/SCHEDULED), global `job_statuses` (incl. NEW) — all seeded, confirmed available (same lookups the Phase-12/13 harnesses use).

## Survey 5 — audit / append patterns to mirror
- **`writeAuditLog`** — `src/server/audit.ts`; `WriteAuditLogInput {tenantId?, userId?, actorLabel?, action, targetType?, targetId?, metadata?, ip?, ua?}`; swallows errors (never breaks the main flow). `actor_label` lets a system-originated batch-generation row read clearly.
- **Append/event discipline (email-ingest precedent):** a generation writes a structured-result row + per-item records (parse_results + draft per email). PM's analog: a **generation event/run** + **per-visit records** — mirror, don't reinvent. (Every meaningful workflow gets a history/event row, not just a state overwrite — CLAUDE.md rule 6.)

## Survey 6 — recurrence / scheduling utility
- **`DATE_LIBS=NONE`** — no `date-fns` / `dayjs` / `rrule` / `luxon` / `moment` / cron lib in dependencies or devDependencies.
- **`REC_LINE_COUNT=0`** — no existing `rrule` / `nextDue` / `addDays|addMonths|addWeeks` / `frequency` / recurrence utility in `src/`.
- → **Recurrence + "next due" date-math is GREENFIELD.** No prior pattern to inherit; the recurrence model is a 14b decision (F4), and whether to add a dep vs. hand-roll interval math is part of it.

## Survey 7 — baseline
- **99 tables** in `jonnyrosero_pm` (matches Phase-13 close).
- Latest migration **`0035_harsh_madame_masque.sql`** → **`0036` is the next free** number.

## Contradictions vs. the handoff
None. Every handoff claim held empirically: enum carries `preventative_maintenance`, 7 pm_* tables net-new, 99 tables / 0035 latest, fan-out fixture present. The one *new* finding is the **`schedule` naming collision** (Survey 2) — banked as a 14b naming-care item, not a blocker.

## Readiness
Substrate confirmed for Phase 14: the source channel exists, the per-visit createJob target + the draft→job batch pattern are frozen-and-known, the fan-out fixture (Acme × 4 locations) is live, and recurrence is a clean greenfield decision. **0036 is the first PM migration.**
