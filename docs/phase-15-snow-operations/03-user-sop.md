# Phase 15 — User SOP (operator-facing)

> Phase 15 ships the **engine**, not the screens — there is no snow UI yet (B-15.3, defers to the operator-portal phase). This SOP describes the operator-facing *workflow* the engine implements, so the future UI maps onto it 1:1.

## What Snow Operations is

A snow program enrolls a subset of a client's sites for storm response. When a storm hits, an operator **declares a snow event** against the program. The system fans the event out across the enrolled sites and turns each into a work order (an ordinary job, tagged `snow_event`) that flows into the normal dispatch workflow.

## 1. Declaring a snow event

An operator declares an event for a program by name (e.g. "Jan 12 Nor'easter"). At declaration the system **freezes the fan-out**: it snapshots the program's currently-enrolled active sites into the event and creates one **staged** dispatch per site. A later change to the program's site list does NOT alter an already-declared event (materialize-at-declare).

## 2. Staging vs auto-dispatch

Each program has an **auto-dispatch** setting (default **off = stage**):

- **Stage (default):** declaring leaves the event in `declared` status with all dispatches `staged` — **no jobs are created yet.** This is the operator's review window — the §2.5 human gate.
- **Auto-dispatch (opt-in):** declaring immediately spawns the jobs (no separate confirm step). Use only for programs where speed at storm onset outweighs the review pause.

## 3. Batch-confirm (the stage path)

For a staged event, the operator **confirms the dispatches**. This spawns one job per staged site in a batch: each dispatch moves `staged → spawned` with its job linked; the event moves `declared → dispatching → complete`. Confirming an already-complete event is a safe no-op (it reports "already resolved" and spawns nothing).

## 4. What a spawned job looks like

Each spawned dispatch creates an ordinary job:
- `source_type = snow_event`, `source_external_id =` the event id (the storm batch id).
- Status **NEW**, with the program's client, the site's location, and the program's default trade / priority / problem description.
- Attributed to the confirming operator (stage path) or the declarer/SYSTEM (auto path).

From here the job is **just a job** — it dispatches to a vendor, gets scheduled, billed, etc. through the existing (Phase-5) workflow. Snow does not have its own separate dispatch screen.

## 5. When a site can't be turned into a job (skip-and-flag)

If one site can't spawn a job (e.g. a misconfigured enrollment pointing at a location under a different client), that **one** dispatch is marked `skipped` with the reason recorded — and **the rest of the batch still completes.** A storm with 30 sites and one bad enrollment dispatches 29 and flags the one; it never aborts the whole batch.

## Deferred (not available this phase)

- **Live weather trigger** — events are declared **manually**; there is no automatic weather-threshold fire (B-15.2).
- **Proof-of-service capture** — the schema to record what was done per dispatch (photos, GPS, notes) exists, but the field/mobile capture flow is not built (B-15.1).
- **Snow screens + a snow dashboard** — program CRUD, the declare/confirm surface, and a read dashboard defer to the operator-portal phase (B-15.3/B-15.4).
