import "server-only";

import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { jobAttachments } from "@/server/schema";
import { getAssignmentDetail } from "@/server/dispatch";
import { canActOnAssignment } from "@/server/role-predicates";
import { getStorageProvider } from "@/lib/integrations/storage";
import { type VendorActor, LINKLESS_ACTOR_LABEL } from "@/server/vendor/types";

// MIME → file extension (derived from content type, NOT the filename). The allowlist itself
// is enforced at the action layer; this map covers the accepted image types.
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

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
  actor: VendorActor;
  title: string;
  // Phase 20 (20b) — real bytes. Absent → the existing placeholder path (storage_key NULL).
  // Present → put-to-storage FIRST, then insert; a failed put writes NO row (the safe residue
  // is an orphan object, not an orphan row). The action layer enforces the MIME allowlist + size cap.
  file?: { bytes: Buffer; contentType: string; size: number };
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

  // Attribution (registered user vs linkless token), applied uniformly to both branches.
  const uploadedByUserId = input.actor.kind === "user" ? input.actor.userId : null;
  const sourceTokenId = input.actor.kind === "linkless" ? input.actor.tokenId : null;
  const auditActorLabel = input.actor.kind === "linkless" ? LINKLESS_ACTOR_LABEL : null;
  const auditVia = input.actor.kind === "user" ? "vendor_portal" : "magic_link";
  const auditTokenMeta = input.actor.kind === "linkless" ? { tokenId: input.actor.tokenId } : {};

  // ── Real-upload branch: storage put BEFORE the DB insert ──────────────────────────────
  if (input.file) {
    const attachmentId = uuidv7();
    const ext = MIME_EXT[input.file.contentType] ?? "bin";
    const key = `tenant/${input.tenantId}/job/${assignment.jobId}/attachment/${attachmentId}.${ext}`;

    const provider = getStorageProvider();
    const put = await provider.put({
      key,
      bytes: input.file.bytes,
      contentType: input.file.contentType,
    });
    if (!put.ok) throw new Error("STORAGE_PUT_FAILED"); // no row written on a failed put

    await db.insert(jobAttachments).values({
      id: attachmentId,
      tenantId: input.tenantId,
      jobId: assignment.jobId,
      title: input.title,
      attachmentType: "photo",
      visibility: "internal_only",
      uploadedByUserId,
      sourceTokenId,
      storageKey: key,
      checksum: put.checksum,
      storageProvider: provider.name,
      fileSizeBytes: put.size,
      fileMimeType: input.file.contentType,
      fileUrl: null, // served via presigned URL from storage_key (slice 4); no persisted URL.
    });

    await writeAuditLog({
      tenantId: input.tenantId,
      userId: uploadedByUserId,
      actorLabel: auditActorLabel,
      action: "job_attachment.uploaded",
      targetType: "job_attachment",
      targetId: attachmentId,
      metadata: {
        jobId: assignment.jobId,
        assignmentId: input.assignmentId,
        attachmentType: "photo",
        placeholder: false,
        size: put.size,
        mime: input.file.contentType,
        checksum: put.checksum,
        storageProvider: provider.name,
        actor: "vendor",
        via: auditVia,
        ...auditTokenMeta,
      },
    });

    return { id: attachmentId };
  }

  // ── Placeholder branch (unchanged): metadata-only row, storage_key/file_* NULL ────────
  const attachmentId = uuidv7();
  await db.insert(jobAttachments).values({
    id: attachmentId,
    tenantId: input.tenantId,
    jobId: assignment.jobId,
    title: input.title,
    attachmentType: "photo",
    visibility: "internal_only",
    uploadedByUserId,
    sourceTokenId,
    // file_url / file_size_bytes / file_mime_type / storage_key intentionally omitted → NULL
    // (the placeholder marker).
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: uploadedByUserId,
    actorLabel: auditActorLabel,
    action: "job_attachment.placeholder_created",
    targetType: "job_attachment",
    targetId: attachmentId,
    metadata: {
      jobId: assignment.jobId,
      assignmentId: input.assignmentId,
      attachmentType: "photo",
      placeholder: true,
      actor: "vendor",
      via: auditVia,
      ...auditTokenMeta,
    },
  });

  return { id: attachmentId };
}
