import "server-only";

import { openRun, closeRun, logDecision, registerTool } from "@/server/agents/runner";
import { resolveActivePrompt } from "@/server/agents/config/prompts";
import { resolveAgentPolicy } from "@/server/agents/config/policies";
import { getJobDetailTool, createScopeDraftTool } from "./tools";
import { generateScope, resolveScopeRouting } from "./llm";

// scope_generator_v1 — the second production agent. Fixed pipeline on the shared runner
// (D-6.12 / R-6.14): openRun → read context (1 auto-logged read tool) → resolve DB prompt +
// policy → LLM transform → decision → write draft (auto-logged) → closeRun. The agent writes
// ONLY the draft at pending_review; it has NO path to job_scope_steps / job columns — that
// is the human-gated publishScopeDraft (§2.9 / R-6.15).
export const AGENT_ID = "scope_generator_v1";

/**
 * Run the scope generator against a job. Produces a draft at pending_review. Logs the full
 * audit chain. On any failure the run closes status='failed' and the error is re-thrown for
 * the caller to surface.
 *
 * Throws: JOB_NOT_FOUND, NoActivePromptError (real path, fail-closed) + any LLM/provider error.
 */
export async function runScopeGenerator(input: {
  tenantId: string;
  jobId: string;
  triggeredByUserId?: string | null;
}): Promise<{ runId: string; draftId: string }> {
  const ctx = await openRun({
    tenantId: input.tenantId,
    agentId: AGENT_ID,
    triggeredByUserId: input.triggeredByUserId ?? null,
    jobId: input.jobId,
    triggerSource: "operator_manual",
    inputSummary: `Generate scope for job ${input.jobId}`,
  });

  try {
    // read-narrow (auto-logged to agent_tool_calls) — current-job context only (OQ #6).
    const readJob = registerTool(ctx, getJobDetailTool);
    const job = await readJob({ tenantId: input.tenantId, jobId: input.jobId });
    if (!job) throw new Error("JOB_NOT_FOUND");

    // Resolve routing once; the real path resolves the DB prompt (fail-closed), the mock
    // path skips it and records prompt_version='mock' (Dec-1).
    const routing = resolveScopeRouting();
    let systemPrompt = "";
    let promptVersion = "mock";
    let temperature = 0.3;
    if (routing.mode !== "mock") {
      const prompt = await resolveActivePrompt(input.tenantId, AGENT_ID);
      systemPrompt = prompt.systemPrompt;
      promptVersion = String(prompt.version);
      if (prompt.temperature != null) temperature = Number(prompt.temperature);
    }

    // LLM transform (or deterministic mock).
    const { object, usage, model } = await generateScope({ routing, systemPrompt, job, temperature });

    // Policy governs disposition. Resolve by the job's client (the ladder supports per-client
    // overrides; Phase 7 seeds only the default → fail-safe to requiresReview). §2.9 / R-6.15:
    // the scope agent has NO auto-execute path in Phase 7 — it ALWAYS queues for review
    // regardless of policy; the resolver is wired so per-client/auto-execute policies plug in
    // later without touching the agent. (auto_executed is in the enum but never emitted here.)
    const policy = await resolveAgentPolicy(input.tenantId, AGENT_ID, job.clientId);
    await logDecision(ctx, {
      decisionType: "scope_proposal",
      proposedAction: "Draft a scope of work from the problem description",
      reasoning: object.rationale,
      confidence: object.confidence,
      policyCheck: policy.requiresReview ? "requires_review" : "review_not_required",
      disposition: "queued_for_review",
      metadata: { stepCount: object.steps.length, assumptions: object.assumptions },
    });

    // write-narrow — the draft at pending_review (auto-logged). proposed_steps is immutable.
    const writeDraft = registerTool(ctx, createScopeDraftTool);
    const draft = await writeDraft({
      tenantId: input.tenantId,
      jobId: input.jobId,
      agentRunId: ctx.runId,
      proposedSteps: object.steps,
    });

    await closeRun(ctx, {
      status: "succeeded",
      outputSummary: `Drafted ${object.steps.length}-step scope (confidence ${object.confidence})`,
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
