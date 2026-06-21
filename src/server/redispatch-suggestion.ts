// Phase 28 rung 1 — re-dispatch suggestion ENGINE (decision logic only; NO writes).
//
// decideRedispatch READS (matcher + assignments) and returns a DECISION that the later
// write sub-batches consume (it creates no DRAFT, ghosts nothing). The pure core
// (decideRedispatchCore) holds the actual decision and is fully unit-tested offline.
// DB deps are dynamic-imported inside decideRedispatch so the harness can import the
// pure core without pulling @/server/db (mirrors the dispatch-sla-rules pure-module split).

export const REDISPATCH_MAX_ATTEMPTS = 3;

export type RedispatchCopyForward = {
  agreedNteAmount: string | null; // raw decimal string — pure pass-through to createDispatch (no float round-trip)
  dispatchScope: string | null;
  scheduledStartAt: Date | null;
};

export type RedispatchDecision =
  | { kind: "suggest"; vendorId: string; copyForward: RedispatchCopyForward; attemptsSoFar: number }
  | { kind: "exhausted"; reason: "max_attempts" | "no_eligible_vendor"; attemptsSoFar: number };

/**
 * PURE decision core — no DB, no side effects, fully unit-tested offline.
 * - rankedVendorIds: eligible candidate vendorIds, best-first (already ranked).
 * - triedVendorIds: every vendor already assigned on the job (terminal or not) — never re-suggested.
 * - attemptsSoFar: vendors actually SENT (a pending un-sent DRAFT does not count).
 */
export function decideRedispatchCore(input: {
  attemptsSoFar: number;
  triedVendorIds: Set<string>;
  rankedVendorIds: string[];
  copyForward: RedispatchCopyForward;
}): RedispatchDecision {
  const { attemptsSoFar, triedVendorIds, rankedVendorIds, copyForward } = input;

  if (attemptsSoFar >= REDISPATCH_MAX_ATTEMPTS) {
    return { kind: "exhausted", reason: "max_attempts", attemptsSoFar };
  }

  const nextVendorId = rankedVendorIds.find((v) => !triedVendorIds.has(v));
  if (nextVendorId === undefined) {
    return { kind: "exhausted", reason: "no_eligible_vendor", attemptsSoFar };
  }

  return { kind: "suggest", vendorId: nextVendorId, copyForward, attemptsSoFar };
}

/**
 * Live wrapper: reads the matcher + the job's assignments, then defers to the pure core.
 * READ-ONLY — writes nothing, creates no DRAFT (that is sub-batch 2). Throws
 * STUCK_ASSIGNMENT_NOT_ON_JOB if the stuck assignment is missing or on another job.
 */
export async function decideRedispatch(input: {
  tenantId: string;
  jobId: string;
  stuckAssignmentId: string; // the stuck SENT assignment being replaced
}): Promise<RedispatchDecision> {
  const { tenantId, jobId, stuckAssignmentId } = input;

  const { getAssignment, listAssignmentsForJob } = await import("@/server/dispatch");
  const { findCandidateVendorsForJob } = await import("@/server/vendor-matching");
  const { rankCandidates, toScoredCandidate } = await import("@/server/scorer");
  const { getJob } = await import("@/server/jobs");
  const { getVendorPerformanceScoresForVendors } = await import("@/server/analytics/vendor-performance");

  // Guard: the stuck assignment must exist and belong to this job (caller bug otherwise).
  const stuck = await getAssignment(tenantId, stuckAssignmentId);
  if (!stuck || stuck.jobId !== jobId) {
    throw new Error("STUCK_ASSIGNMENT_NOT_ON_JOB");
  }

  // 1. attempts = assignments actually SENT; tried = ALL assigned vendors (terminal or not).
  const assignments = await listAssignmentsForJob(tenantId, jobId);
  const attemptsSoFar = assignments.filter((a) => a.sentAt != null).length;
  const triedVendorIds = new Set(assignments.map((a) => a.vendorId));

  // 2. Re-rank fresh over the eligible set — EXACTLY the auto-dispatch.ts:95 call-site pattern.
  const candidates = await findCandidateVendorsForJob(tenantId, jobId);
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

  // 3. copyForward from the stuck assignment (dispatchScope is not in listAssignmentsForJob,
  //    so read it off the row). agreedNteAmount stays the raw decimal string — pure pass-through
  //    to createDispatch (which takes string | null), no float round-trip.
  const copyForward: RedispatchCopyForward = {
    agreedNteAmount: stuck.agreedNteAmount ?? null,
    dispatchScope: stuck.dispatchScope ?? null,
    scheduledStartAt: stuck.scheduledStartAt ?? null,
  };

  return decideRedispatchCore({
    attemptsSoFar,
    triedVendorIds,
    rankedVendorIds: ranked.map((c) => c.vendorId),
    copyForward,
  });
}

export type RedispatchSuggestionResult =
  | { kind: "prepared"; draftAssignmentId: string; vendorId: string }
  | { kind: "exhausted"; reason: "max_attempts" | "no_eligible_vendor" }
  | { kind: "already_suggested"; existingDraftId: string };

/**
 * The WRITE side: consume the decision and land a re-dispatch suggestion DRAFT to the next
 * eligible vendor, stamping replaces_assignment_id = the stuck assignment. Idempotent — if a
 * suggestion DRAFT already replaces this stuck assignment, returns "already_suggested" without
 * creating a second. createDispatch re-validates eligibility (VENDOR_NO_LONGER_CANDIDATE may
 * throw if the vendor went ineligible between decide and create — let it propagate to the caller).
 */
