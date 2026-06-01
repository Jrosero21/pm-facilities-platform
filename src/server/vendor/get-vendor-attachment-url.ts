import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { jobAttachments, vendorUsers } from "@/server/schema";
import { getAssignmentDetail } from "@/server/dispatch";
import { canActOnAssignment } from "@/server/role-predicates";
import { getStorageProvider } from "@/lib/integrations/storage";

/**
 * Resolve a time-limited (presigned) read URL for ONE vendor-scoped attachment.
 *
 * Reuses listVendorAssignmentAttachments's gate EXACTLY (Phase 10 10m / Phase 20 20b):
 *   (1) the assignment→tenant→vendor gate (getAssignmentDetail + canActOnAssignment), then
 *   (2) the author-scope row filter (uploaded_by_user_id ∈ the vendor_users subquery,
 *       tenant-scoped, non-archived) — so a vendor can only presign an attachment within
 *       their own scope.
 *
 * Existence is NOT leaked: a missing row and an out-of-scope row both return 'forbidden'
 * (the same result), so a vendor cannot probe ids outside their scope.
 *
 * Placeholder rows (no storage_key) return a soft 'placeholder' — not an error. A failed
 * presign returns a soft 'unavailable' — not a throw. Operator serve is deferred (no operator
 * attachment reader exists yet — 4A).
 *
 * Phase 20 batch 20b (serve).
 */
export type VendorAttachmentUrlResult =
  | { kind: "url"; url: string; expiresInSeconds: number }
  | { kind: "placeholder" }
  | { kind: "unavailable" }
  | { kind: "forbidden" };

export async function getVendorAttachmentUrl(input: {
  assignmentId: string;
  attachmentId: string;
  tenantId: string;
  vendorScope: Set<string>;
}): Promise<VendorAttachmentUrlResult> {
  // (1) assignment→tenant→vendor gate — verbatim shape from the reader.
  if (input.vendorScope.size === 0) return { kind: "forbidden" };

  const assignment = await getAssignmentDetail(input.tenantId, input.assignmentId);
  if (!assignment) return { kind: "forbidden" };
  if (
    !canActOnAssignment(
      input.vendorScope,
      { tenantId: input.tenantId, vendorId: assignment.vendorId },
      input.tenantId,
    )
  ) {
    return { kind: "forbidden" };
  }

  // (2) author-scope row filter — same subquery + tenant + jobId + non-archived as the reader.
  const vendorUserSubquery = db
    .select({ userId: vendorUsers.userId })
    .from(vendorUsers)
    .where(
      and(
        eq(vendorUsers.tenantId, input.tenantId),
        inArray(vendorUsers.vendorId, [...input.vendorScope]),
      ),
    );

  const rows = await db
    .select({ storageKey: jobAttachments.storageKey })
    .from(jobAttachments)
    .where(
      and(
        eq(jobAttachments.id, input.attachmentId),
        eq(jobAttachments.tenantId, input.tenantId),
        eq(jobAttachments.jobId, assignment.jobId),
        ne(jobAttachments.status, "archived"),
        inArray(jobAttachments.uploadedByUserId, vendorUserSubquery),
      ),
    )
    .limit(1);

  const row = rows[0];
  // Missing OR out-of-scope → the SAME result (do not leak existence).
  if (!row) return { kind: "forbidden" };

  // Placeholder (no real bytes) → soft, not an error.
  if (!row.storageKey) return { kind: "placeholder" };

  const provider = getStorageProvider();
  const signed = await provider.getSignedUrl(row.storageKey);
  if (!signed.ok) return { kind: "unavailable" };

  return { kind: "url", url: signed.url, expiresInSeconds: signed.expiresInSeconds };
}
