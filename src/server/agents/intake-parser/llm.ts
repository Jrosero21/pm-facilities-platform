import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { resolveAgentRouting, type AgentRouting } from "@/server/agents/llm-routing";
import { buildCandidates, runWithFailover } from "@/server/agents/failover";

// ── intake_parser_v1 LLM — structured EXTRACTION from an inbound blob ──────────────────
// Mirrors scope-generator/llm.ts. The value here is the EXTRACTION half only: turn a
// free-text inbound email into structured fields + extracted codes. Resolution (code → id)
// is NOT here — index.ts feeds these codes into the EXISTING mappers (resolveTrade /
// resolvePriority / external_client_mappings). NUMBER-FREE by discipline: no dollar / NTE
// fields ever (money is operator-authored downstream, never parsed from inbound text).

export const intakeSchema = z.object({
  extractedClientCode: z
    .string()
    .optional()
    .describe("The client's account/portal code if the email states one (a code, not a name). Omit if absent."),
  extractedTradeCode: z
    .string()
    .optional()
    .describe("The trade/service code if the email uses one. Omit if only a free-text trade is mentioned."),
  extractedPriorityCode: z
    .string()
    .optional()
    .describe("The priority/severity code if stated. Omit if absent."),
  locationDetail: z
    .string()
    .optional()
    .describe("The site/location exactly as written (store name or address), UNRESOLVED free text. Omit if none."),
  problemDescription: z
    .string()
    .describe("A clear one-to-two sentence statement of the reported problem or work needed."),
  confidence: z.enum(["high", "medium", "low"]).describe("Your confidence in this extraction."),
  rationale: z.string().describe("One line explaining the extraction choices."),
});
export type IntakeResult = z.infer<typeof intakeSchema>;

export type IntakeBlob = { subject: string | null; bodyText: string | null };

export type IntakeOutcome = {
  object: IntakeResult;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};

export const INTAKE_PARSER_ROUTING = {
  mockEnvVar: "INTAKE_PARSER_MOCK",
  modelEnvVar: "INTAKE_PARSER_MODEL",
  defaultGatewayModel: "anthropic/claude-sonnet-4-6",
  defaultDirectModel: "claude-sonnet-4-6",
} as const;

/** The intake parser's routing decision (mock/gateway/direct) — resolved once, reused. */
export function resolveIntakeRouting(): AgentRouting {
  return resolveAgentRouting(INTAKE_PARSER_ROUTING);
}

/** Assemble the per-run user prompt from the inbound blob only (subject + body). */
export function buildIntakeUserPrompt(blob: IntakeBlob): string {
  return [
    `Subject: ${blob.subject ?? "—"}`,
    ``,
    `Body:`,
    blob.bodyText ?? "",
  ].join("\n");
}

// Deterministic mock — derives extracted fields from simple CLIENT:/TRADE:/PRIORITY:/LOCATION:
// markers in the blob (so a caller/harness controls extraction by crafting the inbound text).
// Everything else becomes the problem description. Number-free, like the real path.
function mockIntake(blob: IntakeBlob): IntakeOutcome {
  const text = `${blob.subject ?? ""}\n${blob.bodyText ?? ""}`;
  const grab = (label: string): string | undefined => {
    const m = text.match(new RegExp(`^${label}:\\s*(.+)$`, "im"));
    return m ? m[1].trim() : undefined;
  };
  const problem = (blob.bodyText ?? "")
    .split("\n")
    .filter((l) => !/^(CLIENT|TRADE|PRIORITY|LOCATION):/i.test(l.trim()))
    .join(" ")
    .trim();
  return {
    object: {
      extractedClientCode: grab("CLIENT"),
      extractedTradeCode: grab("TRADE"),
      extractedPriorityCode: grab("PRIORITY"),
      locationDetail: grab("LOCATION"),
      problemDescription: problem || "[mock] reported issue — see inbound email.",
      confidence: "high",
      rationale: "[mock] deterministic marker-based extraction.",
    },
    usage: { inputTokens: 0, outputTokens: 0 },
    model: "mock",
  };
}

/**
 * Extract structured intake fields from an inbound blob. Routing is passed in (the caller
 * resolves it once so it can decide whether to resolve the DB prompt). Returns the structured
 * object + token usage + provider-qualified model. Mock branch is deterministic.
 */
export async function generateIntakeExtraction(input: {
  routing: AgentRouting;
  systemPrompt: string;
  blob: IntakeBlob;
  temperature: number;
  failoverOrder?: unknown;
  providerKeys?: Partial<Record<"anthropic" | "openai", string>>;
}): Promise<IntakeOutcome> {
  if (input.routing.mode === "mock") return mockIntake(input.blob);

  const userPrompt = buildIntakeUserPrompt(input.blob);
  const candidates = buildCandidates(input.routing, input.failoverOrder, input.providerKeys);
  return runWithFailover(candidates, async (candidate) => {
    const result = await generateObject({
      model: candidate.model,
      schema: intakeSchema,
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
