import "server-only";

import { openRun, closeRun, logDecision, registerTool } from "@/server/agents/runner";
import { resolveActivePrompt } from "@/server/agents/config/prompts";
import { resolveAgentPolicy } from "@/server/agents/config/policies";
import { resolveLlmKey } from "@/server/security/llm-keys";
import { scopeCorrectionPairs, selectFewShotPairs } from "@/server/analytics/correction-pairs";
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

    // Resolve policy BEFORE the transform — it governs disposition (below) AND now carries the
    // B2 provider preference (resolved.raw.failoverOrder) threaded into generateScope. Resolve by
    // the job's client (the ladder supports per-client overrides). The resolver fail-safes (bad
    // JSON → raw null), so an absent/bad preference → today's single env-driven provider. §2.9 /
    // R-6.15: the scope agent has NO auto-execute path — it ALWAYS queues for review.
    const policy = await resolveAgentPolicy(input.tenantId, AGENT_ID, job.clientId);
    const failoverOrder = (policy.raw as { failoverOrder?: unknown } | null)?.failoverOrder;

    // CF-23.1 (K3b): the tenant's own LLM key (direct path). Null → platform key (unchanged). A
    // decrypt failure falls back to platform + flags tenantKeyError (loud, never throws).
    const { key: tenantKey, source: keySource, tenantKeyError } = await resolveLlmKey(input.tenantId, "anthropic");
    const providerKeys = tenantKey ? { anthropic: tenantKey } : undefined;

    // Phase 25 feedback loop: mine this tenant's operator corrections (GOLD-first, cap 20, rejects
    // excluded) and pass them as few-shot. Tenant-scoped, consistent with the reader. Skipped on the
    // mock path. Near-empty today (sparse reviews) → the single-shot fallback inside generateScope;
    // the machinery is what ships and sharpens as reviews accumulate (no fabricated data).
    const fewShot =
      routing.mode === "mock"
        ? []
        : selectFewShotPairs(await scopeCorrectionPairs(input.tenantId));

    // LLM transform (or deterministic mock). Provider preference + failover applied inside.
    const { object, usage, model } = await generateScope({ routing, systemPrompt, job, temperature, failoverOrder, providerKeys, fewShot });
    await logDecision(ctx, {
      decisionType: "scope_proposal",
      proposedAction: "Draft a scope of work from the problem description",
      reasoning: object.rationale,
      confidence: object.confidence,
      policyCheck: policy.requiresReview ? "requires_review" : "review_not_required",
      disposition: "queued_for_review",
      metadata: { stepCount: object.steps.length, assumptions: object.assumptions, keySource, ...(tenantKeyError ? { tenantKeyError } : {}) },
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
