import "server-only";

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { jobAttachments, users, vendorUsers } from "@/server/schema";
import { getAssignmentDetail } from "@/server/dispatch";
import { canActOnAssignment } from "@/server/role-predicates";

/**
 * Lists attachments visible to a vendor on the assignment's parent job.
 *
 * Per DoR-10m.1 (author-scope): the vendor sees attachment rows whose
 * uploaded_by_user_id is in the vendor_users-scope-subquery (uploaded by some
 * user in the viewing vendor's scope, in this tenant).
 *
 * No visibility-IN branch (unlike listVendorAssignmentNotes) because in MVP:
 *   (a) no operator-side attachment writer exists,
 *   (b) all rows are vendor-internal placeholders (DoR-10m.2),
 *   (c) operator visibility-promotion is deferred (FB-10l.2 extended).
 * If a future phase adds operator writers / promotion, the visibility branch
 * extends symmetrically to the notes reader.
 *
 * Returns [] on empty scope, missing assignment, or scope mismatch.
 *
 * Phase 10 batch 10m-construct.
 */
export async function listVendorAssignmentAttachments(
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
      id: jobAttachments.id,
      title: jobAttachments.title,
      attachmentType: jobAttachments.attachmentType,
      fileUrl: jobAttachments.fileUrl,
      visibility: jobAttachments.visibility,
      uploadedByUserId: jobAttachments.uploadedByUserId,
      createdAt: jobAttachments.createdAt,
      authorName: users.name,
    })
    .from(jobAttachments)
    .leftJoin(users, eq(users.id, jobAttachments.uploadedByUserId))
    .where(
      and(
        eq(jobAttachments.tenantId, tenantId),
        eq(jobAttachments.jobId, assignment.jobId),
        ne(jobAttachments.status, "archived"),
        inArray(jobAttachments.uploadedByUserId, vendorUserSubquery),
      ),
    )
    .orderBy(desc(jobAttachments.createdAt));
}
