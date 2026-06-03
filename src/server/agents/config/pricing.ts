// ── Phase 24 track A — MODEL PRICE MAP (pure util) ────────────────────────────────────
// PURE util — NO "server-only", NO DB, NO IO (mirrors the config/ constants layer + the
// analytics/percentile.ts pure-util precedent). The single source of per-token LLM pricing
// for compute-on-read cost (analytics/agent-observability.ts → agentCostByAgent).
//
// Keys on the PROVIDER-QUALIFIED model string that llm-routing.ts writes to
// `agent_runs.model` (gateway "provider/model" as-is; direct prefixed) — e.g.
// "anthropic/claude-sonnet-4-6". Prices are USD per SINGLE token, as Big.js-compatible
// decimal strings (never float).
//
// THIS MAP IS THE SINGLE PLACE TO ADD MODELS/PRICES as providers/models are added in the
// multi-provider track (Phase 24 track B). An unknown or NULL model is UNMEASURABLE (priceFor
// → null); callers MUST treat null as "exclude from cost", never as $0 (the two-NULLs rule's
// cost analogue — a missing measurement is not a zero cost).

export type ModelPrice = {
  /** USD per single input token (decimal string, Big.js-compatible). */
  inputPerToken: string;
  /** USD per single output token (decimal string, Big.js-compatible). */
  outputPerToken: string;
};

// Published Anthropic pricing for the Sonnet tier: $3.00 / 1M input tokens, $15.00 / 1M
// output tokens → per single token = 3/1e6 and 15/1e6.
const MODEL_PRICES: Record<string, ModelPrice> = {
  "anthropic/claude-sonnet-4-6": {
    inputPerToken: "0.000003", // $3.00 per 1M input tokens
    outputPerToken: "0.000015", // $15.00 per 1M output tokens
  },
};

/**
 * Per-token price for a recorded model string. Returns null for an unknown or NULL model —
 * the caller treats null as UNMEASURABLE (exclude from cost), NEVER as zero cost.
 */
export function priceFor(model: string | null): ModelPrice | null {
  if (!model) return null;
  return MODEL_PRICES[model] ?? null;
}
