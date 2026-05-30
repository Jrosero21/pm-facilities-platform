import "server-only";

import { getAssignmentDetail } from "@/server/dispatch";
import { canActOnAssignment } from "@/server/role-predicates";
import { createJobNote } from "@/server/job-notes";

/**
 * Vendor creates a note on an assignment's parent job.
 *
 * Resolves the assignment to get jobId + vendorId, scope-checks via
 * canActOnAssignment, then delegates to createJobNote with origin='vendor',
 * visibility='internal_only' (10b Fork 4 + DoR-10l.1 — operator review happens
 * via visibility-with-origin-tag in the existing operator notes section;
 * visibility-promotion is banked FB-10l.2).
 *
 * Phase 10 batch 10l-construct.
 */
export async function createVendorNote(input: {
  assignmentId: string;
  tenantId: string;
  vendorScope: Set<string>;
  actorUserId: string;
  body: string;
}) {
  const assignment = await getAssignmentDetail(input.tenantId, input.assignmentId);
  if (!assignment) throw new Error("ASSIGNMENT_NOT_FOUND");
  if (
    !canActOnAssignment(
      input.vendorScope,
      { tenantId: input.tenantId, vendorId: assignment.vendorId },
      input.tenantId,
    )
  ) {
    throw new Error("VENDOR_SCOPE_MISMATCH");
  }
  return createJobNote({
    tenantId: input.tenantId,
    jobId: assignment.jobId,
    body: input.body,
    visibility: "internal_only",
    createdByUserId: input.actorUserId,
    origin: "vendor",
  });
}
