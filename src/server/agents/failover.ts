import "server-only";

import { APICallError, type LanguageModel } from "ai";
import { parseQualifiedModel, providerAvailable, buildProviderModel } from "./providers";
import type { AgentRouting } from "./llm-routing";

// ── Phase 24 track B (B2) — PROVIDER PREFERENCE + FAILOVER ────────────────────────────
// Reads provider preference from the resolved policy JSON (agent_policies/_defaults →
// resolved.raw.failoverOrder) and runs the direct-SDK call across an ordered candidate chain,
// failing over to the next provider ONLY on a provider/transport error. Lives beside the
// routing seam; the loop is invoked from the two LLM call sites (rewriter, scope), NOT inside
// resolveAgentRouting.
//
// PREFERENCE SHAPE (recorded decision): `failoverOrder` is an ordered array of
// PROVIDER-QUALIFIED MODEL STRINGS, e.g. ["anthropic/claude-sonnet-4-6", "openai/gpt-5.4"].
// Chosen over bare provider names because it lets a tenant pin a specific model per provider
// and reuses parseQualifiedModel; an entry's provider that is unknown or unavailable is skipped.
//
// ALLOWLIST + ORDER, NOT A FLOOR (recorded decision): only the providers the preference LISTS
// (and that are available) are tried, in that order. We do NOT auto-append DEFAULT_FAILOVER_ORDER
// or any available-but-unlisted provider. The ONE exception is the fail-safe degenerate case:
// if the preference yields ZERO runnable candidates (absent / not-an-array / all entries
// unknown or unavailable), we fall back to the single env-driven base routing candidate
// (today's behavior) — a missing/unusable preference must NEVER hard-fail a tenant, never error.

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

/**
 * Provider/transport error → retry the NEXT candidate. Anything else → rethrow (no failover):
 * a legitimate agent error (NoObjectGeneratedError / schema-validation / content-refusal) would
 * just burn the next provider too. Keyed on the installed ai@6 taxonomy: APICallError
 * (re-exported from @ai-sdk/provider) carries `isRetryable: boolean` + optional `statusCode`.
 */
export function isProviderTransportError(e: unknown): boolean {
  if (!APICallError.isInstance(e)) return false;
  return e.isRetryable === true || (e.statusCode != null && RETRYABLE_STATUS.has(e.statusCode));
}

export type ModelCandidate = {
  /** The AI-SDK model to pass to generateObject (a built provider model, or a gateway string). */
  model: LanguageModel | string;
  /** Provider-qualified string recorded to agent_runs.model — the model that ACTUALLY ran. */
  recordedModel: string;
};

/**
 * Build the ordered candidate list. gateway → single candidate (the gateway does its own
 * provider routing; preference applies to the direct-SDK path). direct → the preference chain
 * (allowlist+order, filtered to available providers), else the single env-driven base candidate.
 * mock is handled by the caller (it returns before failover).
 */
export function buildCandidates(routing: AgentRouting, failoverOrder: unknown): ModelCandidate[] {
  if (routing.mode === "gateway") {
    return [{ model: routing.modelId, recordedModel: routing.recordedModel }];
  }
  if (routing.mode === "mock") {
    return []; // caller returns the mock outcome before invoking failover
  }
  // direct — base = today's env-driven anthropic result (byte-identical to pre-B2).
  const base: ModelCandidate = {
    model: buildProviderModel(routing.provider, routing.modelId),
    recordedModel: routing.recordedModel,
  };
  if (!Array.isArray(failoverOrder)) return [base]; // no/!array preference → today's behavior

  const candidates: ModelCandidate[] = [];
  for (const entry of failoverOrder) {
    if (typeof entry !== "string") continue;
    const parsed = parseQualifiedModel(entry); // unknown provider / malformed → null → skip
    if (!parsed) continue;
    if (!providerAvailable(parsed.provider)) continue; // no key for this provider → skip (no error)
    candidates.push({
      model: buildProviderModel(parsed.provider, parsed.bareId),
      recordedModel: entry,
    });
  }
  // Fail-safe: a preference that lists nothing runnable falls back to base (never hard-fails).
  return candidates.length > 0 ? candidates : [base];
}

/**
 * Run candidates in order. First success returns its result. A provider/transport failure
 * advances to the next candidate; a legitimate agent error rethrows immediately (no failover).
 * If every candidate fails with a transport error, the last error throws (the whole chain is
 * down → the run fails as today). The runner opens/closes the agent_runs row ONCE around this
 * call — no per-candidate run/decision rows are written; a transport failure produced no object,
 * so there is no partial write to undo.
 */
export async function runWithFailover<R>(
  candidates: ModelCandidate[],
  run: (candidate: ModelCandidate) => Promise<R>,
): Promise<R> {
  let lastErr: unknown;
  for (const candidate of candidates) {
    try {
      return await run(candidate);
    } catch (e) {
      if (isProviderTransportError(e)) {
        lastErr = e;
        continue;
      }
      throw e; // legitimate agent error → do NOT failover
    }
  }
  throw lastErr;
}
