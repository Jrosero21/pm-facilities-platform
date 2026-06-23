import "server-only";

import { and, eq } from "drizzle-orm";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { dispatchAssignmentStatuses, jobVendorAssignments } from "@/server/schema";
import { createDispatch, sendDispatch } from "@/server/dispatch";
import { findCandidateVendorsForJob } from "@/server/vendor-matching";
import { openRun, closeRun, logDecision } from "@/server/agents/runner";
import { resolveAgentPolicy } from "@/server/agents/config/policies";
import { withinTokenCeilings, withinSpendCeilings } from "@/server/agents/config/guardrails";
import { parseConditions, evaluatePolicyConditions, type PolicyActionContext } from "@/server/agents/config/conditions";
import { getEffectiveNte } from "@/server/billing/change-orders";
import { getPriority } from "@/server/job-reference";
import { getTrade } from "@/server/trades";
import { getJob } from "@/server/jobs";
import { getVendorPerformanceScoresForVendors } from "@/server/analytics/vendor-performance";
import { toScoredCandidate, rankCandidates, isCloseCall } from "@/server/scorer";
import { resolveDispatchTiebreakerRouting, generateDispatchTiebreak } from "@/server/agents/dispatch-tiebreaker/llm";
import { resolveLlmKey } from "@/server/security/llm-keys";
import { resolveActivePrompt } from "@/server/agents/config/prompts";
import { parseTiebreakerMode, shouldFireTiebreaker, applyTiebreak } from "@/server/agents/dispatch-tiebreaker/decide";

const DISPATCH_AGENT_ID = "dispatch_router_v1";
const DISPATCH_TIEBREAKER_AGENT_ID = "dispatch_tiebreaker_v1";

// Phase 22 (slice 4) → Phase 23 23f-2 — rule-based auto-dispatch, Tier 2, NOW GOVERNED.
// The deterministic picker over the existing eligibility floor: TOP candidate of the
// floor-filtered, preference-then-rank-ordered matcher output. No AI, no scoring.
//
// 23f-2 — THE FIRST PATH THAT CAN CAUSE AN AUTONOMOUS ACTION. The draft is ALWAYS created
// (a draft commits nothing and is the operator's fallback). The GATE then decides whether to
// AUTO-ADVANCE that draft DRAFT→SENT. Composition (all three must pass):
//   permitted = resolveAgentPolicy(...).autonomyEnabled   // kill-switch step-0 + policy halves
//             && withinTokenCeilings(tenantId).ok          // §2.4 token spend-breaker
//             && withinSpendCeilings(tenantId, jobId).ok    // §2.4 committed-$ breaker (+ null-NTE block)
// FAIL-SAFE-OFF DEFAULT (§2.1): the platform default policy is {requiresReview:true} with no
// autonomyEnabled → permitted is false → the draft stays gated (drafted_pending). Nothing
// auto-advances until a tenant explicitly sets autonomyEnabled:true AND clears the guardrails
// AND the kill switch is off.
//
// PROVENANCE (Option A): a synthetic agent_runs row (triggerSource "auto_dispatch", token
// cols NULL) carries the §2.9 decision — logDecision emits auto_executed (advanced) or
// policy_blocked (gated). The Phase-22 auto_drafted audit event STAYS (additive).
//
// STILL NO LIVE TRIGGER: this is auto-invoked by NOTHING in app code (only the harness). The
// job-creation trigger + first real-tenant enablement stay gated behind Phase 24 observability
// (§2.3). 23f-2 makes the mechanism CAPABLE of auto-advancing when permitted; it wires no caller.
//
// Idempotency (invariant 6 / §2.6): TWO existing layers, no third added — (1) the step-a
// per-job non-terminal guard prevents a second draft; (2) sendDispatch's ASSIGNMENT_NOT_DRAFT
// guard makes a double-advance throw rather than double-send.

