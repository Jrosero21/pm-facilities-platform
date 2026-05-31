# Phase 14 — Preventative Maintenance — 14b Decisions Locked + Construction Manifest

**Branch:** `phase-14-preventative-maintenance` (off main @ `21ecd2f`). **PAPER ONLY** — no schema/migration/code. Forks F1–F7 (raised in `14a-design-proposal.md`) are now RESOLVED below; the construction manifest is the build baseline for 14c+. The 14a + 14b docs commit together once Jonny ratifies this manifest.

PM is "software within a software": one **program** → many **locations** → a recurring **schedule** → BATCHES of **visits → jobs**. Batch/mass operations are first-class.

---

## Decisions Locked (F1–F7)

**F1 — Batch generation = AUTO-CREATE-BY-DEFAULT.** Reuse the CF-13.1 shared-helper seam: an **inner generator** holds the non-gate logic; both the auto path and a review path call it. `pm_programs.auto_generate` (bool, default **true**). When **false**, the schedule fires into **DRAFT** visits awaiting batch-approval (the email §2.5 gate, one line). When **true**, the visit→job spawn fires without a gate. The engine supports both from day one; the default is fire.
*Rationale:* a schedule firing on its due date is deterministic (unlike ambiguous email parsing), so auto-create is the sensible default; the per-program flag preserves a review path where a tenant wants one.

**F2 — Per-item failure isolation = SKIP-AND-FLAG.** One location failing validation does NOT abort the batch. Each generation run writes **(a)** one **batch-generation EVENT row** with counts (requested / generated / skipped) + **(b)** a **per-visit row** carrying its own status/reason. Audited, never thrown.
*Rationale:* a 20-store program must not lose 19 stores because store #7 has a bad FK; the IF-7/per-entity asymmetry applied at batch scale (each visit/job is its own txn — createJob already is).

