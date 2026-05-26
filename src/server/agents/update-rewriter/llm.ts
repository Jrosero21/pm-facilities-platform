import "server-only";

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
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

// Three routing modes resolved from env (LOCK 10/11), in precedence order:
//   REWRITER_MOCK=1            → mock (explicit dev override, wins over any key)
//   AI_GATEWAY_API_KEY set     → gateway: a plain "provider/model" string
//   ANTHROPIC_API_KEY set      → direct: the @ai-sdk/anthropic provider (bare model id)
//   (none)                     → mock (dev never hard-fails on a missing key)
// The model-id FORMAT differs by path: gateway "anthropic/claude-sonnet-4-6" vs direct
// "claude-sonnet-4-6" (no provider prefix). recordedModel normalizes both to the
// provider-qualified form for agent_runs.model. Extracted as a pure function so each branch
// is verifiable without a real LLM call.
export type RewriteRouting =
  | { mode: "mock" }
  | { mode: "gateway"; modelId: string; recordedModel: string }
  | { mode: "direct"; modelId: string; recordedModel: string };

export function resolveRouting(): RewriteRouting {
  if (process.env.REWRITER_MOCK === "1") return { mode: "mock" };
  if (process.env.AI_GATEWAY_API_KEY) {
    const modelId = process.env.REWRITER_MODEL ?? "anthropic/claude-sonnet-4-6";
    return { mode: "gateway", modelId, recordedModel: modelId };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const modelId = process.env.REWRITER_MODEL ?? "claude-sonnet-4-6";
    return { mode: "direct", modelId, recordedModel: `anthropic/${modelId}` };
  }
  return { mode: "mock" };
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
  const routing = resolveRouting();
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
