import { validateTiebreakPick } from "./llm";

/** Per-tenant firing mode, read from agent policy JSON (resolved.raw.tiebreakerMode). */
export type TiebreakerMode = "autonomy_only" | "always_on_close_call" | "off";

/** Conservative default when the policy key is absent/null/unknown (kill-switch,
 *  no-policy, or a tenant that never set it): fire only when autonomy is on. */
export const DEFAULT_TIEBREAKER_MODE: TiebreakerMode = "autonomy_only";

export function parseTiebreakerMode(raw: unknown): TiebreakerMode {
  const v = (raw as { tiebreakerMode?: unknown } | null | undefined)?.tiebreakerMode;
  return v === "always_on_close_call" || v === "off" || v === "autonomy_only"
    ? v
    : DEFAULT_TIEBREAKER_MODE;
}

/** Whether the LLM may be spent, given mode + autonomy + token headroom.
 *  Any false => no call => deterministic ranking stands. */
export function shouldFireTiebreaker(input: {
  closeCall: boolean;
  mode: TiebreakerMode;
  autonomyEnabled: boolean;
  tokenOk: boolean;
}): boolean {
  if (!input.closeCall) return false;
  if (!input.tokenOk) return false;            // §2.4 ceiling: over budget => never spend
  switch (input.mode) {
    case "off": return false;
    case "autonomy_only": return input.autonomyEnabled;
    case "always_on_close_call": return true;  // also annotates held drafts
  }
}

export type TiebreakDecision = {
  winnerVendorId: string;
  changedByLlm: boolean;
  source: "deterministic" | "llm_tiebreak";
  llmConfidence?: "high" | "medium" | "low";
  llmRationale?: string;
};

/** Apply an LLM pick to the close pair SAFELY. The LLM may only swap the order
 *  of the two close candidates; out-of-pair / null / (optionally) low-confidence
 *  => deterministic leader stands. The LLM never reaches beyond the pair. */
export function applyTiebreak(input: {
  deterministicWinnerId: string;   // ranked[0].vendorId
  pairIds: [string, string];       // [ranked[0].vendorId, ranked[1].vendorId]
  llm: { vendorId: string; confidence: "high" | "medium" | "low"; rationale: string } | null;
  honorLowConfidence?: boolean;    // default false: low-confidence LLM pick does NOT override determinism
}): TiebreakDecision {
  const detWinner = input.deterministicWinnerId;
  if (!input.llm) {
    return { winnerVendorId: detWinner, changedByLlm: false, source: "deterministic" };
  }
  const picked = validateTiebreakPick(input.llm.vendorId, input.pairIds); // out-of-pair => null
  if (picked === null) {
    return { winnerVendorId: detWinner, changedByLlm: false, source: "deterministic" };
  }
  if (input.llm.confidence === "low" && input.honorLowConfidence !== true) {
    return { winnerVendorId: detWinner, changedByLlm: false, source: "deterministic" };
  }
  const changed = picked !== detWinner;
  return {
    winnerVendorId: picked,
    changedByLlm: changed,
    source: changed ? "llm_tiebreak" : "deterministic",
    llmConfidence: input.llm.confidence,
    llmRationale: input.llm.rationale,
  };
}
