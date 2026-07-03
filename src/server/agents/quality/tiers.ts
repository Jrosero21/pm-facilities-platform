// PURE module (no DB / server-only / env / IO). The agent_id → quality-tier mapping — a code
// constant that keys the platform accuracy floor (agent_quality_floors) to each agent.
//
// Tiers reflect action stakes:
//   tier1 — low-stakes phrasing (update_rewriter): a wrong call is cosmetic/reversible.
//   tier3 — high-stakes drafts that move money/scope (scope/invoice/proposal generators).
//   tier4 — highest-stakes autonomous choice (dispatch_tiebreaker breaks a vendor pick).
// dispatch_router_v1 is DETERMINISTIC (rule-based, no LLM, no confidence): its correctness is
// the eligibility floor's job, so the confidence quality bar is N/A (never blocks it).

export type QualityTier = "tier1" | "tier3" | "tier4";

const TIER_BY_AGENT: Readonly<Record<string, QualityTier>> = {
  update_rewriter_v1: "tier1",
  intake_parser_v1: "tier1", // suggestive, pre-job, human-gated — a mis-parse is caught at review before any job exists
  vendor_followup_v1: "tier1", // suggestive, pre-send, human-gated — a chase message is cheap and reversible
  scope_generator_v1: "tier3",
  invoice_creator_v1: "tier3",
  proposal_generator_v1: "tier3",
  dispatch_tiebreaker_v1: "tier4",
};

// Rule-based agents with no model confidence — the quality bar does not apply to them.
const DETERMINISTIC_AGENTS: ReadonlySet<string> = new Set(["dispatch_router_v1"]);

/** True for rule-based agents whose correctness is the eligibility floor, not a confidence bar. */
export function isDeterministicAgent(agentId: string): boolean {
  return DETERMINISTIC_AGENTS.has(agentId);
}

/** The agent's quality tier, or null when it's deterministic / has no tier mapping (N/A). */
export function tierForAgent(agentId: string): QualityTier | null {
  return TIER_BY_AGENT[agentId] ?? null;
}
