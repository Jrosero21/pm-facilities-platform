# Phase 15 — System Workflows

## The fan-out chain

```
declareSnowEvent(program, name)
  │  validate program (exists + in tenant + active)
  │  read LIVE active snow_sites for the program        ← the snapshot source
  │  INSERT snow_events header (status 'declared')        ← the batch-run header (F15-G)
  │  for each live site:                                   ← materialize-at-declare
  │     INSERT snow_event_sites (snapshot membership)
  │     INSERT snow_dispatches (status 'staged', job_id NULL)
  │  audit 'snow_event.declared' {siteCount, autoDispatch}
  │
  ├── auto_dispatch = true  ─────────────►  dispatchSnowEventSites(...)   (auto path)
  └── auto_dispatch = false ─────────────►  return {status:'staged'}      (stage path)
                                                  │
                          operator later calls confirmSnowDispatches(event, operator)
                                                  │  guard status == 'declared'
                                                  ▼
                              dispatchSnowEventSites(event, actorUserId)   ← THE SHARED WORKHORSE
                                 │  guard event exists + tenant; if 'complete' → already-resolved (idempotent)
                                 │  event status → 'dispatching'
                                 │  load 'staged' dispatches  ⨝ event_sites ⨝ sites → client_location_id
                                 │  resolve program defaults (client / trade / priority / problem)
                                 │  for each staged dispatch  (NO outer txn — IF-4):
                                 │     try:
                                 │        job = createJob({ sourceType:'snow_event',
                                 │                          sourceExternalId: eventId, ... })   ← own txn
                                 │        UPDATE dispatch SET job_id, status='spawned', spawned_at
                                 │               WHERE status='staged'        ← status-guarded link-back
                                 │        spawnedCount++
                                 │     catch (err):
                                 │        UPDATE dispatch SET status='skipped', skip_reason=err.message
                                 │        skippedCount++          ← skip-and-flag; batch NEVER aborts
                                 │  event status → 'complete'
                                 │  audit 'snow_event.dispatched' {spawnedCount, skippedCount}  ← counts live here
                                 ▼
                              { eventId, spawnedCount, skippedCount }
```

## The autonomy seam (the CF-13.1 pattern, applied)

`dispatchSnowEventSites` is the **shared inner workhorse**. BOTH entrypoints route through it:
- **auto path** — `declareSnowEvent` calls it directly when `auto_dispatch=true` (actor = the declarer, or SYSTEM if absent).
- **stage path** — `confirmSnowDispatches` calls it after the §2.5 operator gate (actor = the confirming operator).

Same code, different attribution. This is the seam a future autonomous trigger (weather threshold) would also call — exactly the PM `generate-visits` / `approve-visits` split.

## Key invariants

- **No outer txn over the fan-out (IF-4).** Each `createJob` owns its own transaction; the status flip, link-back, and count writes are individual writes — so one bad site (skip-and-flag) cannot roll back the rest.
- **No recurrence.** Unlike PM, a snow event fires **once** — there is no `next_due_at` to advance. This is the one place Snow is structurally simpler than PM.
- **Materialize-at-declare.** The fan-out membership is frozen at declaration; later site-enrollment changes don't retro-affect a declared event.
- **Idempotent re-fire.** A `complete` event re-dispatched returns already-resolved; the `WHERE status='staged'` link-back guarantees a re-fire spawns nothing.
- **Status as the batch ledger.** `snow_events.event_status`: `declared → dispatching → complete` (`cancelled` is a terminal guard state). Counts are not columns — they live in the `snow_event.dispatched` audit metadata.

## Status / enum reference

- `snow_events.event_status` ∈ {`declared`, `dispatching`, `complete`, `cancelled`} (default `declared`).
- `snow_dispatches.dispatch_status` ∈ {`staged`, `spawned`, `skipped`, `cancelled`} (default `staged`).
