// Phase 28 rung 1 — re-dispatch suggestion ENGINE (decision logic only; NO writes).
//
// decideRedispatch READS (matcher + assignments) and returns a DECISION that the later
// write sub-batches consume (it creates no DRAFT, ghosts nothing). The pure core
// (decideRedispatchCore) holds the actual decision and is fully unit-tested offline.
// DB deps are dynamic-imported inside decideRedispatch so the harness can import the
// pure core without pulling @/server/db (mirrors the dispatch-sla-rules pure-module split).

export const REDISPATCH_MAX_ATTEMPTS = 3;

export type RedispatchCopyForward = {
  agreedNteAmount: number | null;
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
  //    so read it off the row). agreedNteAmount is a decimal (string) -> number per the type.
  const copyForward: RedispatchCopyForward = {
    agreedNteAmount: stuck.agreedNteAmount != null ? Number(stuck.agreedNteAmount) : null,
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
