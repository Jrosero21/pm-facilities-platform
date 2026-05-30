import "server-only";

import { getAssignmentDetail } from "@/server/dispatch";
import { canActOnAssignment } from "@/server/role-predicates";

/**
 * Vendor-scoped wrapper over getAssignmentDetail.
 *
 * Loads the assignment via the existing tenant-scoped reader, then applies the
 * vendor-scope guard. Returns null if the assignment doesn't exist OR if the
 * vendor scope doesn't cover it — callers call notFound() on null.
 *
 * Fork 5 ruling: thin wrapper, not a fork in the schema query. canActOnAssignment
 * (10g) is the predicate authority for "vendor X may act on assignment Y".
 * getAssignmentDetail does not select tenant_id, so the canActOnAssignment
 * tenant check is fed the input tenantId (equal by the reader's query contract).
 *
 * Phase 10 batch 10k-ui.
 */
export async function getVendorAssignmentDetail(
  tenantId: string,
  assignmentId: string,
  vendorScope: Set<string>,
) {
  const detail = await getAssignmentDetail(tenantId, assignmentId);
  if (!detail) return null;
  if (
    !canActOnAssignment(
      vendorScope,
      { tenantId, vendorId: detail.vendorId },
      tenantId,
    )
  ) {
    return null;
  }
  return detail;
}
