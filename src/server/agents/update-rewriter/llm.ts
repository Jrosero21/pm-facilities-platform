import "server-only";

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { resolveAgentRouting } from "@/server/agents/llm-routing";
import { SYSTEM_PROMPT, PROMPT_VERSION, buildUserPrompt } from "./prompt";
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
  promptVersion: string;
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
    promptVersion: PROMPT_VERSION,
  };
}

/**
 * Generate a client-facing rewrite of an internal note. Returns the structured object +
 * token usage + provenance (model, prompt_version). Routes through the Vercel AI gateway
 * via a plain "provider/model" string (REWRITER_MODEL overrides; opus-4-7 available).
 */
export async function generateRewrite(input: {
  note: JobNoteRow;
  job: JobDetail;
  vendorNames: string[];
}): Promise<RewriteOutcome> {
  const routing = resolveAgentRouting(REWRITER_ROUTING);
  if (routing.mode === "mock") return mockRewrite();

  // gateway → string model; direct → the anthropic() provider model (bare id).
  const model = routing.mode === "gateway" ? routing.modelId : anthropic(routing.modelId);
  const result = await generateObject({
    model,
    schema: rewriteSchema,
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(input),
    temperature: 0.3,
  });
  return {
    object: result.object,
    usage: {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    },
    model: routing.recordedModel,
    promptVersion: PROMPT_VERSION,
  };
}
