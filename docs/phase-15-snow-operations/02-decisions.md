# Phase 15 — Decisions

The 9 forks F15-A…I (locked at 15a→15b) with resolution + rationale, plus the implementation-time rulings. Each cites its proving harness assertion (groups A–G in `scripts/check-snow-dispatch.ts`) where one exists.

## Forks (F15-A … F15-I) — LOCKED

- **F15-A — auto-vs-stage, DEFAULT = STAGE.** `snow_programs.auto_dispatch` (default **false**). `declareSnowEvent` branches on it (the `run-due-schedules` `auto_generate ? 'auto' : 'review'` analog): `true` → run the shared workhorse immediately; `false` → leave `staged` dispatches for `confirmSnowDispatches`. **The §2.5 human gate = the existence of `confirmSnowDispatches` + the branch.** Inverse default of PM's `auto_generate=true` — a storm still gets a human gate unless explicitly opted out. *Proof:* B (stage gate), C (auto path).
- **F15-B — `snow_sites` is an OVERLAY on `client_locations`.** `snow_sites.client_location_id` FK + snow attrs (`plow_priority`, `site_notes`), NOT a duplicate location entity. Asymmetry: `snow_program_id` → CASCADE (enrollment dies with the program), `client_location_id` → RESTRICT (a snow enrollment never block-deletes a real location). *Proof:* A (materialize from live sites).
- **F15-C — `snow_dispatches` is the per-site SPAWN/OUTCOME record, reusing Phase-5 dispatch.** Not a parallel vendor-assignment table; it carries nullable `job_id` + `skip_reason`, and the spawned job (`createJob(source_type='snow_event')`) flows through the EXISTING dispatch workflow. *Proof:* B4 (source_type snow_event), D (outcome split).
- **F15-D — manual fire; weather eval DEFERS.** An operator declares the event. `snow_service_triggers` models the rule (`trigger_type` default `'manual'`, `'weather_threshold'` a future value); `snow_weather_observations` is a placeholder. No runtime evaluates weather this phase (B-15.2). *Proof:* F (manual declare entrypoint).
- **F15-E — fan-out chain `event → N event_sites → N dispatches`, each spawning a job.** `snow_event_sites` is the `pm_visits` analog (per-site batch artifact); each `snow_dispatches` row spawns one job. No separate dispatch layer. *Proof:* A (snapshot), B/C (spawn).
- **F15-F — `snow_service_logs` template→instance, schema-only.** Per-dispatch proof-of-service capture (the CF-14.1 analog). Schema lands (0041); the capture runtime defers (B-15.1).
- **F15-G — `snow_events` IS the batch-run header.** Status (`declared`→`dispatching`→`complete`) lives on it (the `pm_generation_runs` analog at event scale). Per-site skip-and-flag; no outer txn (IF-4). *Proof:* A2/B3/C2/D4 (status transitions), D (skip-and-flag).
- **F15-H — engine, NOT UI.** The event-driven batch-dispatch engine is Phase 15; mass-op + operator screens defer to operator-portal (the B-14.4 analog → B-15.3).
- **F15-I — reuse `client_locations` for the harness fixture.** Acme's live sandbox locations (4) drive the storm fan-out; only snow overlay attrs seed distinctly. *Proof:* setup assertion ("Acme has >=3 live locations").

## Implementation-time rulings

- **Decision A — `fk_sevent_weather` completed in 0041.** `snow_events.snow_weather_observation_id` landed soft in 0040 (target table didn't exist yet); 0041 added the real FK → `snow_weather_observations.id`, **ON DELETE SET NULL** (an event outlives the observation it referenced). Applied as a single `ALTER TABLE snow_events ADD CONSTRAINT` on the empty table (provably safe).
- **Materialize-at-declare (engine decision).** `declareSnowEvent` snapshots the program's LIVE active `snow_sites` into `snow_event_sites` + a `staged` `snow_dispatches` row per site AT declaration — the event is frozen at that moment (a later site enrollment change does not retro-affect a declared event). *Proof:* A1/A3/A4.
- **`snow_dispatches.job_id` → SET NULL, matching `pm_visits.job_id`.** Verified live (`fk_pm_visits_job` = SET NULL, 15c Stage 0) — the spawn-record-to-job link behaves identically across PM and Snow; the outcome row + `skip_reason` survive a job deletion as history.
- **Status-guarded link-back.** The workhorse flips a dispatch to `spawned` only `WHERE dispatch_status='staged'` — prevents a double-spawn under a concurrent re-fire. *Proof:* E3 (0 staged remain → re-fire spawns nothing).
- **Counts to audit, not columns.** `snow_events` has no count columns (unlike `pm_generation_runs`); `spawnedCount`/`skippedCount` land in the `snow_event.dispatched` audit metadata (CF-15.1).
- **PK convention = `uuidv7 varchar(36)`** across all 8 snow tables (matches every live FK-target parent — the ratified Phase-14 idiom).
- **FKs hand-named (WP-12.2)** via `foreignKey({columns, foreignColumns, name})` — the long snow names would exceed MySQL's 64-char auto-name limit; the `check-migration-identifiers` guard enforces it.

## Inherited discipline applied

- **CF-13.1 shared-helper-autonomy-seam pattern APPLIED:** `dispatchSnowEventSites` is the inner workhorse BOTH the auto path (`declareSnowEvent` when `auto_dispatch=true`) and the manual gate (`confirmSnowDispatches`) call — same code, different attribution.
- **IF-4 ordering** — `createJob` owns its own txn, called outside any wrapping txn; the fan-out is deliberately not one txn (per-item isolation). Carried from Phase 13/14.
