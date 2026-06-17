import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { jobAttachments } from "@/server/schema/job-details";
import { getStorageProvider } from "@/lib/integrations/storage";

/**
 * Operator-side reader for vendor-uploaded job photos (CF-20.1).
 *
 * Mirrors the vendor-invoice-document reader pattern (tenant + parent-scoped,
 * no-existence-leak discriminated result) but scoped to a JOB rather than an
 * invoice, and filtered to attachmentType='photo'. Operators are NOT
 * author-scoped: any operator in the tenant may view any photo on a job in
 * their tenant. Photos land visibility='internal_only' (aggregator-first,
 * §2.3 capture-then-review) and internal_only is the operator-visible tier,
 * so no visibility filter is applied here (matching the invoice-doc reader).
 *
 * This module is operational (operators reading work evidence), deliberately
 * NOT under billing/ (where the invoice-doc reader lives) or vendor/ (the
 * author-scoped vendor reader) — operators are neither billing- nor
 * vendor-scoped for this surface.
 */

export type JobPhotoRow = {
  id: string;
  title: string | null;
  attachmentType: string;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  hasFile: boolean;
  createdAt: Date;
};

export type JobPhotoUrlResult =
  | { kind: "url"; url: string; expiresInSeconds: number }
  | { kind: "placeholder" }
  | { kind: "unavailable" }
  | { kind: "forbidden" };

/**
 * List photo attachments on a job, tenant-scoped. Returns metadata only;
 * hasFile signals whether a stored object exists (storageKey != null).
 * Title-only placeholder rows (storageKey NULL) return hasFile: false.
 */
export async function listJobPhotos(
  tenantId: string,
  jobId: string,
): Promise<JobPhotoRow[]> {
  const rows = await db
    .select({
      id: jobAttachments.id,
      title: jobAttachments.title,
      attachmentType: jobAttachments.attachmentType,
      fileMimeType: jobAttachments.fileMimeType,
      fileSizeBytes: jobAttachments.fileSizeBytes,
      storageKey: jobAttachments.storageKey,
      createdAt: jobAttachments.createdAt,
    })
    .from(jobAttachments)
    .where(
      and(
        eq(jobAttachments.tenantId, tenantId),
        eq(jobAttachments.jobId, jobId),
        eq(jobAttachments.attachmentType, "photo"),
        ne(jobAttachments.status, "archived"),
      ),
    )
    .orderBy(desc(jobAttachments.createdAt));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    attachmentType: r.attachmentType,
    fileMimeType: r.fileMimeType,
    fileSizeBytes: r.fileSizeBytes,
    hasFile: r.storageKey != null,
    createdAt: r.createdAt,
  }));
}

/**
 * Resolve a short-lived presigned URL for one photo attachment, tenant +
 * job scoped. Discriminated result with no existence leak:
 *   - row not found in (tenant, job, photo) scope -> forbidden
 *     (missing ≡ out-of-scope; arbitrary ids cannot be probed)
 *   - row exists but no stored object (storageKey NULL) -> placeholder
 *   - storage presign fails (incl. provider not configured) -> unavailable
 *   - else -> url
 */
export async function getJobPhotoUrl(input: {
  tenantId: string;
  jobId: string;
  attachmentId: string;
}): Promise<JobPhotoUrlResult> {
  const [row] = await db
    .select({ storageKey: jobAttachments.storageKey })
    .from(jobAttachments)
    .where(
      and(
        eq(jobAttachments.id, input.attachmentId),
        eq(jobAttachments.tenantId, input.tenantId),
        eq(jobAttachments.jobId, input.jobId),
        eq(jobAttachments.attachmentType, "photo"),
        ne(jobAttachments.status, "archived"),
      ),
    )
    .limit(1);

  if (!row) return { kind: "forbidden" };
  if (!row.storageKey) return { kind: "placeholder" };

  const storage = getStorageProvider();
  const served = await storage.getSignedUrl(row.storageKey, 300);
  if (!served.ok) return { kind: "unavailable" };

  return {
    kind: "url",
    url: served.url,
    expiresInSeconds: served.expiresInSeconds,
  };
}
