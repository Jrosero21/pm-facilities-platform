import "server-only";

import { openRun, closeRun } from "@/server/agents/runner";

// chatbot_assistant_v1 — the read/draft operations assistant (Phase 16). Slice 1 (16c):
// identity + shared-runner wiring ONLY. The agent registers in AGENT_REGISTRY
// (registry.ts) and runs through the frozen shared runner (openRun → … → closeRun),
// producing one agent_runs row per turn. NO tools, NO knowledge loading, NO draft logic
// yet — those land in 16d (knowledge) / 16e (reader-backed reads) / 16f (draft tools).
//
// The assistant is tenant-scoped (every future operational read threads tenantId via the
// auth-context isolation guard) and has NO job binding (agent_runs.job_id stays NULL — the
// substrate already anticipates "non-job agents (chatbot)").
export const AGENT_ID = "chatbot_assistant_v1";

/**
 * Open and close a no-tool run for the assistant — the minimal proof that the agent flows
 * through the shared runner audit chain (one agent_runs row, status running → succeeded).
 * The conversational turn, tool calls, and decision land in later slices; this is the run
 * shell everything else hangs off.
 */
export async function runChatbotAssistant(input: {
  tenantId: string;
  triggeredByUserId?: string | null;
  inputSummary?: string | null;
}): Promise<{ runId: string }> {
  const ctx = await openRun({
    tenantId: input.tenantId,
    agentId: AGENT_ID,
    triggeredByUserId: input.triggeredByUserId ?? null,
    jobId: null, // non-job agent — the assistant is not bound to a single job
    triggerSource: "operator_manual",
    inputSummary: input.inputSummary ?? "Assistant run (no-tool wiring proof — 16c)",
  });

  try {
    // Slice 1: no tools, no decision — just prove the run opens and closes cleanly.
    await closeRun(ctx, {
      status: "succeeded",
      outputSummary: "No-tool run completed (16c wiring proof).",
    });
    return { runId: ctx.runId };
  } catch (err) {
    await closeRun(ctx, { status: "failed", errorMessage: (err as Error).message });
    throw err;
  }
}
