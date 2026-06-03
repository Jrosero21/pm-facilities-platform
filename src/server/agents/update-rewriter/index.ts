import "server-only";

import { openRun, closeRun, logDecision, registerTool } from "@/server/agents/runner";
import { resolveActivePrompt } from "@/server/agents/config/prompts";
import { resolveAgentPolicy } from "@/server/agents/config/policies";
import {
  getJobNoteTool,
  getJobDetailTool,
  listAssignmentsTool,
  createRewriteDraftTool,
} from "./tools";
import { generateRewrite, resolveRewriterRouting } from "./llm";

// update_rewriter_v1 — the first production agent. Fixed pipeline on the shared runner
// (LOCK 4): openRun → read context (3 auto-logged read tools) → LLM transform → decision
// → write draft (auto-logged) → closeRun. A real agent's shape is identical to the stub's,
// with the generateRewrite call between the reads and the write.
export const AGENT_ID = "update_rewriter_v1";

/**
 * Run the rewriter against a note. Produces a draft at pending_review (the agent never
 * touches operational state — publishing is the separate human-gated action). Logs the
 * full audit chain. On any failure, the run is closed status='failed' and the error
 * re-thrown for the caller to surface.
 *
 * Throws: NOTE_NOT_FOUND, JOB_NOT_FOUND (+ any LLM/provider error).
 */
export async function runRewriter(input: {
  tenantId: string;
  jobId: string;
  noteId: string;
  triggeredByUserId?: string | null;
}): Promise<{ runId: string; draftId: string }> {
  const ctx = await openRun({
    tenantId: input.tenantId,
    agentId: AGENT_ID,
    triggeredByUserId: input.triggeredByUserId ?? null,
    jobId: input.jobId,
    triggerSource: "operator_manual",
    inputSummary: `Rewrite note ${input.noteId} → client update`,
  });

  try {
    // read-broad (each call auto-logged to agent_tool_calls)
    const readNote = registerTool(ctx, getJobNoteTool);
    const readJob = registerTool(ctx, getJobDetailTool);
    const readAssignments = registerTool(ctx, listAssignmentsTool);

    const note = await readNote({ tenantId: input.tenantId, noteId: input.noteId });
    if (!note) throw new Error("NOTE_NOT_FOUND");
    const job = await readJob({ tenantId: input.tenantId, jobId: input.jobId });
    if (!job) throw new Error("JOB_NOT_FOUND");
    const assignments = await readAssignments({ tenantId: input.tenantId, jobId: input.jobId });
    const vendorNames = [...new Set(assignments.map((a) => a.vendorName))];

    // Resolve routing once; the real path resolves the DB prompt (fail-closed), the mock path
    // skips it and records prompt_version='mock' (mirrors scope_generator_v1). Step 3 retrofit:
    // prompt + policy now come from the substrate, replacing the in-code SYSTEM_PROMPT and the
    // inline requires_review literal.
    const routing = resolveRewriterRouting();
    let systemPrompt = "";
    let promptVersion = "mock";
    let temperature = 0.3;
    if (routing.mode !== "mock") {
      const prompt = await resolveActivePrompt(input.tenantId, AGENT_ID);
      systemPrompt = prompt.systemPrompt;
      promptVersion = String(prompt.version);
      if (prompt.temperature != null) temperature = Number(prompt.temperature);
    }

    // Resolve policy BEFORE the transform — it governs disposition (below) AND now carries the
    // B2 provider preference (resolved.raw.failoverOrder) threaded into generateRewrite. The
    // resolver fail-safes (requiresReview true; bad JSON → raw null), so an absent/bad preference
    // → today's single env-driven provider. policy_check strings are byte-identical to before.
    const policy = await resolveAgentPolicy(input.tenantId, AGENT_ID, job.clientId);
    const failoverOrder = (policy.raw as { failoverOrder?: unknown } | null)?.failoverOrder;

    // LLM transform (or deterministic mock under REWRITER_MOCK). Provider preference + failover
    // applied inside (direct-SDK path); the rewriter has no auto-execute path (§2.9 / R-6.15) and
    // ALWAYS queues for review.
    const { object, usage, model } = await generateRewrite({ routing, systemPrompt, temperature, note, job, vendorNames, failoverOrder });
    await logDecision(ctx, {
      decisionType: "rewrite_proposal",
      proposedAction: "Draft a client-facing update from the source note",
      reasoning: object.rationale,
      confidence: object.confidence,
      policyCheck: policy.requiresReview ? "requires_review" : "review_not_required",
      disposition: "queued_for_review",
      metadata: { strippedItems: object.strippedItems, rephrasings: object.rephrasings ?? [] },
    });

    // write-narrow — the draft at pending_review (auto-logged).
    const writeDraft = registerTool(ctx, createRewriteDraftTool);
    const draft = await writeDraft({
      tenantId: input.tenantId,
      jobId: input.jobId,
      agentRunId: ctx.runId,
      sourceType: "job_note",
      sourceId: input.noteId,
      draftContent: object.clientFacingText,
    });

    await closeRun(ctx, {
      status: "succeeded",
      outputSummary: `Drafted client update (confidence ${object.confidence})`,
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
