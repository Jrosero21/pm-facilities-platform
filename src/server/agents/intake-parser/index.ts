import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { openRun, closeRun, logDecision, registerTool } from "@/server/agents/runner";
import { resolveActivePrompt } from "@/server/agents/config/prompts";
import { resolveAgentPolicy } from "@/server/agents/config/policies";
import { resolveLlmKey } from "@/server/security/llm-keys";
import { resolveTrade, resolvePriority } from "@/lib/integrations/core/mapping";
import { db } from "@/server/db";
import { externalClientMappings } from "@/server/schema";
import { getInboundEmailTool, createIntakeDraftTool } from "./tools";
import { generateIntakeExtraction, resolveIntakeRouting } from "./llm";

// intake_parser_v1 — inbound-blob → structured work-order DRAFT. Scope-generator-shaped:
// openRun → read the stored inbound_emails blob → resolve DB prompt + policy + key → LLM
// EXTRACTION → resolve codes via the EXISTING mappers (NOT a new matcher) → decision → write a
// PARTIAL email_work_order_drafts row @ pending_review → closeRun. RECORD-DON'T-APPLY: the agent
// NEVER creates a job (that is the human-gated approveEmailDraft path) and ALWAYS queues for
// review (no auto-execute path — §2.9).
//
// CODE RESOLUTION reuses Phase-12 resolvers verbatim (resolveTrade/resolvePriority) + the D-1
// external_client_mappings lookup — all GUARDED on an externalSystemId. Today the ingest
// substrate has no external_system_id column (CF-13.5), so callers pass null → every resolve is
// skipped → a fully-partial draft (all resolved_* NULL) routed to the operator. When that column
// lands, callers pass the account's system id and the SAME code path resolves for real.
export const AGENT_ID = "intake_parser_v1";

