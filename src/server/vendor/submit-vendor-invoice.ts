import "server-only";

import {
  recordVendorInvoice,
  type VendorInvoiceLineItemInput,
} from "@/server/billing/vendor-invoices";
import { getAssignmentDetail } from "@/server/dispatch";
import { canSubmitVendorInvoice } from "@/server/role-predicates";
import { type VendorActor } from "@/server/vendor/types";

/**
 * Vendor submits an invoice via the vendor portal.
 *
 * Per 10b Fork 8, DoR-10n.1 (assignment-scoped), DoR-10n.2 (predicate stays
 * loose — no status gate), DoR-10n.3 (>=1 line item required).
 *
 * Thin wrapper over Phase 8's recordVendorInvoice — the canonical writer that
 * computes totals, resolves NTE governance, emits the vendor_invoice.received
 * billing event, and lands the row at status 'received' (DB default), all in one
 * transaction. Vendor side adds: requireVendor (at the action layer) +
 * canSubmitVendorInvoice gate + source_type='vendor_portal' + line-item
 * non-empty validation + assignment -> (jobId, vendorId) resolution.
 *
 * Line items arrive as plain strings (category/quantity/unitPrice) and are cast
 * to the writer's VendorInvoiceLineItemInput; the form constrains category to the
 * valid enum, the writer's assertCommonLineFields validates money fields, and the
 * DB enum rejects any invalid category as a final backstop.
 *
 * Phase 10 batch 10n-construct.
 */
export async function submitVendorInvoice(input: {
  assignmentId: string;
  tenantId: string;
  vendorScope: Set<string>;
  actor: VendorActor;
  invoiceNumber?: string;
  invoiceDate?: Date;
  notes?: string;
  lineItems: Array<{
    category: string;
    description: string;
    quantity: string;
    unit?: string;
    unitPrice: string;
  }>;
}): Promise<{ id: string }> {
  if (input.lineItems.length === 0) {
    throw new Error("INVOICE_REQUIRES_LINE_ITEMS");
  }

  const assignment = await getAssignmentDetail(input.tenantId, input.assignmentId);
  if (!assignment) throw new Error("ASSIGNMENT_NOT_FOUND");

  if (
    !canSubmitVendorInvoice(
      input.vendorScope,
      { tenantId: input.tenantId, vendorId: assignment.vendorId },
      input.tenantId,
    )
  ) {
    throw new Error("VENDOR_SCOPE_MISMATCH");
  }

  const lineItems: VendorInvoiceLineItemInput[] = input.lineItems.map((li) => ({
    category: li.category as VendorInvoiceLineItemInput["category"],
    description: li.description,
    quantity: li.quantity,
    unit: li.unit ?? null,
    unitPrice: li.unitPrice,
  }));

  return recordVendorInvoice({
    tenantId: input.tenantId,
    jobId: assignment.jobId,
    vendorId: assignment.vendorId,
    assignmentId: input.assignmentId,
    sourceType: "vendor_portal",
    invoiceNumber: input.invoiceNumber ?? null,
    invoiceDate: input.invoiceDate ?? null,
    notes: input.notes ?? null,
    // Registered vendor → user author; linkless → NULL author. (Invoice is NOT exposed on the
    // link surface in slice 4, so the linkless branch is unreachable here; mapped for the
    // uniform actor shape. No source_token_id — vendor_invoices has no author-filtered reader.)
    createdByUserId: input.actor.kind === "user" ? input.actor.userId : null,
    lineItems,
  });
}
