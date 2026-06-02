import "server-only";

import { and, eq } from "drizzle-orm";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { dispatchAssignmentStatuses, jobVendorAssignments } from "@/server/schema";
import { createDispatch } from "@/server/dispatch";
import { findCandidateVendorsForJob } from "@/server/vendor-matching";

// Phase 22 (slice 4) — rule-based auto-dispatch, Tier 2. The deterministic
// picker over the existing eligibility floor: it takes the TOP candidate of the
// floor-filtered, preference-then-rank-ordered matcher output and CREATES A DRAFT.
// No AI, no scoring (Tier 3 is Phase 27, data-blocked).
//
// Gate-ability (V2 invariants 4 + 5): this STOPS at DRAFT. It reuses createDispatch
// (always-DRAFT) and never calls sendDispatch — it cannot auto-send. Phase 23's
// policy engine governs WHEN this runs and whether a draft may auto-advance; this
// module wires NO trigger and is auto-invoked by nothing. It is a mechanism the
// harness and the future policy engine call explicitly.
//
// Idempotency (invariant 6): a per-job guard refuses to draft when a non-terminal
// assignment already exists, so it can't double-dispatch. Autonomy-never-silent
// (invariant 2): every drafted action writes a job_vendor_assignment.auto_drafted
// audit event (the NULL system actor alone is ambiguous).

export type AutoDispatchResult =
  | {
      outcome: "drafted";
      assignmentId: string;
      vendorId: string;
      preferenceRank: number | null;
    }
  | { outcome: "no_candidates" }
  | { outcome: "already_active"; existingAssignmentId?: string };

/**
 * Rule-based auto-dispatch for one job. Steps:
 *   a. idempotency guard FIRST — short-circuit if a non-terminal assignment exists.
 *   b. run the matcher; empty candidate set → no_candidates (nothing created).
 *   c. take candidates[0] and create a DRAFT via createDispatch (NULL system actor).
 *   d. write the auto_drafted audit event.
 * Never sends; never scores. Returns a discriminated result for the caller to act on.
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

  // c. The rule: the top candidate. createDispatch re-validates (its own
  // VENDOR_NO_LONGER_CANDIDATE check) and snapshots facets server-side, then
  // lands at DRAFT. NULL createdByUserId = system actor.
  const top = candidates[0];
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
      rule: "preferred-then-rank",
      preferenceRank: top.preferenceRank,
    },
  });

  return {
    outcome: "drafted",
    assignmentId: assignment.id,
    vendorId: top.vendorId,
    preferenceRank: top.preferenceRank,
  };
}
