import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { resolveAgentRouting, type AgentRouting } from "@/server/agents/llm-routing";
import { buildProviderModel } from "@/server/agents/providers";
import { buildUserPrompt } from "./prompt";
import type { JobNoteRow } from "@/server/job-notes";
import type { JobDetail } from "@/server/jobs";

// The rewriter's structured-output contract. rephrasings is optional (audit-only; lands
// in agent_decisions.metadata, no draft column). LOCK 1.
export const rewriteSchema = z.object({
  clientFacingText: z.string().describe("The client-facing update text — no pricing/PII/internal context."),
  strippedItems: z.array(z.string()).describe("What was removed (pricing, PII, internal-only context)."),
  confidence: z.enum(["high", "medium", "low"]).describe("Your confidence in the rewrite."),
  rationale: z.string().describe("One line explaining the choices."),
  rephrasings: z.array(z.string()).optional().describe("Notable tone rephrasings, if any."),
});
export type RewriteResult = z.infer<typeof rewriteSchema>;

export type RewriteOutcome = {
  object: RewriteResult;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};

// Routing is resolved through the shared agent router (extracted Phase 7 batch 7c / D4).
// The rewriter's knobs are unchanged — REWRITER_MOCK / REWRITER_MODEL, same gateway/direct/
// mock precedence and the same recordedModel normalization the in-file resolveRouting did.
// Behavior preservation is verified by the D6 routing-parity matrix + a rewriter pipeline
// smoke (the extraction only moved the routing decision; it changed no behavior).
const REWRITER_ROUTING = {
  mockEnvVar: "REWRITER_MOCK",
  modelEnvVar: "REWRITER_MODEL",
  defaultGatewayModel: "anthropic/claude-sonnet-4-6",
  defaultDirectModel: "claude-sonnet-4-6",
} as const;

/**
 * The rewriter's routing decision — resolved once by runRewriter, then passed to
 * generateRewrite (mirrors resolveScopeRouting; runRewriter needs the mode to decide whether
 * to resolve the DB prompt).
 */
export function resolveRewriterRouting(): AgentRouting {
  return resolveAgentRouting(REWRITER_ROUTING);
}

function mockRewrite(): RewriteOutcome {
  return {
    object: {
      clientFacingText:
        "[MOCK] We have an update on your work order: the assigned team is progressing and we'll confirm next steps shortly.",
      strippedItems: ["[mock] internal pricing detail"],
      confidence: "high",
      rationale: "[mock] deterministic stub — REWRITER_MOCK enabled or no API key configured.",
      rephrasings: [],
    },
    usage: { inputTokens: 0, outputTokens: 0 },
    model: "mock",
  };
}

/**
 * Generate a client-facing rewrite of an internal note. Routing + the (DB-resolved) system
 * prompt + temperature are passed in by runRewriter (step 3: the prompt now comes from
 * ai_prompt_templates, no longer the in-code SYSTEM_PROMPT). Returns the structured object +
 * token usage + provider-qualified model; prompt_version is recorded by runRewriter.
 */
export async function generateRewrite(input: {
  routing: AgentRouting;
  systemPrompt: string;
  temperature: number;
  note: JobNoteRow;
  job: JobDetail;
  vendorNames: string[];
}): Promise<RewriteOutcome> {
  if (input.routing.mode === "mock") return mockRewrite();

  // gateway → string model; direct → the registry-built provider model (anthropic today,
  // provider-selectable in B2). Single call, single provider — no failover loop yet (B2).
  const model =
    input.routing.mode === "gateway"
      ? input.routing.modelId
      : buildProviderModel(input.routing.provider, input.routing.modelId);
  const result = await generateObject({
    model,
    schema: rewriteSchema,
    system: input.systemPrompt,
    prompt: buildUserPrompt({ note: input.note, job: input.job, vendorNames: input.vendorNames }),
    temperature: input.temperature,
  });
  return {
    object: result.object,
    usage: {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    },
    model: input.routing.recordedModel,
  };
}
