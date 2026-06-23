import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { resolveAgentRouting, type AgentRouting } from "@/server/agents/llm-routing";
import { runWithFailover, buildCandidates } from "@/server/agents/failover";

export const DISPATCH_TIEBREAKER_ROUTING = {
  mockEnvVar: "DISPATCH_TIEBREAKER_MOCK",
  modelEnvVar: "DISPATCH_TIEBREAKER_MODEL",
  defaultGatewayModel: "anthropic/claude-sonnet-4-6",
  defaultDirectModel: "claude-sonnet-4-6",
} as const;
export function resolveDispatchTiebreakerRouting(): AgentRouting {
  return resolveAgentRouting(DISPATCH_TIEBREAKER_ROUTING);
}

// Structurally number-free: vendorId + confidence enum + rationale. No score,
// no rank, no amount field — the model cannot emit a number as data.
export const tiebreakSchema = z.object({
  vendorId: z.string().describe("The vendorId you choose. MUST be exactly one of the two provided candidate vendorIds."),
  confidence: z.enum(["high", "medium", "low"]).describe("Your confidence that this vendor is the better semantic fit."),
  rationale: z.string().describe("One line: why this vendor fits the job's described problem better. No dollar amounts."),
});
export type TiebreakResult = z.infer<typeof tiebreakSchema>;

export type TiebreakCandidate = { vendorId: string; vendorName: string; tradeContext: string };
export type TiebreakOutcome = {
  object: TiebreakResult;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};

/** Server-side guard: the model's pick is only honored if it is one of the pair. */
export function validateTiebreakPick(vendorId: string, allowed: string[]): string | null {
  return typeof vendorId === "string" && allowed.includes(vendorId) ? vendorId : null;
}

function buildTiebreakUserPrompt(input: { problemDescription: string; pair: TiebreakCandidate[] }): string {
  const lines = input.pair
    .map((c) => `- vendorId ${c.vendorId} (${c.vendorName}): ${c.tradeContext}`)
    .join("\n");
  return [
    "Two vendors are an almost-equal match for this job by track record.",
    "Pick the ONE that better fits the specific problem described, by specialization.",
    "",
    `Job problem: ${input.problemDescription}`,
    "",
    "Candidates:",
    lines,
    "",
    `Respond with the vendorId of your pick — it MUST be exactly one of: ${input.pair.map((c) => c.vendorId).join(", ")}.`,
  ].join("\n");
}

function mockTiebreak(pair: TiebreakCandidate[]): TiebreakOutcome {
  // Deterministic offline stub: no semantic adjustment -> defer to the
  // deterministic ranking's leader (pair[0]). Mirrors "LLM made no change".
  return {
    object: {
      vendorId: pair[0].vendorId,
      confidence: "low",
      rationale: "[mock] deterministic stub — DISPATCH_TIEBREAKER_MOCK enabled or no API key configured.",
    },
    usage: { inputTokens: 0, outputTokens: 0 },
    model: "mock",
  };
}

export async function generateDispatchTiebreak(input: {
  routing: AgentRouting;
  systemPrompt: string;
  temperature: number;
  failoverOrder?: unknown;
  // CF-23.1 (K3b): tenant's own LLM key per provider, threaded by the auto-dispatch orchestrator. Absent → platform.
  providerKeys?: Partial<Record<"anthropic" | "openai", string>>;
  problemDescription: string;
  pair: TiebreakCandidate[];
}): Promise<TiebreakOutcome> {
  if (input.routing.mode === "mock") return mockTiebreak(input.pair);
  const userPrompt = buildTiebreakUserPrompt({ problemDescription: input.problemDescription, pair: input.pair });
  const candidates = buildCandidates(input.routing, input.failoverOrder, input.providerKeys);
  return runWithFailover(candidates, async (candidate) => {
    const result = await generateObject({
      model: candidate.model,
      schema: tiebreakSchema,
      system: input.systemPrompt,
      prompt: userPrompt,
      temperature: input.temperature,
    });
    return {
      object: result.object,
      usage: { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 },
      model: candidate.recordedModel,
    };
  });
}
