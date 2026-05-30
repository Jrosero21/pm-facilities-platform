import "server-only";

import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@/server/db";
import { jobNotes, users, vendorUsers } from "@/server/schema";
import { getAssignmentDetail } from "@/server/dispatch";
import { canActOnAssignment } from "@/server/role-predicates";

/**
 * Lists notes visible to a vendor on a given assignment's parent job.
 *
 * DoR-10l.2 filter (a note is visible iff):
 *   visibility IN ('vendor_visible', 'client_and_vendor_visible')
 *   OR (origin = 'vendor' AND created_by_user_id IN
 *       (SELECT user_id FROM vendor_users WHERE tenant_id = T AND vendor_id IN S))
 *
 * The vendor_users author-scope subquery prevents vendor A from seeing vendor
 * B's vendor-origin notes on a job they both serve — multi-vendor-on-one-job
 * correctness. Returns [] on empty scope, missing assignment, or scope mismatch.
 *
 * Phase 10 batch 10l-construct.
 */
export async function listVendorAssignmentNotes(
  tenantId: string,
  assignmentId: string,
  vendorScope: Set<string>,
) {
  if (vendorScope.size === 0) return [];

  const assignment = await getAssignmentDetail(tenantId, assignmentId);
  if (!assignment) return [];
  if (
    !canActOnAssignment(
      vendorScope,
      { tenantId, vendorId: assignment.vendorId },
      tenantId,
    )
  ) {
    return [];
  }

  // user_ids belonging to any vendor org in the viewer's scope.
  const vendorUserSubquery = db
    .select({ userId: vendorUsers.userId })
    .from(vendorUsers)
    .where(
      and(
        eq(vendorUsers.tenantId, tenantId),
        inArray(vendorUsers.vendorId, [...vendorScope]),
      ),
    );

  return db
    .select({
      id: jobNotes.id,
      body: jobNotes.body,
      visibility: jobNotes.visibility,
      origin: jobNotes.origin,
      createdAt: jobNotes.createdAt,
      authorName: users.name,
    })
    .from(jobNotes)
    .leftJoin(users, eq(users.id, jobNotes.createdByUserId))
    .where(
      and(
        eq(jobNotes.tenantId, tenantId),
        eq(jobNotes.jobId, assignment.jobId),
        ne(jobNotes.status, "archived"),
        or(
          inArray(jobNotes.visibility, [
            "vendor_visible",
            "client_and_vendor_visible",
          ]),
          and(
            eq(jobNotes.origin, "vendor"),
            inArray(jobNotes.createdByUserId, vendorUserSubquery),
          ),
        ),
      ),
    )
    .orderBy(desc(jobNotes.createdAt));
}
