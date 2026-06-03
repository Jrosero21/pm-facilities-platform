# Phase 23 — API / Server Surface

**No new HTTP routes.** Phase 23 wires no live trigger and ships no UI, so there are no new
endpoints or server actions exposed to a client. The surface is server-side functions
(`"server-only"`) composed by `autoDispatchDraftForJob`, which is itself invoked by nothing in app
code (only the harness).

## Changed: `autoDispatchDraftForJob` result union (`src/server/auto-dispatch.ts`)

The discriminated `AutoDispatchResult` gained three outcomes and **dropped the bare `"drafted"`**
(every successful draft now runs the gate — `"drafted"` is fully subsumed):

```ts
type AutoDispatchResult =
  | { outcome: "auto_advanced"; assignmentId: string; vendorId: string; jobStatusAdvanced: boolean }
  | { outcome: "drafted_pending"; assignmentId: string; vendorId: string; blockedBy: string }
  | { outcome: "drafted_send_failed"; assignmentId: string; vendorId: string; error: string }
  | { outcome: "no_candidates" }
  | { outcome: "already_active"; existingAssignmentId?: string };
```

`blockedBy` ∈ `not_enabled | kill_switch | token_ceiling | unmeasurable_nte | spend_ceiling`.

## Changed: `sendDispatch` signature (`src/server/dispatch.ts`)

```ts
type SendDispatchInput = {
  tenantId: string;
  assignmentId: string;
  actorUserId: string | null;   // ← widened from `string` (the autonomy seam)
};
```

Operators pass a real user id (unchanged, compiles fine — `string` ⊂ `string | null`); the
auto-advance path passes `null` (system actor). No sink logic changed — all five write sinks
already accept NULL.

## New: guardrail meters (`src/server/agents/config/guardrails.ts`)

```ts
tenantTokensLast24h(tenantId): Promise<number>          // rolling 24h LLM tokens (all agents)
tenantTokensAllTime(tenantId): Promise<number>          // lifetime LLM tokens
withinTokenCeilings(tenantId): Promise<{ withinDay, withinTenant, ok }>

tenantCommittedLast24h(tenantId): Promise<CommittedMeter>   // { committed: string; unmeasurableCount: number }
tenantCommittedAllTime(tenantId): Promise<CommittedMeter>
withinSpendCeilings(tenantId, candidateJobId):
  Promise<{ withinJob, withinDay, withinTenant, candidateUnmeasurable, ok }>
```

All compute-on-read, never throw (any error → `ok: false`, fail toward gated). Dollar sums use
Big.js + `roundHalfUp` (house money discipline); token sums use SQL `SUM` over integer columns
with `COALESCE`.

## Changed: `resolveAgentPolicy` / `ResolvedPolicy` (`src/server/agents/config/policies.ts`)

```ts
type ResolvedPolicy = {
  requiresReview: boolean;
  autonomyEnabled: boolean;                                   // ← new (policy + kill-switch halves)
  raw: unknown;
  source: "kill_switch" | "tenant_client" | "tenant" | "default" | "fallback";   // ← "kill_switch" new
};
```

New **step 0** reads `tenant_autonomy_settings.kill_switch`; if on, returns
`{ requiresReview: true, autonomyEnabled: false, source: "kill_switch" }` above all policy. The
ladder (steps 1–4) and the never-throws / fail-safe contract are otherwise unchanged. The signature
was **not** widened (no `tx` param) — the kill-switch read is one extra query by design.

## Registry (`src/server/agents/registry.ts`)

Added `dispatch_router_v1` (`testOnly: false`, `outputType: "dispatch_draft"`, `inputSourceTypes:
["job"]`). `listProductionAgents()` now returns 4.
