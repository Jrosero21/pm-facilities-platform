import "server-only";

import { openRun, closeRun, logDecision, registerTool } from "@/server/agents/runner";
import {
  getJobNoteTool,
  getJobDetailTool,
  listAssignmentsTool,
  createRewriteDraftTool,
} from "./tools";
import { generateRewrite } from "./llm";

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

    // LLM transform (or deterministic mock under REWRITER_MOCK).
    const { object, usage, model, promptVersion } = await generateRewrite({ note, job, vendorNames });

    // decision — Phase 6 hardcoded policy always queues for review (§2.9).
    await logDecision(ctx, {
      decisionType: "rewrite_proposal",
      proposedAction: "Draft a client-facing update from the source note",
      reasoning: object.rationale,
      confidence: object.confidence,
      policyCheck: "requires_review",
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
