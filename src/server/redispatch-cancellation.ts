import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { dispatchAssignmentStatuses, jobEvents } from "@/server/schema";
import { createDispatch, getAssignment, setAssignmentStatus } from "@/server/dispatch";
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
// ★ IT DOES NOT CHOOSE THE REPLACEMENT VENDOR. It creates the linked DRAFT and hands the operator
// back to the normal dispatch form. The coordinator is usually on the phone and already knows who
// is free; a ranker's opinion is not what is missing at that moment.

export type RedispatchAfterCancellationResult = {
  /** The assignment just closed as DECLINED. */
  cancelledAssignmentId: string;
  /** The new DRAFT, already linked via replacesAssignmentId. */
  replacementAssignmentId: string;
  jobId: string;
};

/**
 * Record that the assigned vendor cancelled, and open a linked replacement dispatch.
 *
 * Two phases, mirroring approveRedispatch's ordered-with-recovery seam: close first, then create.
 * If the create throws after the close committed, the old assignment is correctly DECLINED and the
 * job simply has no live dispatch — a state the exceptions queue already surfaces and the operator
 * can dispatch from normally. The reverse order would risk two live assignments on one job.
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

  // ── PHASE 2: open the linked replacement DRAFT ──
  // Carries forward the operational facts the coordinator already agreed (scope, NTE, schedule) so
  // the pre-filled form is a starting point rather than a blank one. The VENDOR is deliberately
  // NOT carried forward — that is the whole point of a re-dispatch.
  const replacement = await createDispatch({
    tenantId: input.tenantId,
    jobId: old.jobId,
    vendorId: old.vendorId, // placeholder; the operator changes it on the pre-filled form
    agreedNteAmount: old.agreedNteAmount ?? null,
    scheduledStartAt: old.scheduledStartAt ?? null,
    scheduledEndAt: old.scheduledEndAt ?? null,
    dispatchScope: old.dispatchScope ?? null,
    // ★ THE CHAIN LINK — the same self-FK the agent path stamps, so manual and automatic
    // re-dispatch produce an identical structure for analytics and the sweep's cooldown lookup.
    replacesAssignmentId: input.assignmentId,
    createdByUserId: input.actorUserId,
    geoMode: "search", // the operator is choosing by hand; do not hard-reject out-of-area
  });

  await db.insert(jobEvents).values({
    tenantId: input.tenantId,
    jobId: old.jobId,
    eventType: "dispatch.vendor_cancelled",
    actorUserId: input.actorUserId,
    summary: note,
    metadata: {
      cancelledAssignmentId: input.assignmentId,
      replacementAssignmentId: replacement.id,
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
      replacementAssignmentId: replacement.id,
    },
  });

  return {
    cancelledAssignmentId: input.assignmentId,
    replacementAssignmentId: replacement.id,
    jobId: old.jobId,
  };
}
