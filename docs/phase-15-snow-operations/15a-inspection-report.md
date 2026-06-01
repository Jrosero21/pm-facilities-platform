# Phase 15 — Snow Operations · 15a Inspection Report (READ-ONLY)

> Sub-batch 15a is an inspection sweep only. No schema, migrations, engine code, or
> DB writes were produced. All MySQL was read-only via `~/.pm_db.cnf`, DB named
> `jonnyrosero_pm` explicitly (WP-12.1), `-E` vertical output (WP). Findings below;
> design forks (with recommendations, all OPEN) live in `15a-design-proposal.md`.

Branch: `phase-15-snow-operations` (cut off `main@a60ad39`).

---

## Survey 1 — `jobs.source_type` live enum

Live `information_schema` definition (live truth, not drizzle source):

```
COLUMN_NAME: source_type
COLUMN_TYPE: enum('manual','internal_client_portal','external_client_portal',
  'email_ingestion','forwarded_email','api','preventative_maintenance','snow_event')
```

- **`'snow_event'` present? → YES.** Last value in the enum.
- Full enum verbatim (8 values): `manual`, `internal_client_portal`,
  `external_client_portal`, `email_ingestion`, `forwarded_email`, `api`,
  `preventative_maintenance`, `snow_event`.
- **No HALT.** 14a's promise holds: Phase 15 jobs map cleanly into `'snow_event'`;
  no enum migration is required to spawn snow jobs.

---

## Survey 2 — WP-15.1 naming-collision map

For each collision-prone term, what it ALREADY means in the live repo:

| Term | Already means (representative files) |
|---|---|
| `snow_` / `snow_event` / `snow` | **Only** the `source_type` enum value + its display. 3 files: `src/server/schema/jobs.ts:75` (drizzle enum member), `db/migrations/0008_mature_guardsmen.sql:10` (the enum DDL), `src/app/(app)/jobs/[id]/page.tsx:57` (`snow_event: "Snow event"` label). **No tables, no engine, no entity.** |
| `snow_site` / `snow_dispatch` / `snow_program` / `_event_sites` / `storm` / `weather` / `service_log` / `service log` | **Zero matches.** All net-new namespace — free to claim. |
| `dispatch` | **Heavily load-bearing (Phase 5).** ~40 files. Core: `src/server/dispatch.ts`, `src/server/schema/dispatch-assignments.ts` / `dispatch-comms.ts` / `dispatch-presence.ts` / `dispatch-reference.ts`, the `jobs/[id]/dispatch/**` route tree, `new-dispatch-form.tsx`, `send-dispatch-button.tsx`, analytics `dispatch-timing.ts`. "Dispatch" = sending a job to a vendor (the reactive vendor-assignment workflow). A `snow_dispatch` name would collide conceptually — reuse-vs-new is fork **F15-C**. |
| `job_events` | **Load-bearing (timeline substrate).** `src/lib/timeline.ts`, `src/server/dispatch.ts`, `src/server/schema/job-history.ts` + several schema files. The per-job event/timeline table. A snow "event" is a DIFFERENT concept (a storm), so `snow_event*` table names must NOT be confused with `job_events` rows — naming hygiene flag for 15b. |
| `trigger` | Used in agents (`agents/runner.ts`, `agents/config/*`), email (`integrations/email/index.ts`), and notably **`src/server/pm/run-due-schedules.ts`** (the PM "triggered scan"). Also migration `0012`. "Trigger" already names the PM generator-not-cron entry. Snow's event-declaration is the analog trigger — reuse the *concept*, pick a distinct *name*. |

**Confirmation: zero `snow_*` scaffolding exists.** The only `snow_` token in the
codebase is the `'snow_event'` enum value (3 files, all enum/label). Phase 15 tables
and engine are entirely net-new.

---

## Survey 3 — Reactive dispatch substrate (does Snow reuse it?)

Tables confirmed present: `jobs`, `clients`, `client_locations`,
`job_vendor_assignments`, `job_events`, `dispatch_messages`.

**`job_vendor_assignments`** (21 cols) — the reactive dispatch object:
- `id`, `tenant_id`, **`job_id` (varchar(36), NOT NULL)** ← references a job.
- `vendor_id` (NOT NULL), `vendor_location_id`, `vendor_contact_id`.
- `current_status_id` (NOT NULL), `agreed_nte_amount`.
- `scheduled_start_at`, `scheduled_end_at`, `dispatch_scope` (text).
- Match-snapshot block: `matched_trade_id`, `matched_trade_was_primary`,
  `tightest_geo_at_dispatch` enum(postal_code|city|state|national),
  `matched_geo_types_at_dispatch` (longtext), `compliance_status_at_dispatch`
  enum(ok|no_data|expired|non_compliant), `chosen_branch_covered_trade`.
