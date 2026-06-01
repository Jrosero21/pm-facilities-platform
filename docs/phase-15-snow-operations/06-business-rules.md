# Phase 15 — Business Rules

Each rule cites its proving assertion in `scripts/check-snow-dispatch.ts` (23/0 green @ `6e0c8ba`).

| Id | Rule | Proof |
|---|---|---|
| **R-15.1** | **Materialize-at-declare: fan-out width = live membership.** `declareSnowEvent` snapshots exactly one `snow_event_sites` row + one `staged` `snow_dispatches` row per active `snow_sites` row (queried live, not assumed); the event is frozen at declaration. | A1 (siteCount === live membership), A3 (N event_sites), A4 (N staged dispatches, job_id null) |
| **R-15.2** | **Stage gate (F15-A, default): no spawn until confirm.** With `auto_dispatch=false`, declaration leaves the event `declared` and all dispatches `staged` — zero jobs. `confirmSnowDispatches` then spawns one job per site. | B1 (0 jobs before confirm), B2 (confirm → spawnedCount===N), B3 (all spawned, event complete) |
| **R-15.3** | **Auto path spawns immediately.** With `auto_dispatch=true`, `declareSnowEvent` runs the shared workhorse in the same call → dispatches `spawned`, event `complete`, no separate confirm. | C1 (autoDispatched, complete, spawnedCount===N in one call), C2 (all spawned) |
| **R-15.4** | **Spawned jobs carry `source_type='snow_event'` + `source_external_id`=eventId, land at NEW, with the program's client.** A spawned dispatch's job is an ordinary job tagged snow, stamped with the storm id. | B4 (source_type/source_external_id/NEW/client) |
| **R-15.5** | **Attribution: auto = declaredBy (or SYSTEM if absent); confirm = the operator.** The shared workhorse takes `actorUserId`; `createJob.created_by` = that actor. | C3 (auto → declaredBy/operator), B4 (confirm → operator) |
| **R-15.6** | **Skip-and-flag (IF-4): one poison site never aborts the batch.** A site whose location belongs to a different client → `createJob` throws `LOCATION_CLIENT_MISMATCH`; that one dispatch → `skipped` + `skip_reason`, all others still `spawned`, event still reaches `complete`. | D1 (counts split), D2 (poison skipped, reason captured, job_id null), D3 (good dispatches spawned — batch didn't abort), D4 (event complete despite skip) |
| **R-15.7** | **Idempotent re-fire + status-guarded link-back.** Re-firing a `complete` event is a no-op (already-resolved); the `WHERE dispatch_status='staged'` link-back means 0 staged remain after the first dispatch, so a re-fire spawns nothing. | E1 (alreadyResolved, spawned 0), E2 (job count unchanged), E3 (0 staged remain) |
| **R-15.8** | **Tenant isolation.** A program lookup is scoped to its tenant; a wrong-tenant declare → `SNOW_PROGRAM_NOT_FOUND`, nothing spawned cross-tenant. | F1 (SNOW_PROGRAM_NOT_FOUND), F2 (0 events under T-B) |
| **R-15.9** | **Empty fire completes cleanly, not an error.** A 0-site program declared (auto) creates the header, 0 event_sites, 0 dispatches, spawned/skipped 0, event `complete`, throws nothing. | G1 |
| **R-15.10** | **Manual fire only — weather is NOT auto-evaluated.** The event is declared by an operator (or harness); no weather feed or threshold rule fires it this phase (`snow_service_triggers`/`snow_weather_observations` are schema room). | F (manual declare is the only entrypoint exercised); B-15.2 |

## Inherited rules in force

- **§2.5** — automated output is gated where a human decision belongs: the stage path's `confirmSnowDispatches` IS the gate (the auto path is a deterministic operator opt-in, so it fires; the stage path requires the operator).
- **IF-4 ordering** — `createJob` owns its own txn, called outside any wrapping txn; the fan-out is deliberately not one txn, so one bad site cannot roll back the rest. The link-back is a separate status-guarded write.
- **Every workflow gets an event/history row** (CLAUDE.md §6) — `snow_events` is the batch header (status transitions); the declaration (`snow_event.declared`) and the dispatch run with its counts (`snow_event.dispatched`) are audited. Counts live in the dispatch audit metadata (no count columns on `snow_events` — CF-15.1).
- **Source-agnostic** — a spawned snow job is an ordinary job (`source_type='snow_event'`) flowing into the existing Phase-5 dispatch/billing workflow; Snow does not fork the job model.
