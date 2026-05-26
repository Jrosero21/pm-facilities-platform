import "server-only";

import { openRun, closeRun, logDecision, registerTool } from "@/server/agents/runner";
import { getJobNote } from "@/server/job-notes";
import { createRewriteDraft } from "@/server/agents/drafts";

// ── test_stub_v1 — committed test infrastructure (Phase 6 6g.a) ──────────────────────
// A DETERMINISTIC, LLM-FREE agent that exercises the full substrate (run → read tool →
// decision → write tool → close) so the agent pattern can be verified WITHOUT spending
// API tokens or depending on a model. Reusable by Phase 7/8/13/16 to validate
// substrate-correctness before wiring a real LLM. NOT a production agent — registered as
// `testOnly` in AGENT_REGISTRY (filtered from tenant-facing enumeration). A real agent
// (the 6g.b rewriter) has the SAME shape with an LLM call between the read and the write.

export const AGENT_ID = "test_stub_v1";

export async function runTestStub(input: {
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
    triggerSource: "test",
    inputSummary: `Stub rewrite of note ${input.noteId}`,
  });

  try {
    // read tool (auto-logged) — fetch the source note (read-broad).
    const readNote = registerTool(ctx, {
      name: "getJobNote",
      kind: "read",
      run: (a: { tenantId: string; noteId: string }) => getJobNote(a.tenantId, a.noteId),
    });
    const note = await readNote({ tenantId: input.tenantId, noteId: input.noteId });
    if (!note) throw new Error("NOTE_NOT_FOUND");

    // decision — Phase 6's hardcoded policy always queues for review (§2.9).
    await logDecision(ctx, {
      decisionType: "rewrite_proposal",
      proposedAction: "Draft a client-facing update from the source note",
      reasoning:
        "[stub] deterministic transform — no LLM. Emits a fixed client-safe template; strips nothing.",
      confidence: "high",
      policyCheck: "requires_review",
      disposition: "queued_for_review",
      metadata: { strippedItems: [], stub: true },
    });

    // write tool (auto-logged) — the agent's ONLY write: a draft at pending_review.
    const writeDraft = registerTool(ctx, {
      name: "createRewriteDraft",
      kind: "write",
      run: (a: Parameters<typeof createRewriteDraft>[0]) => createRewriteDraft(a),
    });
    const draft = await writeDraft({
      tenantId: input.tenantId,
      jobId: input.jobId,
      agentRunId: ctx.runId,
      sourceType: "job_note",
      sourceId: input.noteId,
      draftContent:
        "[STUB DRAFT] We have an update on your job and will follow up with details shortly.",
    });

    await closeRun(ctx, {
      status: "succeeded",
      outputSummary: `Created draft ${draft.id} (pending_review)`,
      model: "stub-deterministic",
      promptVersion: "stub-v0",
    });
    return { runId: ctx.runId, draftId: draft.id };
  } catch (err) {
    await closeRun(ctx, { status: "failed", errorMessage: (err as Error).message });
    throw err;
  }
}