- `sent_at`, `created_by_user_id`, `created_at`, `updated_at`.

**Verdict:** `job_vendor_assignments.job_id` is NOT NULL and the whole row hangs off
a job. So a snow job (`source_type='snow_event'`) created per site **could reuse the
existing dispatch workflow verbatim** — no new dispatch object needed to send a snow
job to a vendor. This is the substrate behind fork **F15-C / F15-E**.

**`client_locations`** (17 cols) — the fan-out target a snow_site overlay would extend:
- `id`, `tenant_id`, `client_id` (NOT NULL), `name`, `location_code`,
  `status` enum(active|inactive|archived).
- Address: `address_line1/2`, `city`, `state_province`, `postal_code`, `country`,
  **`latitude` decimal(10,7)**, **`longitude` decimal(10,7)** (both nullable).
- `created_by_user_id`, `created_at`, `updated_at`.
- A `snow_site` overlay would add snow-specific attributes (e.g. lot size, surface
  type, service tier, salt/plow spec) keyed to a `client_location_id` — the
  `pm_schedule_locations` membership pattern. Geo columns already exist (useful if a
  future weather-zone match is built). Fork **F15-B**.

---

## Survey 4 — The PM engine as the structural template

`src/server/pm/` (4 files; the pattern Snow ADAPTS — do not duplicate):

```
recurrence.ts        1086 B   pure date math (advanceDueDate)
generate-visits.ts   7569 B   the fan-out workhorse
run-due-schedules.ts 1815 B   the triggered scan (generator-not-cron)
approve-visits.ts    5782 B   the review-path batch approver
```

