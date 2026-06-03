import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { resolveAgentRouting, type AgentRouting } from "@/server/agents/llm-routing";
import { buildProviderModel } from "@/server/agents/providers";
import type { JobDetail } from "@/server/jobs";

// ── Phase 7 batch 7c — scope generator LLM ────────────────────────────────────────────
// The structured-output contract + the per-run user-prompt assembly. The SYSTEM prompt is
// NOT here — it is DB-stored (ai_prompt_templates, resolved by the agent and passed in);
// only the mechanical context assembly lives in code (user_prompt_template is intentionally
// NULL in Phase 7). Routing is resolved by the caller (so it can decide whether to resolve
// the DB prompt) and passed in; generateScope handles the mock branch internally.

// Step shape matches ScopeStep (drafts.ts) and the job_scope_steps columns.
export const scopeStepSchema = z.object({
  order: z.number().int().describe("1-based position in the scope sequence."),
  instruction: z.string().describe("A single imperative step a technician can follow on site."),
  category: z
    .enum(["assess", "perform", "cleanup", "verify", "document"])
    .optional()
    .describe("The kind of work this step represents."),
  expectsPhoto: z.boolean().optional().describe("Whether before/after photo evidence should be captured for this step."),
});

export const scopeSchema = z.object({
  steps: z.array(scopeStepSchema).describe("The ordered scope of work."),
  assumptions: z.array(z.string()).describe("Material assumptions made (e.g. fixture type, scope boundaries)."),
  confidence: z.enum(["high", "medium", "low"]).describe("Your confidence in the scope."),
  rationale: z.string().describe("One line explaining the choices."),
});
export type ScopeResult = z.infer<typeof scopeSchema>;

export type ScopeOutcome = {
  object: ScopeResult;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};

export const SCOPE_GEN_ROUTING = {
  mockEnvVar: "SCOPE_GEN_MOCK",
  modelEnvVar: "SCOPE_GEN_MODEL",
  defaultGatewayModel: "anthropic/claude-sonnet-4-6",
  defaultDirectModel: "claude-sonnet-4-6",
} as const;

/** The scope generator's routing decision (mock/gateway/direct) — resolved once, reused. */
export function resolveScopeRouting(): AgentRouting {
  return resolveAgentRouting(SCOPE_GEN_ROUTING);
}

/** Assemble the per-run user prompt from current-job context only (OQ #6). */
export function buildScopeUserPrompt(job: JobDetail): string {
  return [
    `Trade: ${job.tradeName ?? "—"}`,
    `Client: ${job.clientName ?? "—"}`,
    `Location: ${job.locationName ?? "—"}`,
    `Priority: ${job.priorityName ?? "—"}`,
    ``,
    `Problem description:`,
    job.problemDescription,
  ].join("\n");
}

function mockScope(): ScopeOutcome {
  return {
    object: {
      steps: [
        { order: 1, instruction: "[MOCK] Assess the reported issue and the surrounding area.", category: "assess", expectsPhoto: true },
        { order: 2, instruction: "[MOCK] Perform the corrective work per standard practice for the trade.", category: "perform" },
        { order: 3, instruction: "[MOCK] Test operation and confirm the issue is resolved.", category: "verify", expectsPhoto: true },
      ],
      assumptions: ["[mock] deterministic stub — SCOPE_GEN_MOCK enabled or no API key configured."],
      confidence: "high",
      rationale: "[mock] deterministic stub.",
    },
    usage: { inputTokens: 0, outputTokens: 0 },
    model: "mock",
  };
}

/**
 * Generate a structured scope from current-job context. Routing is passed in (the caller
 * resolves it once so it can decide whether to resolve the DB prompt). Returns the
 * structured object + token usage + provider-qualified model. Mock branch is deterministic.
 */
export async function generateScope(input: {
  routing: AgentRouting;
  systemPrompt: string;
  job: JobDetail;
  temperature: number;
}): Promise<ScopeOutcome> {
  if (input.routing.mode === "mock") return mockScope();

  // gateway → string model; direct → the registry-built provider model (anthropic today,
  // provider-selectable in B2). Single call, single provider — no failover loop yet (B2).
  const model =
    input.routing.mode === "gateway"
      ? input.routing.modelId
      : buildProviderModel(input.routing.provider, input.routing.modelId);
  const result = await generateObject({
    model,
    schema: scopeSchema,
    system: input.systemPrompt,
    prompt: buildScopeUserPrompt(input.job),
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