export type AutoDispatchResult =
  // Gated on purpose (manage-by-exception, §2.7) — draft created, NOT advanced. The default.
  | { outcome: "drafted_pending"; assignmentId: string; vendorId: string; blockedBy: string }
  // The autonomous action fired — draft advanced DRAFT→SENT.
  | { outcome: "auto_advanced"; assignmentId: string; vendorId: string; jobStatusAdvanced: boolean }
  // Permitted, but the send threw (real failure, not a gate) — draft exists, awaits a human.
  | { outcome: "drafted_send_failed"; assignmentId: string; vendorId: string; error: string }
  | { outcome: "no_candidates" }
  | { outcome: "already_active"; existingAssignmentId?: string };

/**
 * Rule-based auto-dispatch for one job. Steps:
 *   a. idempotency guard FIRST — short-circuit if a non-terminal assignment exists.
 *   b. run the matcher; empty candidate set → no_candidates (nothing created).
 *   c. take candidates[0] and create a DRAFT via createDispatch (NULL system actor).
 *   d. write the auto_drafted audit event (Phase 22, kept).
 *   e. open a synthetic run, consult the governance gate, and EITHER auto-advance the draft
 *      to SENT (auto_executed) OR leave it gated for operator review (policy_blocked).
 * Returns a discriminated result for the caller to act on.
 */
