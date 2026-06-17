import "server-only";

import { getJob } from "@/server/jobs";
import { listAssignmentsForJob } from "@/server/dispatch";
import { listVendorInvoicesForJob, listVendorInvoiceLineItems } from "@/server/billing/vendor-invoices";
import { loadJobBillingContext, defaultRateTypeForCategory, type RateType } from "@/server/billing/client-rates";
import { isTimeUnit } from "@/server/billing/labor-units";

// ── CF-27.16 Piece 3 — job-first client-invoice pre-fill (DETERMINISTIC, no LLM) ───────────
// "Bill this job": roll up ALL the job's work-to-date into pre-fill lines the operator reviews/trims.
// DETERMINISTIC — numbers come from the data layer (vendor lines / agreed rates), never an LLM. The
// per-line treatment MIRRORS runInvoiceCreator's billing-model fork, but feeds addClientInvoiceLineItem
// (the agreed-rate + provenance authority), so we do NOT reimplement rate resolution — we pass tradeId/
// rateType (omitting unitPrice) for agreed-rate labor and let addClientInvoiceLineItem resolve it.
//
// never-block: includes dispatches with NO vendor invoice yet (Job #4 — work done, cost not in) as an
// agreed-rate labor line; includes any vendor invoice (approval is an AP state, not a billing gate).
//
// Lives in analytics/ (reuses jobs/dispatch) — billing modules must never import jobs.ts (acyclic, 9e).

// The shape addClientInvoiceLineItem consumes (minus the invoice id). unitPrice OMITTED ⇒ the agreed
// rate is resolved server-side (rate_sheet labor); markupPercent undefined ⇒ snapshot-default markup,
// null ⇒ explicit no-markup.
export type JobBillPrefillLine = {
  category: string;
  description: string;
  quantity: string;
  unit?: string | null;
  unitPrice?: string;
  markupPercent?: string | null;
  tradeId?: string | null;
  rateType?: RateType;
};

/**
 * Build the deterministic pre-fill lines for billing a whole job. Empty array when the job is missing.
 * Treatment per line mirrors runInvoiceCreator:
 *  - rate_sheet itemized time-unit labor/trip → agreed-rate line (tradeId/rateType, unitPrice resolved)
 *  - rate_sheet AMBIGUOUS labor (no time unit) → agreed-rate line, quantity "1" (operator enters hours) —
 *    NEVER vendor cost (contractual: labor bills at the agreed rate, not what we paid)
 *  - rate_sheet materials/other → JUDGMENT: $0 price, CLEAN client-visible description (NO vendor cost —
 *    the description ships on the client invoice; cost is the aggregator's margin basis, never leaked)
 *  - cost_plus → vendor cost + snapshot-default markup (vendor cost IS the billed basis; cost is
 *    contractual for cost_plus — the ONLY model that bills from / exposes the vendor cost)
 *  - flat → $0, clean description (operator enters the agreed flat amount; never vendor cost, no leak)
 *  - lumped vendor invoice (no lines): cost_plus → one line at the vendor total; rate_sheet & flat → $0,
 *    clean description (judgment, no bill-at-cost, no cost leak)
 *  - dispatch with NO vendor invoice → one agreed-rate labor line, quantity "1" (operator enters hours)
 */
