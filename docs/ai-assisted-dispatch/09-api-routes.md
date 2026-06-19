# AI-Assisted Dispatch — API Routes / Server Actions

## New routes / public actions: NONE
This work added no HTTP route and no new public server action. Deliberate: the
feature is internal to the existing dispatch server path.

## Where it runs
- `autoDispatchDraftForJob(tenantId, jobId)` in `src/server/auto-dispatch.ts` —
  the existing dispatch entry point; the re-rank and tiebreaker were layered
  inside it, not exposed as a new surface.
- `getVendorPerformanceScoresForVendors(...)` — internal server reader.
- `generateDispatchTiebreak(...)` / the `dispatch-tiebreaker` module — internal
  agent helpers, invoked only from within the dispatch path.

## Invocation
The dispatch path is triggered as it was before this work (no new trigger). The
acceptance harness invokes `autoDispatchDraftForJob` directly:
`pnpm run db:check:ai-dispatch` (sandbox-guarded).

## Future surface (not built)
Operator-facing read of the ranking/tiebreak rationale would add a route/action
in a later UI phase (CF-AID.4) — none added here.
