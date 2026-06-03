# Phase 24 — Chatbot Knowledge

Concise machine-usable facts for the future Phase-16 ops chatbot.

## Observability readers (`src/server/analytics/agent-observability.ts`, server-only, tenantId-first)
- `agentVolumeByAgent(tenantId)` → per agent: `{ total, succeeded, failed, inputTokens, outputTokens }` (tokens COALESCE'd; dispatch runs contribute 0 tokens).
- `agentDispositionBreakdown(tenantId)` → per agent: `{ queuedForReview, autoExecuted, policyBlocked }`.
- `dispatchAutonomyBreakdown(tenantId)` → `{ autoExecuted, policyBlocked, queuedForReview }` for `dispatch_router_v1` (all-zeros today = no autonomous dispatch yet).
- `agentApproveAsIs(tenantId)` → per agent: `{ applicable, reviewed, approvedAsIs, rate }`. Rewriter + scope `applicable:true`; `dispatch_router_v1` `applicable:false` (renders **N/A**, never 0%). Latest review per draft wins (dedupe).
- `agentFailurePoints(tenantId)` → per agent: `{ failedCount, recentErrors[] }` (errors truncated; null → `"(no message)"`).
- `agentCostByAgent(tenantId)` → per `(agentId, model)`: `{ inputCost, outputCost, totalCost }` decimal strings; null-model + unknown-model excluded.
- `agentLatencyDistribution(tenantId)` → `{ count, p50Seconds, p90Seconds, meanSeconds }`.

## Page
- **Route `/agents`** (App Router server component), top-nav after "Review". Read-only, gated at the **page layer** by `requireTenant` + `canSeeOperations` (no new role predicate). Numeric cards + tables only — no charting library.

## Cost map
- `src/server/agents/config/pricing.ts` — `priceFor(model)` keys on the provider-qualified model string (`"anthropic/claude-sonnet-4-6"`, `"openai/gpt-5.4"`). Unknown/NULL model → null → excluded from cost. Adding a model = one map entry.

## Multi-provider / failover
- Registry: `src/server/agents/providers.ts` — `PROVIDER_REGISTRY` keyed by `"anthropic"`/`"openai"`; `providerAvailable(name)` = env key present; `parseQualifiedModel`, `buildProviderModel`. Default order `["anthropic","openai"]`. OpenAI dormant without `OPENAI_API_KEY`.
- Failover: `src/server/agents/failover.ts` — `buildCandidates(routing, failoverOrder)` + `runWithFailover` + `isProviderTransportError`. Retries transport errors only (`APICallError` isRetryable/408/409/429/5xx); rethrows agent errors (`NoObjectGeneratedError`/validation/refusal). `recordedModel` = succeeding provider.
- **Preference JSON shape:** `agent_policies.policy.failoverOrder` = an **ordered array of provider-qualified model strings**, e.g. `["anthropic/claude-sonnet-4-6","openai/gpt-5.4"]`. Read via `resolveAgentPolicy(...).raw`; per-client → per-tenant → default ladder. Allowlist+order; absent/bad → env-driven base.

## Retention
- `src/server/agents/retention.ts` — `countEligibleAgentPayloads()` + the eligibility predicates (shared with the script). **180 days, NULL-not-delete** of `agent_tool_calls.tool_input`/`tool_output` + `agent_decisions.metadata`. Script: `pnpm db:retention:agent-payloads` (dry-run default; `--apply` to clear; prod-capable).

## Harness
- `scripts/check-phase-24.ts` (`pnpm db:check:observability`) — sandbox-forced, 28 assertions: observability readers (seeded `phase24-harness-tenant`), failover candidate-builder + predicate, retention counter. Proves the readers' shapes + the failover/retention logic.

## State
- **No live autonomy trigger** — `autoDispatchDraftForJob` invoked by nothing in app code (CF-24.2). **No schema change in Phase 24** — preference reuses `agent_policies` JSON; 0047 untouched.
