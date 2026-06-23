import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { resolveAgentRouting, type AgentRouting } from "@/server/agents/llm-routing";
import { buildCandidates, runWithFailover } from "@/server/agents/failover";
import { buildFewShotMessages, type CorrectionPair } from "@/server/analytics/correction-pairs";
import { lineItemCategoryEnum } from "@/server/schema/billing-shared";
import type { JobDetail } from "@/server/jobs";
import { buildProposalUserPrompt } from "./prompt";

// ── Phase 27 batch 3b — proposal generator LLM ────────────────────────────────────────
// The structured-output contract + the per-run user-prompt assembly. The SYSTEM prompt is
// DB-stored (ai_prompt_templates, resolved by the agent and passed in); only the mechanical
// context assembly lives in code. Routing is resolved by the caller and passed in; the mock
// branch is handled internally. Mirrors invoice-creator/llm.ts.
//
// MONEY-SAFETY (D1) — the schema is NUMBER-FREE BY CONSTRUCTION. A line item carries ONLY
// category + description + scopePhrasing; there is NO quantity / unit_price / markup / total /
// lineNumber field anywhere in the schema, so the model is STRUCTURALLY UNABLE to emit a dollar
// figure. The amounts are authored by the OPERATOR at the review gate (edits.ts) and resolved by
// publish.ts — never here.

// One proposed line — PHRASING ONLY. scopePhrasing is the work-scope language for the line;
// description is the client/operator-facing label. NEITHER carries a number.
const proposalLineSchema = z.object({
  category: z.enum(lineItemCategoryEnum).describe("The proposal line category."),
  description: z.string().describe("Short client-facing label for this line. NO amounts."),
  scopePhrasing: z.string().describe("The work-scope language describing what this line covers. NO amounts."),
});

export const proposalSchema = z.object({
  lineItems: z.array(proposalLineSchema).describe("The proposal lines — phrasing only, no amounts."),
  confidence: z.enum(["high", "medium", "low"]).describe("Your confidence in the drafted proposal."),
  rationale: z.string().describe("One line explaining the choices."),
});
export type ProposalResult = z.infer<typeof proposalSchema>;

export type ProposalOutcome = {
  object: ProposalResult;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};

// Same default models as INVOICE_CREATOR_ROUTING; proposal-specific mock/model env vars.
export const PROPOSAL_GENERATOR_ROUTING = {
  mockEnvVar: "PROPOSAL_GENERATOR_MOCK",
  modelEnvVar: "PROPOSAL_GENERATOR_MODEL",
  defaultGatewayModel: "anthropic/claude-sonnet-4-6",
  defaultDirectModel: "claude-sonnet-4-6",
} as const;

/** The proposal generator's routing decision (mock/gateway/direct) — resolved once, reused. */
export function resolveProposalRouting(): AgentRouting {
  return resolveAgentRouting(PROPOSAL_GENERATOR_ROUTING);
}

function mockProposal(): ProposalOutcome {
  return {
    object: {
      lineItems: [
        {
          category: "labor",
          description: "[MOCK] On-site service to address the reported scope of work.",
          scopePhrasing: "[mock] Perform the work described in the job problem statement and approved scope.",
        },
      ],
      confidence: "high",
      rationale: "[mock] deterministic stub — PROPOSAL_GENERATOR_MOCK enabled or no API key configured.",
    },
    usage: { inputTokens: 0, outputTokens: 0 },
    model: "mock",
  };
}

/**
 * Generate a NUMBER-FREE proposal draft (phrasing only) from job context. Routing is passed in
 * (the caller resolves it once so it can decide whether to resolve the DB prompt). Returns the
 * structured object + token usage + provider-qualified model. The mock branch is deterministic.
 * NO amounts are produced here (D1).
 */
export async function generateProposal(input: {
  routing: AgentRouting;
  systemPrompt: string;
  job: JobDetail;
  temperature: number;
  // B2: provider preference from the resolved policy JSON (resolved.raw.failoverOrder), threaded
  // by runProposalGenerator. Absent/bad → today's single env-driven provider (fail-safe).
  failoverOrder?: unknown;
  // CF-23.1 (K3b): tenant's own LLM key per provider, threaded by runProposalGenerator. Absent → platform.
  providerKeys?: Partial<Record<"anthropic" | "openai", string>>;
  // Phase 25 (wired in Batch 4): operator-correction few-shot pairs. Empty/absent → single-shot.
  fewShot?: CorrectionPair[];
}): Promise<ProposalOutcome> {
  if (input.routing.mode === "mock") return mockProposal();

  // Few-shot prior turns from operator corrections. Empty → unchanged single-shot path.
  const fewShotTurns = buildFewShotMessages(input.fewShot ?? []);
  const userPrompt = buildProposalUserPrompt({ job: input.job });

  // Ordered candidate chain from preference (allowlist+order, available providers only); else
  // the single env-driven base. Fail over to the next ONLY on a provider/transport error.
  const candidates = buildCandidates(input.routing, input.failoverOrder, input.providerKeys);
  return runWithFailover(candidates, async (candidate) => {
    const result =
      fewShotTurns.length > 0
        ? await generateObject({
            model: candidate.model,
            schema: proposalSchema,
            system: input.systemPrompt,
            messages: [...fewShotTurns, { role: "user", content: userPrompt }],
            temperature: input.temperature,
          })
        : await generateObject({
            model: candidate.model,
            schema: proposalSchema,
            system: input.systemPrompt,
            prompt: userPrompt,
            temperature: input.temperature,
          });
    return {
      object: result.object,
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      },
      // truthful: the model that ACTUALLY ran (the succeeding candidate).
      model: candidate.recordedModel,
    };
  });
}
