import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { dispatchAssignmentStatuses, jobEvents } from "@/server/schema";
import { getAssignment, setAssignmentStatus } from "@/server/dispatch";
import { writeAuditLog } from "@/server/audit";
import {
  CANCELLATION_CLOSE_STATUS,
  buildCancellationNote,
  validateRedispatchCancellation,
} from "@/server/redispatch-cancellation-rules";

// ── FOUNDATION Gap 5 — RE-DISPATCH AFTER A VENDOR CANCELLATION (choreography outcome 1c) ──
// The smooth-path-gone-wrong on every job a vendor pulls out of: "can't make it" → that vendor is
// OUT → find a new one → the process restarts at DISPATCH.
//
// ★ WHY THIS EXISTS RATHER THAN REUSING approveRedispatch. That path is reachable by an operator
// (SuggestReplacementButton → prepareRedispatchSuggestion → approveRedispatch) and it does link the
// chain — but it is built for a vendor who went SILENT, and it is wrong here in three ways:
//   1. it only surfaces in the exceptions queue, gated on kind 'vendor_not_accepted' AND an
//      age-based stuck threshold, so a vendor cancelling ten minutes after accepting never appears;
//   2. approveRedispatch hard-guards STUCK_NO_LONGER_SENT, so the coordinator's natural first move
//      — marking the assignment DECLINED because the vendor said so — BREAKS it;
//   3. it closes the old assignment as GHOSTED, noted "vendor did not respond". For a cancellation
//      that is false, and GHOSTED is the strongest negative reliability signal the platform has.
// This module keeps the linked structure and fixes the description.
//
// ★ IT CLOSES, IT DOES NOT CREATE. An earlier shape pre-created the replacement DRAFT here and
// redirected to its record page. That was wrong twice over: the record page has no vendor picker,
// so the operator could not actually do the one thing the flow promised; and every abandoned
// cancellation left a stranded DRAFT behind. Now this closes the old assignment and the CALLER
// redirects to /dispatch/new?replaces={id} — the real dispatch form, where the vendor is chosen and
// the draft is only created on submit. No orphan is possible, because nothing is created until the
// operator commits.
//
// The replaced assignment id travels in the URL, and /dispatch/new RE-DERIVES scope, NTE and
// schedule from it rather than carrying them as query params: one source of truth, nothing to
// tamper with in the address bar, and no stale values if the assignment changed in between.

export type RedispatchAfterCancellationResult = {
  /** The assignment just closed as DECLINED. Becomes ?replaces= on the dispatch form. */
  cancelledAssignmentId: string;
  jobId: string;
};

/**
 * Record that the assigned vendor cancelled, and open a linked replacement dispatch.
 *
 * ONE write: the close. There is no second phase to fail, and no draft to strand — a considerable
 * simplification over the earlier close-then-create shape. If the operator abandons the dispatch
 * form afterwards, the job simply has no live dispatch, which the exceptions queue already
 * surfaces and any operator can dispatch from normally.
 *
 * Throws: ASSIGNMENT_NOT_FOUND, ASSIGNMENT_NOT_CANCELLABLE, CANCELLATION_NOTE_TOO_LONG.
 */
export async function operatorRedispatchAfterCancellation(input: {
  tenantId: string;
  assignmentId: string;
  /** Operator's free-text reason ("truck broke down", "double-booked"). Optional. */
  reason?: string | null;
  actorUserId: string;
}): Promise<RedispatchAfterCancellationResult> {
  const old = await getAssignment(input.tenantId, input.assignmentId);
  if (!old) throw new Error("ASSIGNMENT_NOT_FOUND");

  // Resolve the current status CODE — the pure guard reasons about codes, not ids.
  const [status] = await db
    .select({ code: dispatchAssignmentStatuses.code })
    .from(dispatchAssignmentStatuses)
    .where(eq(dispatchAssignmentStatuses.id, old.currentStatusId))
    .limit(1);
  if (!status) throw new Error("ASSIGNMENT_NOT_FOUND");

  const invalid = validateRedispatchCancellation({
    currentStatusCode: status.code,
    note: input.reason,
  });
  if (invalid) throw new Error(invalid);

  const note = buildCancellationNote(input.reason);

  // ── PHASE 1: close the old assignment HONESTLY ──
  // DECLINED, never GHOSTED — see the rules module for why that distinction is load-bearing.
  await setAssignmentStatus({
    tenantId: input.tenantId,
    assignmentId: input.assignmentId,
    toCode: CANCELLATION_CLOSE_STATUS,
    actorUserId: input.actorUserId,
    note,
  });

  // The chain link is stamped when the operator submits the dispatch form, which carries
  // ?replaces={id} through to createDispatch — the same self-FK the agent path uses, so manual and
  // automatic re-dispatch still produce an identical structure for analytics and the sweep.

  await db.insert(jobEvents).values({
    tenantId: input.tenantId,
    jobId: old.jobId,
    eventType: "dispatch.vendor_cancelled",
    actorUserId: input.actorUserId,
    summary: note,
    metadata: {
      cancelledAssignmentId: input.assignmentId,
      vendorId: old.vendorId,
      fromStatus: status.code,
      closedAs: CANCELLATION_CLOSE_STATUS,
    },
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.actorUserId,
    action: "dispatch.vendor_cancelled.operator_relayed",
    targetType: "job_vendor_assignment",
    targetId: input.assignmentId,
    metadata: {
      jobId: old.jobId,
      vendorId: old.vendorId,
      fromStatus: status.code,
      closedAs: CANCELLATION_CLOSE_STATUS,
    },
  });

  return { cancelledAssignmentId: input.assignmentId, jobId: old.jobId };
}