### `recurrence.ts` — pure trigger math (no DB)
- `export function advanceDueDate(from: Date, freq: PmFrequency, intervalCount: number): Date`
- `export type PmFrequency = "day" | "week" | "month"`
- Harness-unit-testable; date-fns for month-safe arithmetic. **Snow analog:** the
  trigger is an EVENT, not a recurrence — this file likely has *no* direct snow
  counterpart (a storm doesn't "advance a due date"). Point (e) below does not map.

### `generate-visits.ts` — the fan-out workhorse (THE template)
- `export type GenerateVisitsResult = { runId; requested; generated; skipped; visits[] }`
- `export async function generateVisitsForSchedule(scheduleId, opts: { mode: "auto" | "review"; actorUserId? }): Promise<GenerateVisitsResult>`
- **(a) signatures** — above.
- **(b) fan-out loop shape** — load schedule → load program → resolve actor
  (operator or system user) → query LIVE active members from
  `pm_schedule_locations` → open ONE `pm_generation_runs` row → **`for (const member of members)`** SEQUENTIAL loop, one `pm_visits` row per member → finalize counts → advance recurrence → run-event audit.
- **(c) skip-and-flag try/catch around createJob** — lines 129–194: `try { createJob(...) ; link-back } catch { update visit → status='skipped', skipReason; writeAuditLog 'pm_visit_generation_skipped'; result.skipped++ }`. **The whole fan-out is deliberately NOT one txn** so one bad site can't roll back the rest (IF-4).
- **(d) batch-run row open/close** — opened at line 83 (`insert pmGenerationRuns` with `requestedCount`, `generated/skipped = 0`); counts finalized at line 198 (`update ... set generatedCount, skippedCount`).
- **(e) next_due_at advances ONCE per run** — lines 204–212, after the loop, idempotent re-fire. **Snow has no recurrence to advance** (event-triggered) — this step is PM-specific.
- **(f) auto-vs-review branch** — line 118: `if (opts.mode === "review") { push pending_review; continue }`; else `mode==='auto'` calls createJob immediately + re-check-guarded link-back (lines 144–164, `affectedRows===0 → audit orphan, don't throw`).

### `run-due-schedules.ts` — the triggered scan (generator-not-cron, B-14.2)
- `export async function runDueSchedules(opts?: { now?: Date; tenantId?: string }): Promise<GenerateVisitsResult[]>`
- Finds active schedules with `next_due_at <= now`, loops, reads each program's `auto_generate`, sets `mode = autoGenerate ? "auto" : "review"`, calls `generateVisitsForSchedule`. **The live cron is DEFERRED — this fn is the harness-invokable trigger.** Snow analog: an EVENT-declaration entrypoint replaces the due-date scan (F15-A/D).

### `approve-visits.ts` — the F1 review-path batch approver
- `export async function approvePmVisits(runId, opts: { actorUserId: string }): Promise<{ approved; skipped; alreadyResolved }>`
- Partitions a run's visits (generated → alreadyResolved; skipped → ignored; pending_review → approvable). Per visit: **lock+recheck `for("update")` still pending_review** → resolve program → `createJob` in its OWN txn (IF-4) → re-check-guarded link-back → skip-and-flag on error. The human gate (§2.5) IS the existence of this function: the auto path never calls it.

### Live batch-run + membership schemas
**`pm_generation_runs`** (9 cols — the F2 batch-event record):
`id`, `tenant_id`, `pm_schedule_id` (NOT NULL), `requested_count` (int),
`generated_count` (int), `skipped_count` (int), `run_at` (datetime),
`created_by_user_id`, `created_at`. → Snow's "dispatch-run" / storm-batch record
analog (F15-G).

**`pm_schedule_locations`** (6 cols — the fan-out membership):
`id`, `tenant_id`, `pm_schedule_id` (NOT NULL), `client_location_id` (NOT NULL),
`is_active` (tinyint), `created_at`. → Snow's `snow_event_sites` membership analog
(F15-B / F15-E). Note: this is a *schedule→location* join; snow needs an
*event→site* join (a storm fans out across the sites enrolled in a program).

---

## Survey 5 — `createJob` contract (the per-site spawn target)

Defined in **`src/server/jobs.ts:236`**.

- **Signature:** `export async function createJob(input: CreateJobInput): Promise<JobRow>`
- **`CreateJobInput` params** (lines 208–222): `tenantId`, `clientId`,
  `clientLocationId`, `primaryTradeId?`, `priorityId?`, **`sourceType?: JobSourceType`**
  (defaults to `"manual"` at line 259 — pass `'snow_event'`),
  **`sourceExternalId?: string | null`** (Snow can stamp e.g. `snow:<eventId>:<siteId>`,
  mirroring PM's `pm:<schedule>:<run>:<location>`), `problemDescription` (required),
  `scopeOfWork?`, `notToExceedAmount?`, `createdByUserId`.
- **String-coded throws:** `CLIENT_NOT_FOUND`, `LOCATION_NOT_FOUND`,
  `LOCATION_CLIENT_MISMATCH`, `PRIORITY_NOT_FOUND` (if priority given),
  `TRADE_NOT_FOUND` (if trade given), `STATUS_NOT_FOUND` (defensive). These are the
  exact messages snow's per-site skip-and-flag would capture into a skip reason.
- **Own txn — CONFIRMED.** Read-only parent guards run first (outside txn), then a
  single `await db.transaction(...)` (line 286) does the 7-step mutation
  (ensure+lock per-tenant sequence → insert job → bump counter → status-history →
  timeline event → audit). **No outer txn over the fan-out (IF-4):** snow wraps each
  `createJob` in per-site try/catch exactly as PM does.

---

## Survey 6 — Live sandbox location counts (`jonnyrosero_pm_sandbox`)

Queried LIVE (handoff warned of a possible stray 4th Acme location — confirmed real):

| Client | location_count |
|---|---|
| Acme Corp | **4** |
| Globex Inc | 2 |
| Umbrella Co | 1 |
| Initech LLC | 1 |

- **Acme has 4 sites** — enough to demonstrate a storm fan-out (the handoff's
  "stray 4th" is present in the sandbox; reported as actual, not assumed).
- Globex (2) is a smaller secondary fan-out. Umbrella/Initech (1 each) can't show
  multi-site fan-out alone. Informs fork **F15-I** (seed `snow_sites` distinctly vs
  reuse `client_locations`): Acme's 4 locations are immediately reusable for a
  harness storm.

---

## Survey 7 — Weather / threshold / trigger plumbing

`grep` for `weather|threshold|snowfall|snow_depth` in `src/` → 4 files, **all
non-weather**:
- `analytics/stalled-jobs.ts`, `analytics/stalled-rules.ts` — job-stall *dwell-time*
  thresholds (9c stalled-rules), unrelated to weather.
- `integrations/ingest-email.ts`, `schema/email-ingestion.ts` — email
  *confidence-threshold* / autonomy comments.
- Zero matches for `weather`, `snowfall`, `snow_depth`.

**Weather plumbing present? → NO.** No live weather feed, no threshold-eval engine.
Consistent with the roadmap cap (live weather feed defers regardless). Fork
**F15-D** builds manual/triggered fire only; live weather eval stays deferred.

---

## Capture files (all `/tmp/15a_*.txt`, read-only)

`15a_src.txt` · `15a_grep.txt` · `15a_snow.txt` · `15a_tabs.txt` · `15a_jva.txt` ·
`15a_cl.txt` · `15a_pmls.txt` · `15a_pmrun.txt` · `15a_pmsl.txt` ·
`15a_seedcount.txt` · `15a_weather.txt` — contents pasted in the session report.
