import "server-only";

import { openRun, closeRun, logDecision, registerTool } from "@/server/agents/runner";
import { resolveActivePrompt } from "@/server/agents/config/prompts";
import { resolveAgentPolicy } from "@/server/agents/config/policies";
import { selectFewShotPairs, type CorrectionPair } from "@/server/analytics/correction-pairs";
import { getJobDetailTool, getJobStatusCodeTool, createProposalDraftTool } from "./tools";
import { generateProposal, resolveProposalRouting } from "./llm";
import type { ProposedProposal, ProposedProposalLine } from "./drafts";

// proposal_generator_v1 — the second v2.9.0 "new agent". Fixed pipeline on the shared runner:
// openRun → read context (job + status code, auto-logged) → eligibility gate (active/billable) →
// resolve DB prompt + policy → LLM transform (PHRASING ONLY, number-free) → decision → write draft
// (auto-logged) → closeRun. The agent writes ONLY the draft at pending_review; it has NO path to
// proposals — that is the human-gated publish action (publish.ts). §2.9 / R-6.15: ALWAYS queues.
//
// MONEY-SAFETY (D1): the LLM emits no numbers. The proposed_proposal is fully number-free; the
// operator authors every dollar figure at the review gate (edits.ts), and publish.ts resolves the
// markup + runs the NTE send-gate. There is NO cost source to join in (unlike the invoice creator).
export const AGENT_ID = "proposal_generator_v1";

// Eligibility: a proposal may be drafted on a LIVE, billable job — progress billing (deposits/
// draws) lives in the live job, so we do NOT gate on COMPLETED or approved_scope. We EXCLUDE the
// not-billable states:
//   - NEW           → draft-intake; nothing scoped yet
//   - CANCELLED     → the work will not happen; never billable
//   - CLOSED        → terminal; post-close billing needs a deliberate reopen, not an agent draft
//   - CLOSED_BILLED → terminal; billing already finalized
// Eligible set: DISPATCHED, SCHEDULED, IN_PROGRESS, ON_HOLD, COMPLETED.
const NOT_BILLABLE_STATUS_CODES = new Set(["NEW", "CANCELLED", "CLOSED", "CLOSED_BILLED"]);

// TODO(Batch 4): replace with proposalCorrectionPairs(tenantId) from analytics/correction-pairs
// once proposal_drafts/_reviews are wired into the correction-pairs reader. Returns [] today, so
// generateProposal takes the single-shot path (no few-shot). Kept inline + clearly marked so the
// wiring point is obvious and nothing silently looks "done".
async function proposalCorrectionPairsStub(tenantId: string): Promise<CorrectionPair[]> {
  void tenantId; // TODO(Batch 4): query proposalCorrectionPairs(tenantId) from analytics/correction-pairs
  return [];
}

/**
 * Run the proposal generator against an active/billable job. Produces a NUMBER-FREE draft at
 * pending_review. Logs the full audit chain. On any failure the run closes status='failed' and
 * the error is re-thrown for the caller to surface.
 *
 * Throws: JOB_NOT_FOUND, JOB_NOT_BILLABLE, NoActivePromptError (real path, fail-closed) + any
 * LLM/provider error.
 */
export async function runProposalGenerator(input: {
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
    inputSummary: `Draft internal proposal for job ${input.jobId}`,
  });

  try {
    // read-broad (each call auto-logged to agent_tool_calls)
    const readJob = registerTool(ctx, getJobDetailTool);
    const readStatusCode = registerTool(ctx, getJobStatusCodeTool);

    const job = await readJob({ tenantId: input.tenantId, jobId: input.jobId });
    if (!job) throw new Error("JOB_NOT_FOUND");

    // ELIGIBILITY GATE (permissive): the job must exist AND be active/billable — NOT a draft-intake
    // (NEW) or cancelled state. Uses the stable status CODE (not the tenant-editable name).
    const statusCode = await readStatusCode({ tenantId: input.tenantId, jobId: input.jobId });
    if (statusCode === null) throw new Error("JOB_NOT_FOUND");
    if (NOT_BILLABLE_STATUS_CODES.has(statusCode)) throw new Error("JOB_NOT_BILLABLE");

    // Resolve routing once; the real path resolves the DB prompt (fail-closed), the mock path
    // skips it and records prompt_version='mock'.
    const routing = resolveProposalRouting();
    let systemPrompt = "";
    let promptVersion = "mock";
    let temperature = 0.3;
    if (routing.mode !== "mock") {
      const prompt = await resolveActivePrompt(input.tenantId, AGENT_ID);
      systemPrompt = prompt.systemPrompt;
      promptVersion = String(prompt.version);
      if (prompt.temperature != null) temperature = Number(prompt.temperature);
    }

    // Resolve policy BEFORE the transform — governs disposition AND carries the B2 provider
    // preference (resolved.raw.failoverOrder). The resolver fail-safes (requiresReview true; bad
    // JSON → raw null), so an absent/bad preference → today's single env-driven provider.
    const policy = await resolveAgentPolicy(input.tenantId, AGENT_ID, job.clientId);
    const failoverOrder = (policy.raw as { failoverOrder?: unknown } | null)?.failoverOrder;

    // Phase 25 feedback loop (wired in Batch 4 — stub returns [] today → single-shot). Skipped on mock.
    const fewShot =
      routing.mode === "mock" ? [] : selectFewShotPairs(await proposalCorrectionPairsStub(input.tenantId));

    // LLM transform (PHRASING ONLY — the schema is number-free, D1). Provider preference +
    // failover applied inside. The proposal generator has no auto-execute path — it ALWAYS queues.
    const { object, usage, model } = await generateProposal({
      routing,
      systemPrompt,
      job,
      temperature,
      failoverOrder,
      fewShot,
    });

    // Build the NUMBER-FREE proposed proposal (D1): the LLM supplies category + description +
    // scopePhrasing per line; NO dollar fields are set here. Pricing is authored by the operator
    // at the review gate (edits.ts).
    const proposedLines: ProposedProposalLine[] = object.lineItems.map((ln) => ({
      category: ln.category,
      description: ln.description,
      scopePhrasing: ln.scopePhrasing,
    }));
    const proposedProposal: ProposedProposal = { lineItems: proposedLines };

    await logDecision(ctx, {
      decisionType: "proposal_generation",
      proposedAction: "Draft a number-free internal proposal from the job context",
      reasoning: object.rationale,
      confidence: object.confidence,
      policyCheck: policy.requiresReview ? "requires_review" : "review_not_required",
      disposition: "queued_for_review",
      metadata: { lineCount: proposedLines.length },
    });

    // write-narrow — the draft at pending_review (auto-logged). proposed_proposal is immutable.
    const writeDraft = registerTool(ctx, createProposalDraftTool);
    const draft = await writeDraft({
      tenantId: input.tenantId,
      jobId: input.jobId,
      agentRunId: ctx.runId,
      proposedProposal,
    });

    await closeRun(ctx, {
      status: "succeeded",
      outputSummary: `Drafted ${proposedLines.length}-line internal proposal (confidence ${object.confidence})`,
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