export async function buildJobBillPrefill(tenantId: string, jobId: string): Promise<JobBillPrefillLine[]> {
  const billingCtx = await loadJobBillingContext({ tenantId, jobId });
  if (!billingCtx) return [];
  const isRateSheet = billingCtx.billingModel === "rate_sheet";
  // flat = a flat dollar amount agreed with the CLIENT — neither cost+markup nor vendor cost. Pre-fill
  // at $0 (operator enters the agreed flat amount), clean client-visible description. ONLY cost_plus
  // uses the vendor cost as the billed basis.
  const isFlat = billingCtx.billingModel === "flat";

  const job = await getJob(tenantId, jobId);
  const primaryTradeId = job?.primaryTradeId ?? null;

  const vendorInvoices = await listVendorInvoicesForJob(tenantId, jobId);
  const dispatches = await listAssignmentsForJob(tenantId, jobId);

  const lines: JobBillPrefillLine[] = [];
  const invoicedAssignmentIds = new Set(
    vendorInvoices.map((vi) => vi.assignmentId).filter((x): x is string => x != null),
  );
  // The agreed rate must resolve for the TRADE THAT DID THE WORK — the dispatch's matched trade —
  // NOT the job's primary trade (on a multi-trade job they differ: HVAC work billed at the plumbing
  // rate is wrong). Each dispatch carries its matched trade; map it by assignment id so a vendor
  // invoice (linked via assignment_id) and the no-invoice line both key off the right trade.
  const tradeByAssignment = new Map(dispatches.map((d) => [d.id, d.matchedTradeId]));

  // 1. Lines from each vendor invoice's lines (the cost basis / agreed-rate treatment).
  for (const vi of vendorInvoices) {
    const vlines = await listVendorInvoiceLineItems(tenantId, vi.id);
    if (vlines.length === 0) {
      // Lumped vendor invoice (no itemized lines). cost_plus → ONE line at the vendor total (cost
      // basis + snapshot markup; cost is contractual for cost_plus). rate_sheet AND flat → JUDGMENT:
      // $0 and a CLEAN, client-safe description — NEVER bill the vendor cost as the price (rate_sheet
      // bills agreed rates; flat bills the agreed flat amount) AND never leak cost into the
      // client-visible description.
      lines.push(
        isRateSheet || isFlat
          ? {
              category: "other",
              description: `Services per vendor invoice ${vi.invoiceNumber ?? "(no number)"}`,
              quantity: "1",
              unit: null,
              unitPrice: "0.00",
              markupPercent: null,
            }
          : {
              category: "other",
              description: `Services per vendor invoice ${vi.invoiceNumber ?? "(no number)"}`,
              quantity: "1",
              unit: null,
              unitPrice: vi.total,
            },
      );
      continue;
    }
    // The trade that did THIS vendor invoice's work — the linked dispatch's matched trade — drives the
    // agreed-rate lookup; fall back to the job primary only when the invoice has no dispatch.
    const viTradeId = (vi.assignmentId ? tradeByAssignment.get(vi.assignmentId) : null) ?? primaryTradeId;
    for (const vl of vlines) {
      const category = vl.category;
      const rateType = defaultRateTypeForCategory(category);
      if (isRateSheet && rateType && viTradeId) {
        // rate_sheet LABOR/TRIP → AGREED RATE (contractual), NEVER vendor cost. unitPrice omitted ⇒
        // addClientInvoiceLineItem resolves the agreed rate + records provenance + forces markup null.
        //  - itemized (explicit time unit): trust the vendor hours as the quantity.
        //  - ambiguous (no time unit, qty not trustable as hours): quantity "1" — the operator enters
        //    the real hours (CF-27.15 shape: rate known, hours unknown). Same as the no-invoice line.
        // The rate resolves for viTradeId (the dispatch's trade). If no agreed rate resolves for that
        // trade, billJobAction falls the line back to $0 (operator prices) — NEVER to the vendor cost.
        const itemized = isTimeUnit(vl.unit);
        lines.push({
          category,
          description: vl.description,
          quantity: itemized ? vl.quantity : "1",
          unit: itemized ? vl.unit : null,
          tradeId: viTradeId,
          rateType,
        });
      } else if (isRateSheet) {
        // rate_sheet MATERIALS / other (or labor with no resolvable trade) → JUDGMENT: start at $0
        // (forces a conscious price). The description is CLEAN — the work text only, NO vendor cost
        // (the AR-line description is client-visible; the vendor cost is the aggregator's margin basis
        // and must not leak). The operator prices from the vendor invoice + the margin view, off-line.
        lines.push({
          category,
          description: vl.description,
          quantity: vl.quantity,
          unit: vl.unit,
          unitPrice: "0.00",
          markupPercent: null,
        });
      } else if (isFlat) {
        // flat → $0 (operator enters the agreed flat amount), CLEAN description (no vendor cost — the
        // flat price is what the aggregator agreed with the client, not what we paid; no cost leak).
        lines.push({ category, description: vl.description, quantity: vl.quantity, unit: vl.unit, unitPrice: "0.00", markupPercent: null });
      } else {
        // cost_plus → vendor cost + snapshot-default markup (vendor cost IS the billed basis; cost is
        // contractual for cost_plus). The ONLY model that bills from / exposes the vendor cost.
        lines.push({ category, description: vl.description, quantity: vl.quantity, unit: vl.unit, unitPrice: vl.unitPrice });
      }
    }
  }

  // 2. Dispatches with NO vendor invoice yet → one agreed-rate labor line each (never-block; Job #4).
  //    tradeId is the DISPATCH's matched trade (the trade that did the work) — same source as the
  //    description's trade, so the dropdown matches and the correct rate resolves; fall back to the job
  //    primary only if the dispatch somehow has no trade.
  for (const d of dispatches) {
    if (invoicedAssignmentIds.has(d.id)) continue;
    lines.push({
      category: "labor",
      description: `Labor — ${d.vendorName}${d.matchedTradeName ? ` (${d.matchedTradeName})` : ""}`,
      quantity: "1",
      tradeId: d.matchedTradeId ?? primaryTradeId,
      rateType: defaultRateTypeForCategory("labor") ?? undefined,
    });
  }

  return lines;
}
