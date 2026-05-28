import "server-only";

import Big from "big.js";
import { roundHalfUp } from "@/server/billing/totals";
import { sumApprovedClientInvoiceTotals } from "@/server/billing/client-invoices";
import { sumApprovedVendorInvoiceTotals } from "@/server/billing/vendor-invoices";

// ── Phase 8 batch 8c.8 — PER-JOB MARGIN (OQ-16, CF-8c.7.1) ────────────────────────────
// The ONLY place the AR (client-invoice) and AP (vendor-invoice) aggregators meet — neither
// sibling data-layer module imports the other; the cross-side coupling lives HERE.
//   revenue = Σ client-invoice totals WHERE status='sent'      (issued AR; payment_status orthogonal)
//   cost    = Σ vendor-invoice totals WHERE status='approved'  (approved AP cost)
//   margin  = revenue − cost  (round-half-up, explicit-mode)

/** Simple per-job margin (8c billing). Always returns strings; "0.00" everywhere when there is no
 *  billing activity (or cross-tenant — both aggregators are tenant-scoped). Pure read. */
export async function getJobMargin(
  tenantId: string,
  jobId: string,
): Promise<{ revenue: string; cost: string; margin: string }> {
  const [revenue, cost] = await Promise.all([
    sumApprovedClientInvoiceTotals(tenantId, jobId),
    sumApprovedVendorInvoiceTotals(tenantId, jobId),
  ]);
  const margin = roundHalfUp(new Big(revenue).minus(cost));
  return { revenue, cost, margin };
}