export async function autoDispatchDraftForJob(
  tenantId: string,
  jobId: string,
): Promise<AutoDispatchResult> {
  // a. Idempotency guard (per-job, non-terminal) — before matching, so an
  // already-dispatched job costs nothing.
  const active = await db
    .select({ id: jobVendorAssignments.id })
    .from(jobVendorAssignments)
    .innerJoin(
      dispatchAssignmentStatuses,
      eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id),
    )
    .where(
      and(
        eq(jobVendorAssignments.tenantId, tenantId),
        eq(jobVendorAssignments.jobId, jobId),
        eq(dispatchAssignmentStatuses.isTerminal, false),
      ),
    )
    .limit(1);
  if (active[0]) {
    return { outcome: "already_active", existingAssignmentId: active[0].id };
  }

  // b. Floor-filtered, preference-then-rank-ordered candidates.
  const candidates = await findCandidateVendorsForJob(tenantId, jobId);
  if (candidates.length === 0) {
    return { outcome: "no_candidates" };
  }

  // AI-assisted dispatch — deterministic re-rank over the eligible set.
  // Trade resolved the same way the matcher + createDispatch resolve it (read-only).
  const job = await getJob(tenantId, jobId);
  const primaryTradeId = job?.primaryTradeId ?? null;
  const perfRows = primaryTradeId
    ? await getVendorPerformanceScoresForVendors(
        tenantId,
        candidates.map((c) => c.vendorId),
        primaryTradeId,
      )
    : [];
  const perfByVendor = new Map(perfRows.map((r) => [r.vendorId, r]));
  const ranked = rankCandidates(
    candidates.map((c) => toScoredCandidate(c, perfByVendor.get(c.vendorId) ?? null)),
  );
  const closeCall = isCloseCall(ranked);
  const runnerUp = ranked.length > 1 ? ranked[1] : null;

  // ── Hoisted policy/ceiling resolve (single source of truth; the router run below REUSES these) ──
  // Reuses `job` from the re-rank block above — no second getJob fetch.
  const clientId = job?.clientId ?? null;
  const resolved = await resolveAgentPolicy(tenantId, DISPATCH_AGENT_ID, clientId);
  const token = await withinTokenCeilings(tenantId);

  // ── AI-assisted dispatch tiebreaker: fires ONLY on a close call, per per-tenant mode + token headroom ──
  let tiebreak: { source: "deterministic" | "llm_tiebreak"; changedByLlm: boolean; confidence?: string; rationale?: string } | null = null;
  const mode = parseTiebreakerMode(resolved.raw);
  if (shouldFireTiebreaker({ closeCall, mode, autonomyEnabled: resolved.autonomyEnabled, tokenOk: token.ok })) {
    const a = ranked[0];
    const b = ranked[1];
    const tctx = await openRun({
      tenantId,
      agentId: DISPATCH_TIEBREAKER_AGENT_ID,
      jobId,
      triggerSource: "auto_dispatch",
      inputSummary: `Tiebreak close call: ${a.vendorId} vs ${b.vendorId}`,
    });
    try {
      const routing = resolveDispatchTiebreakerRouting();
      let systemPrompt = ""; let promptVersion = "mock"; let temperature = 0.2;
      if (routing.mode !== "mock") {
        const prompt = await resolveActivePrompt(tenantId, DISPATCH_TIEBREAKER_AGENT_ID);
        systemPrompt = prompt.systemPrompt;
        promptVersion = String(prompt.version);
        if (prompt.temperature != null) temperature = Number(prompt.temperature);
      }
      const failoverOrder = (resolved.raw as { failoverOrder?: unknown } | null)?.failoverOrder;
      // CF-23.1 (K3b): the tenant's own LLM key (direct path), keyed by the LOCAL tenantId. Null →
      // platform key (unchanged). A decrypt failure falls back to platform + flags tenantKeyError.
      const { key: tenantKey, source: keySource, tenantKeyError } = await resolveLlmKey(tenantId, "anthropic");
      const providerKeys = tenantKey ? { anthropic: tenantKey } : undefined;
      const { object, usage, model } = await generateDispatchTiebreak({
        routing, systemPrompt, temperature, failoverOrder, providerKeys,
        problemDescription: job?.problemDescription ?? "",
        pair: [
          { vendorId: a.vendorId, vendorName: a.vendorName, tradeContext: a.primaryTradeMatch ? "primary-trade specialist" : "covers this trade" },
          { vendorId: b.vendorId, vendorName: b.vendorName, tradeContext: b.primaryTradeMatch ? "primary-trade specialist" : "covers this trade" },
        ],
      });
      const decision = applyTiebreak({
        deterministicWinnerId: a.vendorId,
        pairIds: [a.vendorId, b.vendorId],
        llm: { vendorId: object.vendorId, confidence: object.confidence, rationale: object.rationale },
      });
      if (decision.changedByLlm) {
        // reorder: put the LLM-chosen vendor at [0], its former partner at [1]
        ranked[0] = b; ranked[1] = a;
      }
      tiebreak = { source: decision.source, changedByLlm: decision.changedByLlm, confidence: decision.llmConfidence, rationale: decision.llmRationale };
      await logDecision(tctx, {
        decisionType: "dispatch_tiebreak",
        proposedAction: `Break close call between ${a.vendorId} and ${b.vendorId}`,
        reasoning: decision.llmRationale ?? "deterministic leader retained",
        confidence: decision.llmConfidence ?? null,
        policyCheck: "review_not_required",
        disposition: "auto_executed",
        metadata: { chosen: ranked[0].vendorId, changedByLlm: decision.changedByLlm, source: decision.source, keySource, ...(tenantKeyError ? { tenantKeyError } : {}) },
      });
      await closeRun(tctx, { status: "succeeded", outputSummary: `Tiebreak: ${decision.source} (chose ${ranked[0].vendorId})`, model, promptVersion, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
    } catch (err) {
      // degradation: any tiebreaker failure → deterministic ranking stands, run closes failed, dispatch continues
      await closeRun(tctx, { status: "failed", errorMessage: err instanceof Error ? err.message : String(err) });
      tiebreak = { source: "deterministic", changedByLlm: false };
    }
  }

  // The pick: ranked top (preference dispositive, then track record, then matcher order; the
  // tiebreaker above may have reordered the close pair). createDispatch re-validates (its own
  // VENDOR_NO_LONGER_CANDIDATE check) and snapshots facets server-side, then lands at DRAFT.
  // NULL createdByUserId = system actor.
  const top = ranked[0];
  let assignment;
  try {
    assignment = await createDispatch({
      tenantId,
      jobId,
      vendorId: top.vendorId,
      createdByUserId: null,
    });
  } catch (err) {
    // Narrow race: the vendor dropped out of the candidate set between our match
    // (step b) and createDispatch's re-validation. Treat as "nothing eligible to
    // draft right now" rather than a hard failure — surface as no_candidates so a
    // retry re-matches. Any other error is a real fault and propagates.
    if (err instanceof Error && err.message === "VENDOR_NO_LONGER_CANDIDATE") {
      return { outcome: "no_candidates" };
    }
    throw err;
  }

  // d. Autonomy-never-silent: the legibility record for this autonomous draft.
  await writeAuditLog({
    tenantId,
    userId: null,
    action: "job_vendor_assignment.auto_drafted",
    targetType: "job_vendor_assignment",
    targetId: assignment.id,
    metadata: {
      jobId,
      vendorId: top.vendorId,
      rule: "preferred-then-track-record",
      preferenceRank: top.preferenceRank,
      trackRecordScore: top.trackRecordScore,
      hasRecord: top.hasRecord,
      closeCall,
      ranking: ranked.map((c) => ({
        vendorId: c.vendorId,
        preferenceRank: c.preferenceRank,
        trackRecordScore: c.trackRecordScore,
        hasRecord: c.hasRecord,
      })),
      tiebreakSource: tiebreak?.source ?? "deterministic",
      tiebreakChangedPick: tiebreak?.changedByLlm ?? false,
      tiebreakRationale: tiebreak?.rationale ?? null,
    },
  });

  // e. THE GOVERNANCE GATE + ENFORCEMENT. The draft above stays no matter what; the gate
  // only decides whether to auto-advance it. Open a synthetic run FIRST so a BLOCK is also
  // recorded (provenance for the not-permitted path, not just the executed one).
  // clientId + resolved + token are HOISTED above (the tiebreaker needs them pre-draft); the
  // router run REUSES them — only `spend` is resolved here.
  const ctx = await openRun({
    tenantId,
    agentId: DISPATCH_AGENT_ID,
    jobId,
    triggerSource: "auto_dispatch",
    inputSummary: `Auto-dispatch candidate vendor ${top.vendorId}`,
  });

  // Compose the gates: hoisted resolved (kill-switch step-0 + policy halves) + hoisted token +
  // spend (§2.4 spend-breaker) + the optional policy-conditions narrowing (Phase 28).
  const spend = await withinSpendCeilings(tenantId, jobId);

  // Policy-conditions: a NARROWING below autonomyEnabled (never widens). Absent block → no-op
  // (pass). "invalid" block → fail-safe gated WITHOUT building the context (the reads are skipped).
  // Codes matched on stable priorities.code / trades.code; NTE is the EFFECTIVE NTE (base + COs).
  const conditions = parseConditions(resolved.raw);
  let conditionsResult: { pass: boolean; failedOn: string | null } = { pass: true, failedOn: null };
  if (conditions === "invalid") {
    conditionsResult = { pass: false, failedOn: "invalid_conditions" };
  } else if (conditions !== null) {
    const effectiveNteStr = await getEffectiveNte(tenantId, jobId);
    const effectiveNteNum = effectiveNteStr === null ? null : Number(effectiveNteStr);
    const effectiveNte = effectiveNteNum !== null && Number.isFinite(effectiveNteNum) ? effectiveNteNum : null;
    const priorityCode = job?.priorityId ? (await getPriority(tenantId, job.priorityId))?.code ?? null : null;
    const tradeCode = job?.primaryTradeId ? (await getTrade(job.primaryTradeId))?.code ?? null : null;
    const actionContext: PolicyActionContext = { effectiveNte, tradeCode, priorityCode, clientId };
    conditionsResult = evaluatePolicyConditions(conditions, actionContext);
  }

  const permitted = resolved.autonomyEnabled && token.ok && spend.ok && conditionsResult.pass;

  const policyCheck = resolved.requiresReview ? "requires_review" : "review_not_required";
  const decisionMeta = {
    source: resolved.source,
    tokenOk: token.ok,
    spend,
    conditions: conditionsResult,
    vendorId: top.vendorId,
    preferenceRank: top.preferenceRank,
    trackRecordScore: top.trackRecordScore,
    hasRecord: top.hasRecord,
    closeCall,
    runnerUpVendorId: runnerUp?.vendorId ?? null,
  };

  if (!permitted) {
    // Which gate blocked — most-authoritative first (kill switch wins over everything).
    const blockedBy = resolved.source === "kill_switch"
      ? "kill_switch"
      : !resolved.autonomyEnabled
        ? "not_enabled"
        : !token.ok
          ? "token_ceiling"
          : spend.candidateUnmeasurable
            ? "unmeasurable_nte"
            : !spend.ok
              ? "spend_ceiling"
              : !conditionsResult.pass
                ? `policy_condition:${conditionsResult.failedOn}`
                : "unknown";

    // FIRST-EVER policy_blocked write. This is the EXPECTED gated path (§2.7), not an error:
    // the run SUCCEEDED in reaching a decision; the draft stays for operator review.
    await logDecision(ctx, {
      decisionType: "auto_dispatch",
      proposedAction: `Auto-advance dispatch draft ${assignment.id} (vendor ${top.vendorId}) DRAFT→SENT`,
      reasoning: `Blocked by ${blockedBy}; draft retained for operator review.`,
      policyCheck,
      disposition: "policy_blocked",
      metadata: { ...decisionMeta, blockedBy },
    });
    await closeRun(ctx, { status: "succeeded", outputSummary: `Gated: ${blockedBy}` });
    return { outcome: "drafted_pending", assignmentId: assignment.id, vendorId: top.vendorId, blockedBy };
  }

  // PERMITTED → the autonomous action: advance DRAFT→SENT as the NULL system actor (23f-1
  // widening). sendDispatch's ASSIGNMENT_NOT_DRAFT is the idempotency floor on a double-advance.
  try {
    const sent = await sendDispatch({ tenantId, assignmentId: assignment.id, actorUserId: null });
    // FIRST-EVER auto_executed write.
    await logDecision(ctx, {
      decisionType: "auto_dispatch",
      proposedAction: `Auto-advance dispatch draft ${assignment.id} (vendor ${top.vendorId}) DRAFT→SENT`,
      reasoning: "Within policy + guardrails; auto-advanced to SENT.",
      policyCheck,
      disposition: "auto_executed",
      metadata: { ...decisionMeta, jobStatusAdvanced: sent.jobStatusAdvanced },
    });
    await closeRun(ctx, { status: "succeeded", outputSummary: "Auto-advanced DRAFT→SENT" });
    return {
      outcome: "auto_advanced",
      assignmentId: assignment.id,
      vendorId: top.vendorId,
      jobStatusAdvanced: sent.jobStatusAdvanced,
    };
  } catch (err) {
    // Permitted, but the send THREW — a real execution failure, NOT a policy block. The
    // draft now exists and awaits a human, so the honest disposition is queued_for_review
    // (the draft's resulting state = pending operator). We pair it with run.status="failed"
    // + errorMessage so it is unambiguously distinguishable from a normal gated
    // queued_for_review (which closes status="succeeded"): policy_blocked would falsely
    // imply policy stopped it; auto_executed would falsely claim success.
    const message = err instanceof Error ? err.message : String(err);
    await logDecision(ctx, {
      decisionType: "auto_dispatch",
      proposedAction: `Auto-advance dispatch draft ${assignment.id} (vendor ${top.vendorId}) DRAFT→SENT`,
      reasoning: `Auto-send attempted but failed: ${message}. Draft awaits operator.`,
      policyCheck,
      disposition: "queued_for_review",
      metadata: { ...decisionMeta, sendError: message },
    });
    await closeRun(ctx, { status: "failed", errorMessage: message });
    return { outcome: "drafted_send_failed", assignmentId: assignment.id, vendorId: top.vendorId, error: message };
  }
}
