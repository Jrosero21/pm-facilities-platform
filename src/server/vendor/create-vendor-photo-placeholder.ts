import "server-only";

import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { jobAttachments } from "@/server/schema";
import { getAssignmentDetail } from "@/server/dispatch";
import { canActOnAssignment } from "@/server/role-predicates";

/**
 * Vendor creates a photo-placeholder attachment row on an assignment's parent
 * job.
 *
 * Per 10b Fork 7 (placeholder, metadata-row variant) + DoR-10m.1 (author-scope,
 * no origin column) + DoR-10m.2 (visibility='internal_only'; operator
 * visibility-promotion deferred, FB-10l.2 extended).
 *
 * Writes a metadata-only row: title (user-supplied), attachment_type='photo',
 * file_url/file_size_bytes/file_mime_type NULL (the cross-phase placeholder
 * marker), visibility='internal_only', uploaded_by_user_id=actor (scoped by
 * vendor_users at read time). A future real-upload phase (FB-10a.4) backfills
 * file_url/size/mime on these rows.
 *
 * Single-insert: audit via writeAuditLog() out-of-txn (createJobNote convention).
 * Explicit uuidv7() at the insert site (createJobNote precedent).
 *
 * Phase 10 batch 10m-construct.
 */
export async function createVendorPhotoPlaceholder(input: {
  assignmentId: string;
  tenantId: string;
  vendorScope: Set<string>;
  actorUserId: string;
  title: string;
}): Promise<{ id: string }> {
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

  const attachmentId = uuidv7();
  await db.insert(jobAttachments).values({
    id: attachmentId,
    tenantId: input.tenantId,
    jobId: assignment.jobId,
    title: input.title,
    attachmentType: "photo",
    visibility: "internal_only",
    uploadedByUserId: input.actorUserId,
    // file_url / file_size_bytes / file_mime_type intentionally omitted → NULL
    // (the placeholder marker).
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.actorUserId,
    action: "job_attachment.placeholder_created",
    targetType: "job_attachment",
    targetId: attachmentId,
    metadata: {
      jobId: assignment.jobId,
      assignmentId: input.assignmentId,
      attachmentType: "photo",
      placeholder: true,
      actor: "vendor",
      via: "vendor_portal",
    },
  });

  return { id: attachmentId };
}
