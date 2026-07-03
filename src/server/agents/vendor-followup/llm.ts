import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { resolveAgentRouting, type AgentRouting } from "@/server/agents/llm-routing";
import { buildCandidates, runWithFailover } from "@/server/agents/failover";

// ── vendor_followup_v1 LLM — the soft rung-0 CHASE message ─────────────────────────────
// Mirrors intake-parser/scope llm.ts. Drafts ONE short, polite vendor-facing nudge asking for
// a status/ETA on a dispatch the vendor has gone quiet on. NUMBER-FREE by discipline: no prices,
// no NTE, and no date/time COMMITMENTS (a chase asks for an ETA; it never authorizes a reschedule
// or promises the client anything). The output is a DRAFT — an operator reviews before anything
// is sent, and sending is a separate step (this agent never sends).

export const followupSchema = z.object({
  chaseMessage: z
    .string()
    .describe("A short, polite message to the vendor asking them to confirm they are still on the job and give an ETA. One or two sentences."),
  confidence: z.enum(["high", "medium", "low"]).describe("Your confidence in the message."),
  rationale: z.string().describe("One line explaining the tone/content choices."),
});
export type FollowupResult = z.infer<typeof followupSchema>;

export type FollowupContext = {
  vendorName: string;
  jobNumber: number | null;
  problemDescription: string;
  hoursSinceSent: number;
};

export type FollowupOutcome = {
  object: FollowupResult;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};

export const VENDOR_FOLLOWUP_ROUTING = {
  mockEnvVar: "VENDOR_FOLLOWUP_MOCK",
  modelEnvVar: "VENDOR_FOLLOWUP_MODEL",
  defaultGatewayModel: "anthropic/claude-sonnet-4-6",
  defaultDirectModel: "claude-sonnet-4-6",
} as const;

/** The chase agent's routing decision (mock/gateway/direct) — resolved once, reused. */
export function resolveFollowupRouting(): AgentRouting {
  return resolveAgentRouting(VENDOR_FOLLOWUP_ROUTING);
}

/** Assemble the per-run user prompt from the stuck-dispatch context only. */
export function buildFollowupUserPrompt(ctx: FollowupContext): string {
  return [
    `Vendor: ${ctx.vendorName}`,
    `Work order: ${ctx.jobNumber ?? "—"}`,
    `Hours since dispatched with no response: ${ctx.hoursSinceSent}`,
    ``,
    `Problem:`,
    ctx.problemDescription,
  ].join("\n");
}

// Deterministic mock — a fixed polite chase, number-free, no date commitments.
function mockFollowup(ctx: FollowupContext): FollowupOutcome {
  return {
    object: {
      chaseMessage: `Hi ${ctx.vendorName}, checking in on work order ${ctx.jobNumber ?? "(pending)"} — can you confirm you're still able to take this and share an ETA? Thanks.`,
      confidence: "high",
      rationale: "[mock] deterministic polite chase, number-free.",
    },
    usage: { inputTokens: 0, outputTokens: 0 },
    model: "mock",
  };
}

/**
 * Draft a chase message from the stuck-dispatch context. Routing is passed in (the caller
 * resolves it once so it can decide whether to resolve the DB prompt). Mock branch is deterministic.
 */
export async function generateFollowup(input: {
  routing: AgentRouting;
  systemPrompt: string;
  ctx: FollowupContext;
  temperature: number;
  failoverOrder?: unknown;
  providerKeys?: Partial<Record<"anthropic" | "openai", string>>;
}): Promise<FollowupOutcome> {
  if (input.routing.mode === "mock") return mockFollowup(input.ctx);

  const userPrompt = buildFollowupUserPrompt(input.ctx);
  const candidates = buildCandidates(input.routing, input.failoverOrder, input.providerKeys);
  return runWithFailover(candidates, async (candidate) => {
    const result = await generateObject({
      model: candidate.model,
      schema: followupSchema,
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
      model: candidate.recordedModel,
    };
  });
}
