import "server-only";

import { openRun, closeRun, logDecision, registerTool } from "@/server/agents/runner";
import { resolveActivePrompt } from "@/server/agents/config/prompts";
import { resolveAgentPolicy } from "@/server/agents/config/policies";
import { resolveLlmKey } from "@/server/security/llm-keys";
import { isDispatchStuck } from "@/server/analytics/dispatch-sla-rules";
import { getFollowupContextTool, createFollowupDraftTool } from "./tools";
import { generateFollowup, resolveFollowupRouting } from "./llm";

// vendor_followup_v1 — the SOFT rung-0 chase that runs BEFORE the existing redispatch rung-1.
// Intake/scope-shaped: openRun → read the assignment's dispatch context → REUSE isDispatchStuck to
// confirm the vendor has actually gone quiet → resolve prompt/policy/key → LLM chase message →
// decision → write a vendor_followup_drafts row @ pending_review → closeRun.
//
// RECORD-DON'T-APPLY: the agent NEVER sends (no dispatch_messages write), NEVER ghosts/replaces the
// vendor (that is the operator's separate rung-1 redispatch decision), and ALWAYS queues for review
// (§2.9). It only chases a GENUINELY-stuck SENT dispatch — a responsive vendor gets no chase.
export const AGENT_ID = "vendor_followup_v1";

export async function runVendorFollowup(input: {
  tenantId: string;
  assignmentId: string;
  triggeredByUserId?: string | null;
}): Promise<{ runId: string; draftId: string | null; stuck: boolean }> {
  const ctx = await openRun({
    tenantId: input.tenantId,
    agentId: AGENT_ID,
    triggeredByUserId: input.triggeredByUserId ?? null,
    triggerSource: "operator_manual",
    inputSummary: `Chase stuck dispatch ${input.assignmentId}`,
  });

  try {
    // read-narrow (auto-logged) — the assignment's dispatch context.
    const readCtx = registerTool(ctx, getFollowupContextTool);
    const dispatch = await readCtx({ tenantId: input.tenantId, assignmentId: input.assignmentId });
    if (!dispatch) throw new Error("ASSIGNMENT_NOT_FOUND");

    // STUCK GUARD — REUSE isDispatchStuck (the established staleness predicate; not reimplemented).
    // dwell is computed in JS from the system-set sent_at (never SQL NOW()). A null sent_at or a
    // non-SENT status → not stuck. Only a genuinely-quiet SENT dispatch is chased.
    const dwellSeconds = dispatch.sentAt ? Math.max(0, Math.floor((Date.now() - dispatch.sentAt.getTime()) / 1000)) : 0;
    const stuck = isDispatchStuck({ statusCode: dispatch.statusCode, priorityCode: dispatch.priorityCode, dwellSeconds });
    if (!stuck) {
      // Not stuck → no chase. No decision, no draft (nothing was proposed); the run records the check.
      await closeRun(ctx, { status: "succeeded", outputSummary: `Not stuck (${dispatch.statusCode}, ${dwellSeconds}s) — no chase drafted` });
      return { runId: ctx.runId, draftId: null, stuck: false };
    }

    // Stuck → draft a chase. Routing once; real path resolves the DB prompt (fail-closed).
    const routing = resolveFollowupRouting();
    let systemPrompt = "";
    let promptVersion = "mock";
    let temperature = 0.3;
    if (routing.mode !== "mock") {
      const prompt = await resolveActivePrompt(input.tenantId, AGENT_ID);
      systemPrompt = prompt.systemPrompt;
      promptVersion = String(prompt.version);
      if (prompt.temperature != null) temperature = Number(prompt.temperature);
    }

    // Policy governs disposition (always queued_for_review) + carries the provider preference.
    const policy = await resolveAgentPolicy(input.tenantId, AGENT_ID, null);
    const failoverOrder = (policy.raw as { failoverOrder?: unknown } | null)?.failoverOrder;

    const { key: tenantKey, source: keySource, tenantKeyError } = await resolveLlmKey(input.tenantId, "anthropic");
    const providerKeys = tenantKey ? { anthropic: tenantKey } : undefined;

    const { object, usage, model } = await generateFollowup({
      routing,
      systemPrompt,
      ctx: {
        vendorName: dispatch.vendorName,
        jobNumber: dispatch.jobNumber,
        problemDescription: dispatch.problemDescription,
        hoursSinceSent: Math.floor(dwellSeconds / 3600),
      },
      temperature,
      failoverOrder,
      providerKeys,
    });

    await logDecision(ctx, {
      decisionType: "vendor_followup",
      proposedAction: "Draft a chase message to a vendor that has gone quiet on a dispatch",
      reasoning: object.rationale,
      confidence: object.confidence,
      policyCheck: policy.requiresReview ? "requires_review" : "review_not_required",
      disposition: "queued_for_review",
      metadata: { assignmentId: input.assignmentId, dwellSeconds, statusCode: dispatch.statusCode, keySource, ...(tenantKeyError ? { tenantKeyError } : {}) },
    });

    // write-narrow — the chase draft @ pending_review (auto-logged). NEVER sends.
    const writeDraft = registerTool(ctx, createFollowupDraftTool);
    const draft = await writeDraft({
      tenantId: input.tenantId,
      assignmentId: input.assignmentId,
      agentRunId: ctx.runId,
      draftContent: object.chaseMessage,
    });

    await closeRun(ctx, {
      status: "succeeded",
      outputSummary: `Drafted chase (confidence ${object.confidence}; stuck ${dwellSeconds}s)`,
      model,
      promptVersion,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
    return { runId: ctx.runId, draftId: draft.id, stuck: true };
  } catch (err) {
    await closeRun(ctx, { status: "failed", errorMessage: (err as Error).message });
    throw err;
  }
}
