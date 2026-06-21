import "server-only";

// ── Phase 28 — gate-governed AUTONOMOUS re-dispatch core (T1) ──────────────────────────────
// The autonomous sibling of the rung-1 OPERATOR flow (prepare/approve in redispatch-suggestion.ts):
// a stuck SENT dispatch → run the rung-1 flow UNDER THE SAME GATE auto-dispatch.ts uses, with the
// SYSTEM actor and no operator click. Acts only when the gate permits; otherwise leaves the rung-1
// suggestion DRAFT pending for manual approval (the §2.7 manage-by-exception default).
//
// SAFETY: rung-1 prepare/approve carry NO governance (the operator's click is the authorization).
// This wrapper applies the gate BETWEEN prepare and approve. It NEVER widens permission — every
// guard can only HOLD the action (kill-switch / autonomyEnabled / token / spend / conditions).
// Idempotent: an up-front stuck-still-SENT pre-check + rung-1's already_suggested guard make a
// repeated call (the T2 scan) a clean skip. No trigger here (T2).

import { resolveAgentPolicy } from "@/server/agents/config/policies";
import { withinTokenCeilings, withinSpendCeilings } from "@/server/agents/config/guardrails";
import { parseConditions, evaluatePolicyConditions, type PolicyActionContext } from "@/server/agents/config/conditions";
import { getEffectiveNte } from "@/server/billing/change-orders";
import { getPriority } from "@/server/job-reference";
import { getTrade } from "@/server/trades";
import { getJob } from "@/server/jobs";
import { getAssignment } from "@/server/dispatch";
import { getDispatchAssignmentStatusByCode } from "@/server/dispatch-reference";
import { getSystemUserId } from "@/server/integrations/system-user";
import { prepareRedispatchSuggestion, approveRedispatch } from "@/server/redispatch-suggestion";
import { openRun, closeRun, logDecision } from "@/server/agents/runner";

const DISPATCH_AGENT_ID = "dispatch_router_v1";

export type AutoRedispatchResult =
  | { kind: "skipped"; reason: "not_stuck_sent" | "autonomy_off" | "exhausted" | "already_suggested" | "no_eligible_vendor" }
  | { kind: "auto_sent"; ghostedAssignmentId: string; sentAssignmentId: string }
  | { kind: "prepared_blocked"; draftAssignmentId: string; blockedBy: string };

/**
 * Autonomously re-dispatch ONE stuck assignment, gate-governed, system-actor, audited, idempotent.
 * Returns a discriminated result; never auto-acts unless the gate permits.
 */
export async function autoRedispatchForStuckAssignment(input: {
  tenantId: string;
  stuckAssignmentId: string;
}): Promise<AutoRedispatchResult> {
  const { tenantId, stuckAssignmentId } = input;

  // 1) STUCK-STILL-SENT PRE-CHECK (idempotency) — a ghosted/responded/terminal stuck → clean no-op.
  const stuck = await getAssignment(tenantId, stuckAssignmentId);
  if (!stuck) return { kind: "skipped", reason: "not_stuck_sent" };
  const sentStatus = await getDispatchAssignmentStatusByCode("SENT");
  if (!sentStatus || stuck.currentStatusId !== sentStatus.id) {
    return { kind: "skipped", reason: "not_stuck_sent" };
  }
  const jobId = stuck.jobId;
  const job = await getJob(tenantId, jobId);
  const clientId = job?.clientId ?? null;

  // 2) COARSE GATE BEFORE PREPARE ("off means off") — kill-switch folds into resolver step-0.
  const resolved = await resolveAgentPolicy(tenantId, DISPATCH_AGENT_ID, clientId);
  if (!resolved.autonomyEnabled) {
    return { kind: "skipped", reason: "autonomy_off" }; // no DRAFT created — nothing to clean up
  }

  // 3+) Past the coarse gate — open a run for observability (skips above write no run).
  const sys = await getSystemUserId(); // autonomous actor (non-null; setAssignmentStatus needs it)
  const ctx = await openRun({
    tenantId,
    agentId: DISPATCH_AGENT_ID,
    jobId,
    triggerSource: "auto_redispatch",
    inputSummary: `Auto-redispatch stuck assignment ${stuckAssignmentId}`,
  });

  try {
    // 3) PREPARE (rung-1, system actor).
    const prep = await prepareRedispatchSuggestion({ tenantId, jobId, stuckAssignmentId, createdByUserId: sys });
    if (prep.kind === "exhausted") {
      const reason = prep.reason === "no_eligible_vendor" ? "no_eligible_vendor" : "exhausted";
      await closeRun(ctx, { status: "succeeded", outputSummary: `Skipped: ${reason}` });
      return { kind: "skipped", reason };
    }
    if (prep.kind === "already_suggested") {
      await closeRun(ctx, { status: "succeeded", outputSummary: "Skipped: already_suggested" });
      return { kind: "skipped", reason: "already_suggested" };
    }
    const draftAssignmentId = prep.draftAssignmentId;

    // 4) FINE GATE — reuse auto-dispatch's gate VERBATIM (same calls, same job context).
    const token = await withinTokenCeilings(tenantId);
    const spend = await withinSpendCeilings(tenantId, jobId);
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

    const policyCheck = resolved.requiresReview ? "requires_review" : "review_not_required";
    const decisionMeta = { source: resolved.source, tokenOk: token.ok, spend, conditions: conditionsResult, draftAssignmentId, stuckAssignmentId };

    // 5) DECIDE.
    if (!permitted) {
      // The DRAFT stays pending — the rung-1 suggestion the operator can approve by hand.
      await logDecision(ctx, {
        decisionType: "auto_redispatch",
        proposedAction: `Auto-approve re-dispatch DRAFT ${draftAssignmentId} (replacing ${stuckAssignmentId})`,
        reasoning: `Blocked by ${blockedBy}; suggestion DRAFT retained for operator review.`,
        policyCheck,
        disposition: "policy_blocked",
        metadata: { ...decisionMeta, blockedBy },
      });
      await closeRun(ctx, { status: "succeeded", outputSummary: `Gated: ${blockedBy}` });
      return { kind: "prepared_blocked", draftAssignmentId, blockedBy };
    }

    // PERMITTED → autonomous ghost-old + send-new (system actor).
    const approved = await approveRedispatch({ tenantId, draftAssignmentId, actorUserId: sys });
    await logDecision(ctx, {
      decisionType: "auto_redispatch",
      proposedAction: `Auto-approve re-dispatch DRAFT ${draftAssignmentId} (replacing ${stuckAssignmentId})`,
      reasoning: "Within policy + conditions + guardrails; auto-approved (ghost + send).",
      policyCheck,
      disposition: "auto_executed",
      metadata: { ...decisionMeta, ghostedAssignmentId: approved.ghostedAssignmentId, sentAssignmentId: approved.sentAssignmentId },
    });
    await closeRun(ctx, { status: "succeeded", outputSummary: `Auto-sent: ghosted ${approved.ghostedAssignmentId}, sent ${approved.sentAssignmentId}` });
    return { kind: "auto_sent", ghostedAssignmentId: approved.ghostedAssignmentId, sentAssignmentId: approved.sentAssignmentId };
  } catch (err) {
    await closeRun(ctx, { status: "failed", outputSummary: `ERROR: ${err instanceof Error ? err.message : String(err)}` });
    throw err;
  }
}
