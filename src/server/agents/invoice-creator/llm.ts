import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { resolveAgentRouting, type AgentRouting } from "@/server/agents/llm-routing";
import { buildCandidates, runWithFailover } from "@/server/agents/failover";
import { buildFewShotMessages, type CorrectionPair } from "@/server/analytics/correction-pairs";
import { lineItemCategoryEnum } from "@/server/schema/billing-shared";
import type { JobDetail } from "@/server/jobs";
import type { VendorInvoiceRow, VendorInvoiceLineItemRow } from "@/server/billing/vendor-invoices";
import { buildInvoiceUserPrompt } from "./prompt";

// ── Phase 26 batch 2b-i — invoice creator LLM ─────────────────────────────────────────
// The structured-output contract + the per-run user-prompt assembly. The SYSTEM prompt is
// DB-stored (ai_prompt_templates, resolved by the agent and passed in); only the mechanical
// context assembly lives in code. Routing is resolved by the caller and passed in; the mock
// branch is handled internally.
//
// MONEY-SAFETY (D1) — the schema is NUMBER-FREE BY CONSTRUCTION. A line item carries ONLY
// category + description + reconcilesToVendorLineId; there is NO quantity / unit_price /
// markup field anywhere in the schema, so the model is STRUCTURALLY UNABLE to emit a dollar
// figure. The amounts are joined in from the vendor lines by runInvoiceCreator after generate.

// One proposed line — PHRASING ONLY. reconcilesToVendorLineId points at the vendor line whose
// cost this client line carries (the join key runInvoiceCreator uses to attach the numbers).
const invoiceLineSchema = z.object({
  category: z.enum(lineItemCategoryEnum).describe("The client-invoice line category."),
  description: z.string().describe("Client-facing description of the work for this line. NO amounts."),
  reconcilesToVendorLineId: z
    .string()
    .nullish()
    .describe("The vendorLineId this client line describes (null only for a lumped invoice)."),
});

export const invoiceSchema = z.object({
  lineItems: z.array(invoiceLineSchema).describe("The client-facing invoice lines — descriptions only."),
  lumpFlag: z
    .boolean()
    .optional()
    .describe("True if the vendor invoice was a single lumped / non-itemized charge kept whole."),
  confidence: z.enum(["high", "medium", "low"]).describe("Your confidence in the drafted invoice."),
  rationale: z.string().describe("One line explaining the choices."),
});
export type InvoiceResult = z.infer<typeof invoiceSchema>;

export type InvoiceOutcome = {
  object: InvoiceResult;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};

export const INVOICE_CREATOR_ROUTING = {
  mockEnvVar: "INVOICE_CREATOR_MOCK",
  modelEnvVar: "INVOICE_CREATOR_MODEL",
  defaultGatewayModel: "anthropic/claude-sonnet-4-6",
  defaultDirectModel: "claude-sonnet-4-6",
} as const;

/** The invoice creator's routing decision (mock/gateway/direct) — resolved once, reused. */
export function resolveInvoiceRouting(): AgentRouting {
  return resolveAgentRouting(INVOICE_CREATOR_ROUTING);
}

function mockInvoice(): InvoiceOutcome {
  return {
    object: {
      lineItems: [
        {
          category: "labor",
          description: "[MOCK] On-site service to address the reported issue, per the completed work order.",
          reconcilesToVendorLineId: null,
        },
      ],
      lumpFlag: false,
      confidence: "high",
      rationale: "[mock] deterministic stub — INVOICE_CREATOR_MOCK enabled or no API key configured.",
    },
    usage: { inputTokens: 0, outputTokens: 0 },
    model: "mock",
  };
}

/**
 * Generate a client-facing invoice DRAFT (phrasing only) from a submitted vendor invoice +
 * job context. Routing is passed in (the caller resolves it once so it can decide whether to
 * resolve the DB prompt). Returns the structured object + token usage + provider-qualified
 * model. The mock branch is deterministic. NO amounts are produced here (D1).
 */
export async function generateInvoice(input: {
  routing: AgentRouting;
  systemPrompt: string;
  vendorInvoice: VendorInvoiceRow;
  vendorLines: VendorInvoiceLineItemRow[];
  job: JobDetail;
  temperature: number;
  // B2: provider preference from the resolved policy JSON (resolved.raw.failoverOrder), threaded
  // by runInvoiceCreator. Absent/bad → today's single env-driven provider (fail-safe).
  failoverOrder?: unknown;
  // CF-23.1 (K3b): tenant's own LLM key per provider, threaded by runInvoiceCreator. Absent → platform.
  providerKeys?: Partial<Record<"anthropic" | "openai", string>>;
  // Phase 25: operator-correction few-shot pairs (GOLD-first). Empty/absent → single-shot prompt.
  fewShot?: CorrectionPair[];
}): Promise<InvoiceOutcome> {
  if (input.routing.mode === "mock") return mockInvoice();

  // Few-shot prior turns from operator corrections (Phase 25). Empty → unchanged single-shot path.
  const fewShotTurns = buildFewShotMessages(input.fewShot ?? []);
  const userPrompt = buildInvoiceUserPrompt({
    vendorInvoice: input.vendorInvoice,
    vendorLines: input.vendorLines,
    job: input.job,
  });

  // Ordered candidate chain from preference (allowlist+order, available providers only); else
  // the single env-driven base. Fail over to the next ONLY on a provider/transport error.
  const candidates = buildCandidates(input.routing, input.failoverOrder, input.providerKeys);
  return runWithFailover(candidates, async (candidate) => {
    const result =
      fewShotTurns.length > 0
        ? await generateObject({
            model: candidate.model,
            schema: invoiceSchema,
            system: input.systemPrompt,
            messages: [...fewShotTurns, { role: "user", content: userPrompt }],
            temperature: input.temperature,
          })
        : await generateObject({
            model: candidate.model,
            schema: invoiceSchema,
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
