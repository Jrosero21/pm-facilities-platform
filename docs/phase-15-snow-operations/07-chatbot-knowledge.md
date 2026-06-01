# Phase 15 — Chatbot Knowledge (Q&A for the future Phase-16 assistant)

> Knowledge surface for the planned Phase-16 assistant. Grounded in the live Phase-15 schema + engine; nothing speculative.

**Q: What is Snow Operations?**
A: An event-triggered batch module. A snow program enrolls a subset of a client's sites; when a storm hits, an operator declares a snow event and the system fans it out into one work order per enrolled site. It is the "second software within a software" — structurally parallel to Preventative Maintenance, with the trigger swapped from time/recurrence to a storm declaration, and with no recurrence (an event fires once).

**Q: How does Snow differ from reactive jobs and from PM?**
A: A **reactive job** is one-off (a tenant reports a problem). **PM** is time-triggered batch (a recurring schedule fans out over locations on a clock). **Snow** is **event-triggered batch** (a declared storm fans out over enrolled sites, once). All three converge on the same `jobs` table and dispatch workflow — Snow jobs are tagged `source_type='snow_event'`.

**Q: What are the tables? (the snow graph)**
A: Eight `snow_*` tables:
- `snow_programs` — the program (client + default trade/priority/problem + `auto_dispatch` flag).
- `snow_sites` — an **overlay** on `client_locations` enrolling a site into a program (+ `plow_priority`).
- `snow_service_triggers` — the trigger rule-shape (manual only this phase).
- `snow_events` — the **batch-run header** (one storm; status `declared`/`dispatching`/`complete`/`cancelled`).
- `snow_event_sites` — which enrolled sites this storm hits (the membership snapshot).
- `snow_dispatches` — the per-site **spawn/outcome** record (`job_id` once spawned, or `skip_reason` if skipped; status `staged`/`spawned`/`skipped`/`cancelled`).
- `snow_service_logs` — per-dispatch proof-of-service capture (schema only — runtime deferred).
- `snow_weather_observations` — weather placeholder (live feed deferred).

**Q: What are the engine functions?**
A: Three server functions in `src/server/snow/`:
- `declareSnowEvent` — an operator declares a storm; snapshots the live sites into the event + a staged dispatch each; branches on `auto_dispatch`.
- `dispatchSnowEventSites` — the shared workhorse; spawns one job per staged site (skip-and-flag on failure); both the auto path and the manual confirm call it.
- `confirmSnowDispatches` — the operator gate for the stage path; calls the workhorse.

**Q: How does a snow event become work orders?**
A: Declare → (auto: dispatch now | stage: operator confirms) → one `createJob(source_type='snow_event')` per site → those are ordinary jobs that dispatch/bill normally.

**Q: What happens if one site fails?**
A: Skip-and-flag — that one dispatch is marked `skipped` with the error reason, and the rest of the batch still spawns and completes. A single failure never aborts the batch.

**Q: Is the storm detected automatically from weather?**
A: No. Fire is **manual** this phase — an operator declares the event. The weather feed and auto-trigger are deferred (B-15.2); `snow_service_triggers`/`snow_weather_observations` are schema placeholders.

**Q: What's deferred / not built yet?**
A: The live weather feed + auto-trigger (B-15.2), the proof-of-service capture runtime (B-15.1), all operator UI (program CRUD, declare/confirm screens, mass-op — B-15.3), and a snow dashboard read surface (B-15.4). Batch counts currently live in audit metadata, not columns on `snow_events` (CF-15.1).
