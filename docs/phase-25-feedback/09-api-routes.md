# Phase 25 — API Routes / Server Actions

## NONE.

Phase 25 added **no new routes, endpoints, or server actions**, and changed none. There is no new
operator-facing surface (see 03/04 — nothing new to click).

All changes are **internal to the agent pipeline**:

- `src/server/analytics/correction-pairs.ts` — new server-only module: the harvesting reader
  (`rewriterCorrectionPairs` / `scopeCorrectionPairs` / `correctionPairsForAgent` /
  `allCorrectionPairs`), `selectFewShotPairs`, `buildFewShotMessages`, and the shared
  `latestReviewPerDraft` primitive. Not an HTTP/action surface — consumed by the agent runners.
- `src/server/agents/update-rewriter/{llm,index}.ts` and
  `src/server/agents/scope-generator/{llm,index}.ts` — the existing `runRewriter` / `runScopeGenerator`
  flows now harvest + inject few-shot. Their signatures and call surfaces are unchanged; the
  injection is internal to the LLM transform step.
- `src/server/analytics/agent-observability.ts` — refactored to import the shared dedupe primitive;
  no behavior or surface change (Phase-24 readers unchanged).

The agents are invoked through their existing entry points (operator-triggered runs); no new
invocation path was introduced.
