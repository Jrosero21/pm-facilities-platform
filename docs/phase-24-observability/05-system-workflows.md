# Phase 24 — System Workflows

Three flows landed/changed this phase. (No live autonomy trigger — see the deferred note.)

## 1. Routing + failover (the LLM call path)

The two LLM agents (rewriter, scope) resolve routing, then run the call through the failover
loop. `dispatch_router_v1` is rule-based (no LLM) and `chatbot_assistant_v1` makes no LLM call —
neither is in this path.

```
agent index.ts
  routing  = resolveRewriterRouting() / resolveScopeRouting()   // llm-routing.ts (env precedence:
             mock | gateway | direct{provider:"anthropic"})     //   unchanged from Phase 7/B1)
  policy   = resolveAgentPolicy(tenant, agentId, clientId)      // policies.ts (unchanged)
  failoverOrder = policy.raw.failoverOrder                      // read preference from JSON via raw
  generateRewrite/Scope({ routing, ..., failoverOrder }):
    if routing.mode === "mock" → deterministic mock (return)
    candidates = buildCandidates(routing, failoverOrder)        // failover.ts
        gateway → [single gateway candidate]
        direct  → preference chain (allowlist+order, available providers only)
                  else the single env-driven base (fail-safe)
    runWithFailover(candidates, run):
        for candidate in candidates:
          try  → generateObject({ model: candidate.model, schema, system, prompt })
                 return outcome { object, usage, model: candidate.recordedModel }  // truthful
          catch e:
            if isProviderTransportError(e)  → continue   // APICallError isRetryable/408/409/429/5xx
            else                            → throw       // NoObjectGenerated/validation/refusal
        // all candidates failed transport → throw last error → run fails as today
```

`recordedModel` is the **succeeding** provider, so `agent_runs.model` + the cost/volume readers
stay truthful under failover. The runner opens/closes the `agent_runs` row **once** around the
whole call — no per-candidate rows; a transport failure produced no object (no partial write).

## 2. Observability read (the /agents page)

```
/agents (server component)
  requireTenant() → canSeeOperations(ctx)  // page-layer gate; readers are tenant-scoped only
  Promise.all of the 7 readers (agent-observability.ts), all scoped to tenantId:
    agentVolumeByAgent · agentDispositionBreakdown · dispatchAutonomyBreakdown ·
    agentApproveAsIs (+ rewriter/scope adapters) · agentFailurePoints ·
    agentCostByAgent (model→price map, compute-on-read) · agentLatencyDistribution
  → inline JSX: numeric cards + tables (no charts); EmptyState for empty sections;
    dispatch approve-as-is renders "N/A"; cost excludes null/unknown-model rows
```

## 3. Retention (payload cleanup)

```
src/server/agents/retention.ts  (shared)
  predicate: created_at < NOW() - INTERVAL 180 DAY  AND  payload IS NOT NULL   // DB-side, idempotent
  countEligibleAgentPayloads() → { toolCalls, decisions, total }

scripts/retention-agent-payloads.ts  (prod-capable; dry-run default)
  DRY RUN (default): print eligible counts via countEligibleAgentPayloads(); write nothing
  --apply:           UPDATE … SET <payload>=NULL WHERE <predicate>   // NULL-not-delete, rows survive
```

## Deferred: the live autonomy trigger (CF-24.2)

`autoDispatchDraftForJob` (the governed auto-dispatch from Phase 23) is **invoked by nothing in
app code** — there is no job-creation hook, cron, or queue calling it. Phase 24 built the
observability evidence that the §2.3 readiness gate requires; **wiring the trigger is a separate
future decision** (CF-24.2), now informable by the `/agents` evidence. Until then, the agents
draft, operators review, and the observability surface accumulates the track record.
