import "server-only";

import type { ProviderName } from "./providers";

// ── Phase 7 batch 7c — shared agent LLM routing (D4 extraction) ───────────────────────
// Extracted from update-rewriter/llm.ts so every agent shares one routing decision (the
// rewriter rewires to call this; behavior-preserving — verified by the D6 routing-parity
// matrix + a rewriter pipeline smoke). Precedence, per caller-named env vars:
//   <mockEnvVar>=1  OR  AGENT_MOCK=1   → mock   (AGENT_MOCK is a new global dev override,
//                                                additive: when unset, each agent's existing
//                                                behavior is byte-identical)
//   AI_GATEWAY_API_KEY set             → gateway: a plain "provider/model" string
//   ANTHROPIC_API_KEY set              → direct:  @ai-sdk/anthropic (bare model id)
//   (none)                             → mock    (dev never hard-fails on a missing key)
// recordedModel normalizes both live paths to the provider-qualified form for
// agent_runs.model (gateway "anthropic/…" as-is; direct prefixed). (R-6.25 / D-6.18.)

export type AgentRouting =
  | { mode: "mock" }
  | { mode: "gateway"; modelId: string; recordedModel: string }
  // Phase 24 track B — direct mode is now provider-parameterized. `provider` selects the SDK
  // factory (via the provider registry) at the call site. Today's behavior = provider
  // "anthropic" (byte-identical to the pre-B1 direct-Anthropic path); OpenAI selection arrives
  // with the policy preference + failover loop in B2.
  | { mode: "direct"; provider: ProviderName; modelId: string; recordedModel: string };

export type RoutingOptions = {
  /** Agent-specific mock toggle env var, e.g. "REWRITER_MOCK" / "SCOPE_GEN_MOCK". */
  mockEnvVar: string;
  /** Agent-specific model-override env var, e.g. "REWRITER_MODEL" / "SCOPE_GEN_MODEL". */
  modelEnvVar: string;
  /** Default gateway model id (provider-qualified), e.g. "anthropic/claude-sonnet-4-6". */
  defaultGatewayModel: string;
  /** Default direct model id (bare), e.g. "claude-sonnet-4-6". */
  defaultDirectModel: string;
};

export function resolveAgentRouting(opts: RoutingOptions): AgentRouting {
  // Precedence: AGENT_MOCK=1 forces mock for ALL agents (global override); otherwise the
  // per-agent <mockEnvVar> applies. Both only ever TRIGGER mock (never un-mock), so "global
  // beats local" never conflicts — global is an additional trigger. When AGENT_MOCK is unset,
  // each agent's existing mock behavior (e.g. REWRITER_MOCK) is byte-identical to pre-extraction.
  if (process.env[opts.mockEnvVar] === "1" || process.env.AGENT_MOCK === "1") {
    return { mode: "mock" };
  }
  if (process.env.AI_GATEWAY_API_KEY) {
    const modelId = process.env[opts.modelEnvVar] ?? opts.defaultGatewayModel;
    return { mode: "gateway", modelId, recordedModel: modelId };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const modelId = process.env[opts.modelEnvVar] ?? opts.defaultDirectModel;
    // B1: direct always resolves provider "anthropic" (the only env-driven direct path today) —
    // byte-identical to pre-B1. The `provider` field is the new plumbing for B2's preference.
    return { mode: "direct", provider: "anthropic", modelId, recordedModel: `anthropic/${modelId}` };
  }
  return { mode: "mock" };
}
