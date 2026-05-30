import "server-only";

import { getJobDetail } from "@/server/jobs";

/**
 * Client-scoped single-row job reader (the direct-URL isolation crux, SI-11d.1).
 *
 * Mirrors getVendorAssignmentDetail (10k-ui): fetch the tenant-scoped JobDetail,
 * then enforce the scope guard — return null if the job's client is not in the
 * viewer's client scope, so a client cannot view another client's job by URL.
 * Callers call notFound() on null. The page selects client-safe fields at render
 * (getJobDetail returns the full JobDetail; the client surface chooses sections).
 *
 * Phase 11 batch 11e.
 */
export async function getClientJobDetail(
  tenantId: string,
  jobId: string,
  clientScope: Set<string>,
) {
  const detail = await getJobDetail(tenantId, jobId);
  if (!detail) return null;
  if (!clientScope.has(detail.clientId)) return null;
  return detail;
}
