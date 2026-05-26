import "server-only";

import { generateObject } from "ai";
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

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";

// REWRITER_MOCK=1 → deterministic stub (dev iteration without token cost). Also falls back
// to mock when no key is configured, so dev never hard-fails on a missing key (LOCK 10).
// The real call needs AI_GATEWAY_API_KEY (gateway) or ANTHROPIC_API_KEY (direct).
function shouldMock(): boolean {
  if (process.env.REWRITER_MOCK === "1") return true;
  return !process.env.AI_GATEWAY_API_KEY && !process.env.ANTHROPIC_API_KEY;
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
  if (shouldMock()) return mockRewrite();

  const model = process.env.REWRITER_MODEL ?? DEFAULT_MODEL;
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
    model,
    promptVersion: PROMPT_VERSION,
  };
}
