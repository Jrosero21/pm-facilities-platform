import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { invoiceDrafts } from "@/server/schema";
import { getClient } from "@/server/clients";
import { loadJobBillingContext } from "@/server/billing/client-rates";
import { hasInvoiceDocument } from "@/server/billing/vendor-invoice-documents";

// ── Phase (iii) Part 3 — cost-plus "vendor invoice on file" ADVISORY gate ──────────────
// At cost-plus client-invoice ISSUANCE, WARN (never block) when no invoice-tagged document is on file
// for the source vendor invoice — the client is entitled to see the vendor cost. This module is the
// SINGLE authority for the warn condition: the detail page pre-computes it (to show the warning + ack
// affordance before the click) and sendClientInvoiceAction RE-VERIFIES it server-side (no-trust-client).

/**
 * The source vendor invoice for a client invoice, via the draft link
 * (invoice_drafts.published_client_invoice_id → invoice_drafts.vendor_invoice_id). Agent-drafted
 * invoices trace to exactly one; a MANUALLY-created client invoice has no draft → null (gate skips).
 */
export async function getSourceVendorInvoiceId(tenantId: string, clientInvoiceId: string): Promise<string | null> {
  const rows = await db
    .select({ vendorInvoiceId: invoiceDrafts.vendorInvoiceId })
    .from(invoiceDrafts)
    .where(
      and(
        eq(invoiceDrafts.tenantId, tenantId),
        eq(invoiceDrafts.publishedClientInvoiceId, clientInvoiceId),
      ),
    )
    .limit(1);
  return rows[0]?.vendorInvoiceId ?? null;
}

/**
 * Should issuance warn that the vendor invoice document is missing? TRUE only when ALL hold:
 *  (a) the job's EFFECTIVE billing model is cost_plus (rate_sheet/flat never warn);
 *  (b) the client's require_vendor_invoice_for_cost_plus toggle is ON;
 *  (c) a SOURCE vendor invoice exists (manual client invoices have none → skip);
 *  (d) that vendor invoice has NO invoice-tagged document on file.
 * Any condition false → false (no warning, issue as today). NEVER blocks — the caller turns this into
 * an advisory the operator can acknowledge and proceed past.
 */
export async function shouldWarnMissingVendorDoc(
  tenantId: string,
  clientInvoice: { id: string; jobId: string; clientId: string },
): Promise<boolean> {
  const ctx = await loadJobBillingContext({ tenantId, jobId: clientInvoice.jobId });
  if (!ctx || ctx.billingModel !== "cost_plus") return false; // (a)

  const client = await getClient(tenantId, clientInvoice.clientId);
  if (!client?.requireVendorInvoiceForCostPlus) return false; // (b)

  const sourceVendorInvoiceId = await getSourceVendorInvoiceId(tenantId, clientInvoice.id);
  if (!sourceVendorInvoiceId) return false; // (c)

  return !(await hasInvoiceDocument(tenantId, sourceVendorInvoiceId)); // (d)
}
