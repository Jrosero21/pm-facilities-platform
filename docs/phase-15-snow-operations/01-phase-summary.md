# Phase 15 — Snow Operations — Phase Summary

**Branch:** `phase-15-snow-operations` · **Implementation commits:** `088e7a6 → 6e0c8ba` · target tag `v1.6.0-phase-15`.

## What Phase 15 delivered

The **SECOND "software within a software"** — Snow Operations as an **EVENT-triggered batch engine**, structurally parallel to Phase 14's **time-triggered** PM engine with the trigger swapped (time/recurrence → storm declaration) and **no recurrence** (an event fires once). The character: **a storm fans out across a client's serviced sites.** One snow program → an operator declares an event → it snapshots the program's enrolled sites → a batch of per-site dispatches → jobs. Snow jobs map into the normal job workflow via `source_type='snow_event'` (already a live enum value), so a spawned snow job is an ordinary job downstream (dispatch, billing, etc.) — the app stays source-agnostic.

## Built (committed)

- **8 snow tables** across 3 migrations (0039–0041), sandbox + prod applied + contract-verified (prod 107 → **115** base tables; **25** snow FKs = 16 CASCADE / 4 RESTRICT / 5 SET NULL):
  - `snow_programs`, `snow_sites`, `snow_service_triggers` (0039) — the program (client/trade/priority + spawn defaults + `auto_dispatch`), the site **overlay** on `client_locations`, and the manual trigger rule-shape.
  - `snow_events`, `snow_event_sites`, `snow_dispatches` (0040) — the **batch-run header** (the storm), the membership fan-out (sites this storm hits), and the per-site **spawn/outcome** record (nullable `job_id` + `skip_reason`).
  - `snow_service_logs`, `snow_weather_observations` (0041) — the per-dispatch proof-of-service **capture** record (schema only; runtime defers) and the weather **placeholder** (live feed defers); 0041 also completed the 0040 soft ref with the real `fk_sevent_weather` (decision A).
- **Event-fire engine** (`src/server/snow/`): `declareSnowEvent` (trigger + **materialize-at-declare** + the auto/stage branch), `dispatchSnowEventSites` (the **shared inner workhorse** — the autonomy seam), `confirmSnowDispatches` (the §2.5 staged-batch-confirm gate).
- **Skip-and-flag batch isolation:** one failing site → that dispatch `skipped` + `skip_reason` (the createJob error) + the batch continues. **No outer txn over the fan-out** (IF-4 — each `createJob` owns its own txn).
- **Phase-blocking harness** (`scripts/check-snow-dispatch.ts`) — **23 / 0 green** against sandbox (self-seeding, destructive, sandbox-only hard-exit guard).

## The canonical example

"A Nor'easter hits — plow + salt every enrolled Acme site." One snow program (client=Acme, default trade/priority/problem), `snow_sites` = the enrolled subset of Acme's locations. An operator declares the event → fan-out snapshots the live sites into `snow_event_sites` + a `staged` `snow_dispatches` row each. If `auto_dispatch=true` the dispatch runs immediately; if `false` (default, stage) the operator calls `confirmSnowDispatches` → one `createJob(source_type='snow_event')` per site.

## Deliberately NOT in this phase

- No **live weather feed / auto-trigger** — fire is **manual** (an operator declares); `snow_service_triggers` + `snow_weather_observations` are schema room, not evaluated (B-15.2).
- No **service-log capture runtime** — `snow_service_logs` schema lands; the field/mobile fill defers (B-15.1, the CF-14.1 analog).
- No **operator UI** — engine + data layer only; snow program CRUD, the declare/confirm screens, mass-op + a dashboard read surface are operator-portal-phase concerns (B-15.3/B-15.4).
- No **count columns on `snow_events`** — batch totals live in the `snow_event.dispatched` audit metadata (CF-15.1).

## Commit ledger

`088e7a6` (0039 program+site layer) → `bd5f7cb` (0040 event+fan-out layer) → `01e3115` (0041 capture+weather placeholder + `fk_sevent_weather`) → `6e0c8ba` (engine + harness, 23/0 green). Four local commits, **not yet pushed** (the gated origin sequence follows closeout review).