export async function prepareRedispatchSuggestion(input: {
  tenantId: string;
  jobId: string;
  stuckAssignmentId: string;
  createdByUserId: string;
}): Promise<RedispatchSuggestionResult> {
  const { tenantId, jobId, stuckAssignmentId, createdByUserId } = input;

  const { db } = await import("@/server/db");
  const { jobVendorAssignments, dispatchAssignmentStatuses } = await import("@/server/schema");
  const { eq, and } = await import("drizzle-orm");
  const { createDispatch } = await import("@/server/dispatch");

  // 1. Idempotency guard — a DRAFT already replacing this stuck assignment? (replaces_assignment_id
  //    is NOT in listAssignmentsForJob's projection, so a direct targeted select.)
  const existing = await db
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
        eq(jobVendorAssignments.replacesAssignmentId, stuckAssignmentId),
        eq(dispatchAssignmentStatuses.code, "DRAFT"),
      ),
    )
    .limit(1);
  if (existing[0]) {
    return { kind: "already_suggested", existingDraftId: existing[0].id };
  }

  // 2. Decide (re-rank fresh, skip tried, cap-aware).
  const decision = await decideRedispatch({ tenantId, jobId, stuckAssignmentId });
  if (decision.kind === "exhausted") {
    return { kind: "exhausted", reason: decision.reason };
  }

  // 3. Land the suggestion DRAFT to the next eligible vendor, carrying scope/NTE/schedule forward
  //    and stamping the replaces-link. createDispatch re-checks eligibility (may throw).
  const assignment = await createDispatch({
    tenantId,
    jobId,
    vendorId: decision.vendorId,
    createdByUserId,
    replacesAssignmentId: stuckAssignmentId,
    agreedNteAmount: decision.copyForward.agreedNteAmount,
    dispatchScope: decision.copyForward.dispatchScope,
    scheduledStartAt: decision.copyForward.scheduledStartAt,
  });

  return { kind: "prepared", draftAssignmentId: assignment.id, vendorId: decision.vendorId };
}

/**
 * Approve a re-dispatch suggestion: ghost the stuck assignment, then send the suggestion DRAFT.
 * ORDERED-WITH-RECOVERY — the two writes are INDEPENDENT transactions (setAssignmentStatus and
 * sendDispatch each own their own). Ghost-first is deliberate: if the send fails after the ghost
 * commits, the stuck is GHOSTED with no replacement SENT → the next stuck-scan re-suggests (the
 * documented self-heal seam). Send-first would risk two active dispatches if the ghost then failed.
 * All guards are read-only and precede both writes, so a double-click fails cleanly (no half-apply).
 *
 * Throws: ASSIGNMENT_NOT_FOUND, NOT_A_REDISPATCH_SUGGESTION, DRAFT_NOT_PENDING, STUCK_NO_LONGER_SENT,
 * STATUS_NOT_FOUND, plus any sendDispatch code (JOB_NOT_DISPATCHABLE, JOB_BECAME_TERMINAL, ...).
 */
export async function approveRedispatch(input: {
  tenantId: string;
  draftAssignmentId: string;
  actorUserId: string;
}): Promise<{ kind: "approved"; ghostedAssignmentId: string; sentAssignmentId: string }> {
  const { tenantId, draftAssignmentId, actorUserId } = input;

  const { getAssignment, setAssignmentStatus, sendDispatch } = await import("@/server/dispatch");
  const { getDispatchAssignmentStatusByCode } = await import("@/server/dispatch-reference");

  // --- GUARDS (read-only, all before any write; order matters for clean double-click) ---
  const draft = await getAssignment(tenantId, draftAssignmentId);
  if (!draft) throw new Error("ASSIGNMENT_NOT_FOUND");

  // 2. must be a re-dispatch suggestion (not a plain manual draft).
  if (draft.replacesAssignmentId == null) throw new Error("NOT_A_REDISPATCH_SUGGESTION");
  const stuckAssignmentId = draft.replacesAssignmentId;

  // 3. the suggestion must still be DRAFT (a 2nd approve finds it SENT → fails here, before any write).
  const draftStatus = await getDispatchAssignmentStatusByCode("DRAFT");
  const sentStatus = await getDispatchAssignmentStatusByCode("SENT");
  if (!draftStatus || !sentStatus) throw new Error("STATUS_NOT_FOUND");
  if (draft.currentStatusId !== draftStatus.id) throw new Error("DRAFT_NOT_PENDING");

  // 4. THE MANDATORY GUARD — the stuck assignment must still be SENT (the machine won't enforce
  //    a from-status check, so setAssignmentStatus would happily ghost a vendor who responded).
  const stuck = await getAssignment(tenantId, stuckAssignmentId);
  if (!stuck) throw new Error("ASSIGNMENT_NOT_FOUND");
  if (stuck.currentStatusId !== sentStatus.id) throw new Error("STUCK_NO_LONGER_SENT");

  // --- WRITES, ghost-first (ORDERED-WITH-RECOVERY seam between the two independent txns) ---
  // a) ghost the stuck assignment (its own txn commits here).
  await setAssignmentStatus({
    tenantId,
    assignmentId: stuckAssignmentId,
    toCode: "GHOSTED",
    actorUserId,
    note: "Auto-ghosted on re-dispatch approval (vendor did not respond).",
  });
  // b) send the suggestion DRAFT (its own txn). If THIS throws after (a) committed, let it
  //    propagate — the stuck is GHOSTED, no replacement SENT, and the next stuck-scan re-suggests.
  //    Do NOT roll back the ghost (that's the deliberately-deferred true-atomic option).
  await sendDispatch({ tenantId, assignmentId: draftAssignmentId, actorUserId });

  return { kind: "approved", ghostedAssignmentId: stuckAssignmentId, sentAssignmentId: draftAssignmentId };
}
