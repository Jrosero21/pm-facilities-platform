import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { clientInvoices, jobs } from "@/server/schema";

export type ClientInvoiceSummaryRow = {
  id: string;
  invoiceNumber: string | null;
  status: "draft" | "sent" | "void";
  paymentStatus: "unpaid" | "partially_paid" | "paid";
  total: string;
  currency: string;
  issuedAt: Date | null;
  dueAt: Date | null;
  jobId: string;
  jobNumber: number;
};

/**
 * Client-facing invoice list — Phase 11 batch 11i (read-only, OQ-6-safe).
 *
 * Invoices the client has been issued, across all their in-scope jobs. The Phase-8
 * AR isolation contract (OQ-6): the client portal renders the marked-up TOTAL only,
 * NEVER markup_total/subtotal or any line item (margin confidentiality). This reader
 * selects total only — markupTotal, subtotal, and the line-items table are not touched.
 *
 * status='sent' only (J1/F2): drafts and voids never surface to the client; the
 * orthogonal payment_status (unpaid/partially_paid/paid) is shown as the pay state.
 * Joins jobs for the recognizable jobNumber. Empty scope → [].
 */
export async function listClientInvoicesForClientScope(
  tenantId: string,
  clientScope: Set<string>,
): Promise<ClientInvoiceSummaryRow[]> {
  if (clientScope.size === 0) return [];
  return db
    .select({
      id: clientInvoices.id,
      invoiceNumber: clientInvoices.invoiceNumber,
      status: clientInvoices.status,
      paymentStatus: clientInvoices.paymentStatus,
      total: clientInvoices.total,
      currency: clientInvoices.currency,
      issuedAt: clientInvoices.issuedAt,
      dueAt: clientInvoices.dueAt,
      jobId: clientInvoices.jobId,
      jobNumber: jobs.jobNumber,
    })
    .from(clientInvoices)
    .innerJoin(jobs, eq(clientInvoices.jobId, jobs.id))
    .where(
      and(
        eq(clientInvoices.tenantId, tenantId),
        inArray(clientInvoices.clientId, [...clientScope]),
        eq(clientInvoices.status, "sent"),
      ),
    )
    .orderBy(desc(clientInvoices.issuedAt));
}