export async function runIntakeParser(input: {
  tenantId: string;
  inboundEmailId: string;
  triggeredByUserId?: string | null;
  // The ingestion account's external system id, when known. Null today (CF-13.5) → resolution
  // is skipped and the draft is fully partial. Never parsed from content — a trust boundary.
  externalSystemId?: string | null;
}): Promise<{ runId: string; draftId: string }> {
  const ctx = await openRun({
    tenantId: input.tenantId,
    agentId: AGENT_ID,
    triggeredByUserId: input.triggeredByUserId ?? null,
    triggerSource: "operator_manual",
    inputSummary: `Parse inbound email ${input.inboundEmailId} into a work-order draft`,
  });

  try {
    // read-narrow (auto-logged) — the stored inbound blob; tenant scope comes from IT, not content.
    const readEmail = registerTool(ctx, getInboundEmailTool);
    const blob = await readEmail({ tenantId: input.tenantId, inboundEmailId: input.inboundEmailId });
    if (!blob) throw new Error("INBOUND_EMAIL_NOT_FOUND");

    // Routing once; real path resolves the DB prompt (fail-closed), mock path records prompt_version='mock'.
    const routing = resolveIntakeRouting();
    let systemPrompt = "";
    let promptVersion = "mock";
    let temperature = 0.2;
    if (routing.mode !== "mock") {
      const prompt = await resolveActivePrompt(input.tenantId, AGENT_ID);
      systemPrompt = prompt.systemPrompt;
      promptVersion = String(prompt.version);
      if (prompt.temperature != null) temperature = Number(prompt.temperature);
    }

    // Policy governs disposition (below — always queued_for_review) + carries the provider
    // preference. Resolved WITHOUT a clientId (pre-job: the client is unknown until resolution).
    const policy = await resolveAgentPolicy(input.tenantId, AGENT_ID, null);
    const failoverOrder = (policy.raw as { failoverOrder?: unknown } | null)?.failoverOrder;

    // Tenant's own LLM key (direct path); null → platform key. Decrypt failure → platform + flag.
    const { key: tenantKey, source: keySource, tenantKeyError } = await resolveLlmKey(input.tenantId, "anthropic");
    const providerKeys = tenantKey ? { anthropic: tenantKey } : undefined;

    // NO few-shot: there is no intake correction-pairs source yet (the email-draft review surface
    // is separate from the agent correction-pairs readers). Single-shot only until one exists.

    const { object, usage, model } = await generateIntakeExtraction({
      routing,
      systemPrompt,
      blob: { subject: blob.subject, bodyText: blob.bodyText },
      temperature,
      failoverOrder,
      providerKeys,
    });

    // ── RESOLVE codes via the EXISTING mappers (reuse, never a new matcher). Guarded on
    //    externalSystemId; each mapper returns { matched } — unmatched → leave the field NULL. ──
    const sysId = input.externalSystemId ?? null;
    let resolvedTradeId: string | null = null;
    let resolvedPriorityId: string | null = null;
    let resolvedClientId: string | null = null;
    const resolverCalls: string[] = [];

    if (sysId && object.extractedTradeCode) {
      resolverCalls.push("resolveTrade");
      const t = await resolveTrade({ externalSystemId: sysId, externalCode: object.extractedTradeCode, direction: "inbound" });
      if (t.matched) resolvedTradeId = t.internalId;
    }
    if (sysId && object.extractedPriorityCode) {
      resolverCalls.push("resolvePriority");
      const p = await resolvePriority({ tenantId: input.tenantId, externalSystemId: sysId, externalCode: object.extractedPriorityCode, direction: "inbound" });
      if (p.matched) resolvedPriorityId = p.internalId;
    }
    if (sysId && object.extractedClientCode) {
      // The D-1 external_client_mappings lookup (no shared resolver fn exists — mirrors ingest-email).
      resolverCalls.push("externalClientMappings");
      const rows = await db
        .select({ clientId: externalClientMappings.clientId })
        .from(externalClientMappings)
        .where(
          and(
            eq(externalClientMappings.externalSystemId, sysId),
            eq(externalClientMappings.externalCode, object.extractedClientCode),
            inArray(externalClientMappings.direction, ["inbound", "both"]),
          ),
        )
        .limit(1);
      resolvedClientId = rows[0]?.clientId ?? null;
    }

    await logDecision(ctx, {
      decisionType: "intake_parse",
      proposedAction: "Extract a work-order draft from an inbound email",
      reasoning: object.rationale,
      confidence: object.confidence,
      policyCheck: policy.requiresReview ? "requires_review" : "review_not_required",
      disposition: "queued_for_review",
      metadata: {
        extractedClientCode: object.extractedClientCode ?? null,
        extractedTradeCode: object.extractedTradeCode ?? null,
        extractedPriorityCode: object.extractedPriorityCode ?? null,
        locationDetail: object.locationDetail ?? null, // no draft column — captured here for review legibility
        resolved: { clientId: resolvedClientId, tradeId: resolvedTradeId, priorityId: resolvedPriorityId },
        resolverCalls,
        externalSystemId: sysId,
        keySource,
        ...(tenantKeyError ? { tenantKeyError } : {}),
      },
    });

    // write-narrow — the partial draft @ pending_review (auto-logged). NEVER a job.
    const writeDraft = registerTool(ctx, createIntakeDraftTool);
    const draft = await writeDraft({
      tenantId: input.tenantId,
      inboundEmailId: input.inboundEmailId,
      sourceType: "email_ingestion",
      problemDescription: object.problemDescription,
      resolvedClientId,
      resolvedTradeId,
      resolvedPriorityId,
    });

    await closeRun(ctx, {
      status: "succeeded",
      outputSummary: `Drafted work order from email (confidence ${object.confidence}; resolved ${resolverCalls.length} code field(s))`,
      model,
      promptVersion,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
    return { runId: ctx.runId, draftId: draft.id };
  } catch (err) {
    await closeRun(ctx, { status: "failed", errorMessage: (err as Error).message });
    throw err;
  }
}
