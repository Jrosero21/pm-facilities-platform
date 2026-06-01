# Phase 15 — API / Server Functions

Phase 15 is the **engine + data layer**. There are **no HTTP routes** — the route/action layer (and the operator UI that would call it) defers to the operator-portal phase (B-15.3). The API surface this phase is the three exported server functions in `src/server/snow/` (`"server-only"`). They are the units the future action wrappers + screens will call.

## `declareSnowEvent` — `src/server/snow/declare-event.ts`

```ts
declareSnowEvent(input: {
  tenantId: string;
  snowProgramId: string;
  name: string;
  weatherObservationId?: string | null;
  declaredByUserId?: string | null;
}): Promise<{
  eventId: string;
  siteCount: number;
  autoDispatched: boolean;
  status: "staged" | "complete";
  spawnedCount?: number;   // present when autoDispatched
  skippedCount?: number;   // present when autoDispatched
}>
```
Validates + snapshots the program's live sites (materialize-at-declare), opens the `snow_events` header, then branches on `auto_dispatch`. **Throws:** `SNOW_PROGRAM_NOT_FOUND`, `SNOW_PROGRAM_INACTIVE`.

## `dispatchSnowEventSites` — `src/server/snow/dispatch-sites.ts` (the shared workhorse)

```ts
dispatchSnowEventSites(input: {
  tenantId: string;
  eventId: string;
  actorUserId: string;
}): Promise<{
  eventId: string;
  spawnedCount: number;
  skippedCount: number;
  alreadyResolved?: boolean;   // true if the event was already 'complete' (idempotent no-op)
}>
```
Fans the event's `staged` dispatches into jobs (`createJob(source_type='snow_event')`), skip-and-flag per site, no outer txn (IF-4). **Throws:** `SNOW_EVENT_NOT_FOUND`, `SNOW_EVENT_CANCELLED`, `SNOW_PROGRAM_NOT_FOUND`. **Re-entry:** a `complete` event returns `{ alreadyResolved: true, spawnedCount: 0, skippedCount: 0 }`.

## `confirmSnowDispatches` — `src/server/snow/confirm-dispatches.ts` (the §2.5 gate)

```ts
confirmSnowDispatches(input: {
  tenantId: string;
  eventId: string;
  confirmedByUserId: string;
}): Promise<DispatchSnowEventSitesResult>   // delegates to dispatchSnowEventSites
```
Guards the event is in a confirmable (`declared`) state, then calls the workhorse, operator-attributed. **Throws:** `SNOW_EVENT_NOT_FOUND`, `SNOW_EVENT_DISPATCH_IN_PROGRESS` (concurrent-fire guard), `SNOW_EVENT_CANCELLED`. **Re-entry:** a `complete` event returns `{ alreadyResolved: true, ... }`.

## Downstream throws (from `createJob`, surfaced as `skip_reason`)

Per-site `createJob` failures are caught and recorded as `snow_dispatches.skip_reason` (the batch continues): `CLIENT_NOT_FOUND`, `LOCATION_NOT_FOUND`, `LOCATION_CLIENT_MISMATCH`, `PRIORITY_NOT_FOUND`, `TRADE_NOT_FOUND`, `STATUS_NOT_FOUND`.

## Barrel

`src/server/snow/index.ts` re-exports the three functions + the `DeclareSnowEventResult` / `DispatchSnowEventSitesResult` types. (No `src/server/index.ts` server barrel exists — PM/Snow are imported by path; the snow barrel is for the engine's own callers.)

## Deferred

- **HTTP routes + server actions** (the `requireTenant`/`requireRole` wrapper + friendly-error surface — the CF-14.2 analog) → operator-portal phase.
- **A read API / dashboard endpoint** for snow events → B-15.4.
