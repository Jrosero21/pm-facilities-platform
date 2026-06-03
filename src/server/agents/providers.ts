import "server-only";

import type { LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

// ── Phase 24 track B — PROVIDER REGISTRY (providers are DATA, not structure) ───────────
// The single map of live LLM providers for the direct-SDK path. Adding a third provider
// later (e.g. Gemini) is ONE map entry + one config/pricing.ts entry — no logic change.
// Sits beside llm-routing.ts (the routing seam it serves), NOT in config/, because it
// carries SDK FACTORY FUNCTIONS (not pure constants like pricing.ts) and llm-routing.ts —
// the module it extends — also lives at agents/.
//
// FAIL-SAFE (locked): a provider whose env key is unset is simply UNAVAILABLE
// (providerAvailable → false), NEVER an error. With no OPENAI_API_KEY, OpenAI is dormant and
// Anthropic handles everything exactly as today. Providers use the PLATFORM's env keys;
// tenant-supplied-key storage is deferred behind CF-12.4 (not built here).
//
// recordedPrefix keeps agent_runs.model provider-qualified ("anthropic/…", "openai/…") so the
// cost reader (config/pricing.ts priceFor) keys on the same string the model resolves to.

export type ProviderName = "anthropic" | "openai";

export type ProviderEntry = {
  /** Env var holding the platform key for this provider. */
  envKey: string;
  /** Build the AI-SDK model object from a BARE model id (e.g. "claude-sonnet-4-6"). */
  buildModel: (bareId: string) => LanguageModel;
  /** Provider-qualified prefix written to agent_runs.model (e.g. "anthropic/"). */
  recordedPrefix: string;
  /** Provider-qualified default model id. */
  defaultModel: string;
};

export const PROVIDER_REGISTRY: Record<ProviderName, ProviderEntry> = {
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    buildModel: (bareId) => anthropic(bareId),
    recordedPrefix: "anthropic/",
    defaultModel: "anthropic/claude-sonnet-4-6",
  },
  openai: {
    envKey: "OPENAI_API_KEY",
    buildModel: (bareId) => openai(bareId),
    recordedPrefix: "openai/",
    defaultModel: "openai/gpt-5.4",
  },
};

// Default failover order (CONSUMED in B2; seeded now so the data lands with the registry):
// Anthropic (Claude) first, then OpenAI.
export const DEFAULT_FAILOVER_ORDER: ProviderName[] = ["anthropic", "openai"];

/** Is this provider's platform key configured? Unset key → false (dormant), never an error. */
export function providerAvailable(name: ProviderName): boolean {
  return !!process.env[PROVIDER_REGISTRY[name].envKey];
}

/**
 * Parse a provider-qualified model string ("openai/gpt-5.4") into { provider, bareId }.
 * Returns null for an unknown provider or a malformed string (caller falls back safely).
 */
export function parseQualifiedModel(
  qualified: string,
): { provider: ProviderName; bareId: string } | null {
  const slash = qualified.indexOf("/");
  if (slash <= 0 || slash === qualified.length - 1) return null;
  const provider = qualified.slice(0, slash);
  const bareId = qualified.slice(slash + 1);
  if (!(provider in PROVIDER_REGISTRY)) return null;
  return { provider: provider as ProviderName, bareId };
}

/** Build the AI-SDK model object for a provider + bare id (the direct-SDK path). */
export function buildProviderModel(provider: ProviderName, bareId: string): LanguageModel {
  return PROVIDER_REGISTRY[provider].buildModel(bareId);
}
