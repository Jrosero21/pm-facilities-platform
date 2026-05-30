import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { vendorInvoices } from "@/server/schema";
import { getAssignmentDetail } from "@/server/dispatch";
import { canActOnAssignment } from "@/server/role-predicates";

/**
 * Lists vendor invoices visible to a vendor on a given assignment.
 *
 * Filter: invoices linked to this assignment, with vendor_id IN scope. Simpler
 * than listVendorAssignmentNotes/Attachments — invoices carry explicit
 * assignment_id + vendor_id columns, so no author-subquery is needed.
 *
 * No status filter — the vendor sees their submitted invoices at any status
 * (received/under_review/approved/disputed/paid); status is shown in the UI.
 *
 * Returns [] on empty scope, missing assignment, or scope mismatch.
 *
 * Phase 10 batch 10n-construct.
 */
export async function listVendorAssignmentInvoices(
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

  return db
    .select({
      id: vendorInvoices.id,
      invoiceNumber: vendorInvoices.invoiceNumber,
      status: vendorInvoices.status,
      subtotal: vendorInvoices.subtotal,
      total: vendorInvoices.total,
      currency: vendorInvoices.currency,
      invoiceDate: vendorInvoices.invoiceDate,
      sourceType: vendorInvoices.sourceType,
      createdAt: vendorInvoices.createdAt,
    })
    .from(vendorInvoices)
    .where(
      and(
        eq(vendorInvoices.tenantId, tenantId),
        eq(vendorInvoices.assignmentId, assignmentId),
        inArray(vendorInvoices.vendorId, [...vendorScope]),
      ),
    )
    .orderBy(desc(vendorInvoices.createdAt));
}