**F3 — Phase-14 scope = ENGINE + visit lifecycle + batch-approve fn.** Build the triggered generator, the visit lifecycle, and the batch-approve engine function (F1's gated path needs it). **DEFER** mass-dispatch + generic mass-update UI to the operator-portal phase (mirrors CF-13.7: built the draft→job engine, deferred the queue UI). Data/engine now, surfaces later.

**F4 — Recurrence = INTERVAL model.** `frequency('day'|'week'|'month')` + `interval_count` (every N). `next_due_at` computed + stored; `last_generated_at` tracks the last fire. Generation = a **TRIGGERED function the harness invokes**; **LIVE CRON DEFERRED** (the P12/P13 deferred-live-fetch precedent). Add **`date-fns`** (tree-shakeable) for month-safe date math; no hand-rolled date arithmetic.
*Rationale:* interval covers facilities PM ("quarterly", "monthly"); cron/calendar deferred unless a real program needs them; `date-fns` avoids month-length/DST foot-guns that hand-rolled math hits.

**F5 — pm_visits SPAWNS a job.** A visit is the PM-side **scheduled-occurrence** record; firing/approving it calls `createJob` (`source_type='preventative_maintenance'`), linked via **`pm_visits.job_id`** (nullable until spawned). The visit is **always** recorded; the visit→job step is what F1's flag governs.
*Rationale:* keeps a stable occurrence identity + a "scheduled-but-not-yet-a-job" state + the fan-out audit, independent of the job (the `email_work_order_drafts.created_job_id` precedent exactly).

**F6 — Checklist = TEMPLATE / INSTANCE.** `pm_visit_checklists` = the **template** (program-level definition); `pm_visit_results` = the **per-visit instance** (filled answers). The template-side name is awkward (a "checklist" that is really a template) — noted as a care-item; roadmap names kept.
*Rationale:* mirrors `scope_templates → job_scope_steps` (Phase 7); the program owns the template, the visit owns the instance.

**F7 — Fixture = NO new seed.** The phase-9 seed already gives **Acme = 4 locations** → fan-out is exercisable as-is; any extra is built in-harness (the Phase-12/13 self-fixture pattern).

---

## Worked Example (canonical, from Jonny)
> "Quarterly HVAC filter replacement for Apple stores #1–20 (or an arbitrary subset 1, 5, 20, 23)."

- **One program** — client = Apple, trade = HVAC, scope = "filter replacement", priority = ROUTINE/SCHEDULED.
- **One schedule** — `frequency='month'`, `interval_count=3` → quarterly.
- **`pm_schedule_locations`** — the **EXPLICIT SUBSET** of Apple locations on the program (selectable membership, **NOT** all-or-nothing).
- Each quarter the schedule fires → **fan-out over the member locations** → N `pm_visits` → N jobs (auto, since `auto_generate=true`).

This is **F1 + F4 + F5 working together**: interval recurrence (F4) computes the quarterly due date → the generator fans out over the member subset → each visit spawns a job (F5) without a gate (F1 auto).

---

## Scope / Trade Placement (locked)
**Program-level** scope + trade + priority. The program carries the template values; each visit inherits them; each spawned job receives them. **Per-location override** has schema room left for later but is **NOT built now** (the worked example needs one trade across all stores — no inverted per-location complexity in Phase 14).

---

## Banked Items (forward to closeout)
- **B-14.1** — UI placement of PM Programs (a dedicated "PM Programs" section as the primary home + a read-only list on the client profile). A UI decision → operator-portal phase, NOT Phase-14 schema.
- **B-14.2** — Live cron/scheduler trigger (the CF-14 analog of CF-12.2 / CF-13.2 live-fetch deferral).
- **B-14.3** — Per-location scope/trade override (schema leaves room; not built).
- **B-14.4** — Mass-dispatch + generic mass-update UI (the F3 deferral → operator-portal phase).
- **B-14.5** — `pm_assets` is a **LIGHTWEIGHT reference only** — NOT EAM asset-lifecycle management (roadmap cap; market-file enterprise depth explicitly out of scope).

---

## Naming-Care Flags
- **`pm_schedules` kept.** The 14a collision is with the dispatch ADJECTIVE "scheduled" (`scheduled_start_at`/`scheduled_end_at` on `job_vendor_assignments`) + the `SCHEDULED` job status — **not** a `schedules` table. PM recurrence columns are named unambiguously: `frequency`, `interval_count`, `next_due_at`, `last_generated_at` — **none** shaped like dispatch `scheduled_start_at`/`scheduled_end_at`.
- **WP-12.2 — PRE-NAME every FK.** `pm_schedule_locations`, `pm_visit_checklists`, `pm_visit_results` are long-named → drizzle auto-FK-names WILL exceed MySQL's 64-char limit. Pre-name all FKs (short prefixes, e.g. `psl_`/`pvc_`/`pvr_`/`pp_`/`ps_`/`pv_`/`pa_`); the `check-migration-identifiers` guard runs per migration.

---

## Construction Manifest (schema groups — one migration each, in order)

| Migration | Group | Tables |
|---|---|---|
| **0036** | Core | `pm_programs`, `pm_schedules`, `pm_schedule_locations` |
| **0037** | Occurrence | `pm_visits`, `pm_assets` |
| **0038** | Checklist | `pm_visit_checklists`, `pm_visit_results` |

**Then (no new migration unless the engine needs a column):**
- **Engine** — the triggered generator + `createJob`-per-visit + skip-and-flag (F2) + the batch generation event/audit row; **batch-approve fn** (F1's gated path).
- **Harness** — `scripts/check-pm-generation.ts` (`npm run db:check:pm-generation`) — proves: **fan-out** (1 program → N locations), the **auto-create** path, the **review-gate** path, **skip-and-flag** isolation (F2), **visit→job attribution + `source_type`** (F5), and **idempotent re-fire** (`next_due_at` advance, no duplicate jobs).
- **14p closeout** — 11 docs + `closeout-carryforwards.md`; tag `v1.5.0-phase-14`; ff-merge; push; **Phase-15 (Snow) handoff** as the final deliverable.

**Each migration follows the locked cadence** (0036+): drizzle entry → `db:generate` (chained: drizzle-kit + fix-mysql-engine + check-migration-identifiers) → SQL inspect (HALT) → sandbox apply (env-override) → contract-verify `-E` → **HALT for prod confirm** → prod apply → verify → 4-file commit. New dep `date-fns` lands with the engine (F4), not the schema.

---

## Inherited discipline (carries in)
§2.1 (PM is a source channel; engine stays source-agnostic), §2.5 (the F1 review path is the auto-output gate), every workflow gets an event/history row (CLAUDE.md §6, = F2's batch event). Watchpoints: WP-12.1 (name the DB), WP-12.2 (pre-name FKs — see above), WP-13.2 (clear stale `tsconfig.tsbuildinfo` before tsc verdicts), MariaDB-JSON parse-at-read (if any json columns land), §10 (read verdicts from file).
