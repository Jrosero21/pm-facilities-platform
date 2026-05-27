import "server-only";

import Big from "big.js";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  changeOrderLineItems,
  changeOrders,
  clientInvoiceLineItems,
  clientInvoices,
  proposalLineItems,
  proposals,
  vendorInvoiceLineItems,
  vendorInvoices,
} from "@/server/schema";

// ── Phase 8 batch 8c.2 — TOTALS INFRASTRUCTURE (R-7.2 single-writer for money) ───────
// The recalculate*Totals writers are the SOLE computers of each line's extended_amount
// [+ markup_amount, AR] and of the header subtotal/markup_total/tax_total/total. Line CRUD
// (8c.5+) stores only the inputs (quantity, unit_price, markup_percent, tax_amount); the
// math lives HERE. round-each-line-then-sum, round-half-up (OQ-1; 8c-D4 cost-basis+uplift).
//
// EXPLICIT-MODE ROUNDING RULE (recorded for 02-decisions): EVERY Big.round() in this file
// passes Big.roundHalfUp explicitly. NEVER rely on the mutable global Big.RM — another module
// could change it, silently flipping money rounding to banker's (half-even). Do not "DRY"
// the mode argument away.
//
// Each writer runs INSIDE the caller's db.transaction (it takes `tx`, opens none of its own);
// callers (8c.5+) MUST wrap in db.transaction() and SHOULD hold the parent row FOR UPDATE for
// the edit+recalc (serializing per-record recalcs). recalc itself is lock-free and converges
// (the line rows are the source of truth).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const HALF_UP = Big.roundHalfUp;

/** Round a money value to 2 dp, half-up. The only rounding precision in Phase 8 (money). */
export function roundHalfUp(value: Big | string): string {
  return new Big(value).round(2, HALF_UP).toFixed(2);
}

/** extended = round(quantity × unit_price, 2). */
export function computeLineExtended(quantity: string, unitPrice: string): string {
  return roundHalfUp(new Big(quantity).times(unitPrice));
}

/**
 * markup = round((extended × pct) / 100, 2).
 *
 * ORDER MATTERS — multiply BEFORE dividing. (extended × pct) is an EXACT product (no precision
 * loss); doing the /100 last means the only division happens at the end, where round-to-2
 * absorbs any expansion. Do NOT "simplify" to `extended × (pct / 100)`: pct/100 can be a
 * non-terminating expansion (e.g. a 1/3-style percent) that loses precision before the
 * multiply, drifting the result. null pct ⇒ "0.00".
 */
export function computeMarkup(extendedAmount: string, markupPercent: string | null): string {
  if (markupPercent === null) return "0.00";
  return roundHalfUp(new Big(extendedAmount).times(markupPercent).div(100));
}

/**
 * Sum already-2dp money strings. Round-each-line-THEN-sum (OQ-1): the inputs are pre-rounded,
 * so this sum is exact at 2dp; the final roundHalfUp is a no-op safety step that keeps every
 * round explicit-mode (never relies on Big.RM).
 */
function sumStrings(values: string[]): string {
  return roundHalfUp(values.reduce((acc, v) => acc.plus(v), new Big(0)));
}

// ── AR line math (proposal / change_order / client_invoice) — cost basis + markup uplift ──
type ArLineInput = {
  id: string;
  quantity: string;
  unitPrice: string;
  markupPercent: string | null;
  taxAmount: string;
};
function computeArLines(lines: ArLineInput[]): {
  perLine: { id: string; extendedAmount: string; markupAmount: string }[];
  subtotal: string;
  markupTotal: string;
  taxTotal: string;
  total: string;
} {
  const perLine = lines.map((ln) => {
    const extendedAmount = computeLineExtended(ln.quantity, ln.unitPrice);
    const markupAmount = computeMarkup(extendedAmount, ln.markupPercent);
    return { id: ln.id, extendedAmount, markupAmount };
  });
  const subtotal = sumStrings(perLine.map((p) => p.extendedAmount));
  const markupTotal = sumStrings(perLine.map((p) => p.markupAmount));
  const taxTotal = sumStrings(lines.map((l) => l.taxAmount));
  const total = sumStrings([subtotal, markupTotal, taxTotal]);
  return { perLine, subtotal, markupTotal, taxTotal, total };
}

// ── AP line math (vendor_invoice) — NO markup ─────────────────────────────────────────────
type ApLineInput = { id: string; quantity: string; unitPrice: string; taxAmount: string };
function computeApLines(lines: ApLineInput[]): {
  perLine: { id: string; extendedAmount: string }[];
  subtotal: string;
  taxTotal: string;
  total: string;
} {
  const perLine = lines.map((ln) => ({
    id: ln.id,
    extendedAmount: computeLineExtended(ln.quantity, ln.unitPrice),
  }));
  const subtotal = sumStrings(perLine.map((p) => p.extendedAmount));
  const taxTotal = sumStrings(lines.map((l) => l.taxAmount));
  const total = sumStrings([subtotal, taxTotal]);
  return { perLine, subtotal, taxTotal, total };
}

/** Recompute proposal line extended/markup + header totals. Caller owns the txn. */
export async function recalculateProposalTotals(tx: Tx, tenantId: string, proposalId: string): Promise<void> {
  const lines = await tx
    .select({
      id: proposalLineItems.id,
      quantity: proposalLineItems.quantity,
      unitPrice: proposalLineItems.unitPrice,
      markupPercent: proposalLineItems.markupPercent,
      taxAmount: proposalLineItems.taxAmount,
    })
    .from(proposalLineItems)
    .where(and(eq(proposalLineItems.tenantId, tenantId), eq(proposalLineItems.proposalId, proposalId)));
  const c = computeArLines(lines);
  for (const p of c.perLine) {
    await tx
      .update(proposalLineItems)
      .set({ extendedAmount: p.extendedAmount, markupAmount: p.markupAmount })
      .where(and(eq(proposalLineItems.tenantId, tenantId), eq(proposalLineItems.id, p.id)));
  }
  const res = await tx
    .update(proposals)
    .set({ subtotal: c.subtotal, markupTotal: c.markupTotal, taxTotal: c.taxTotal, total: c.total })
    .where(and(eq(proposals.tenantId, tenantId), eq(proposals.id, proposalId)));
  if (res[0].affectedRows === 0) throw new Error("PROPOSAL_NOT_FOUND");
}

/** Recompute change-order line extended/markup + header totals. Caller owns the txn. */
export async function recalculateChangeOrderTotals(tx: Tx, tenantId: string, changeOrderId: string): Promise<void> {
  const lines = await tx
    .select({
      id: changeOrderLineItems.id,
      quantity: changeOrderLineItems.quantity,
      unitPrice: changeOrderLineItems.unitPrice,
      markupPercent: changeOrderLineItems.markupPercent,
      taxAmount: changeOrderLineItems.taxAmount,
    })
    .from(changeOrderLineItems)
    .where(and(eq(changeOrderLineItems.tenantId, tenantId), eq(changeOrderLineItems.changeOrderId, changeOrderId)));
  const c = computeArLines(lines);
  for (const p of c.perLine) {
    await tx
      .update(changeOrderLineItems)
      .set({ extendedAmount: p.extendedAmount, markupAmount: p.markupAmount })
      .where(and(eq(changeOrderLineItems.tenantId, tenantId), eq(changeOrderLineItems.id, p.id)));
  }
  const res = await tx
    .update(changeOrders)
    .set({ subtotal: c.subtotal, markupTotal: c.markupTotal, taxTotal: c.taxTotal, total: c.total })
    .where(and(eq(changeOrders.tenantId, tenantId), eq(changeOrders.id, changeOrderId)));
  if (res[0].affectedRows === 0) throw new Error("CHANGE_ORDER_NOT_FOUND");
}

/** Recompute client-invoice line extended/markup + header totals. Caller owns the txn. */
export async function recalculateClientInvoiceTotals(tx: Tx, tenantId: string, clientInvoiceId: string): Promise<void> {
  const lines = await tx
    .select({
      id: clientInvoiceLineItems.id,
      quantity: clientInvoiceLineItems.quantity,
      unitPrice: clientInvoiceLineItems.unitPrice,
      markupPercent: clientInvoiceLineItems.markupPercent,
      taxAmount: clientInvoiceLineItems.taxAmount,
    })
    .from(clientInvoiceLineItems)
    .where(and(eq(clientInvoiceLineItems.tenantId, tenantId), eq(clientInvoiceLineItems.clientInvoiceId, clientInvoiceId)));
  const c = computeArLines(lines);
  for (const p of c.perLine) {
    await tx
      .update(clientInvoiceLineItems)
      .set({ extendedAmount: p.extendedAmount, markupAmount: p.markupAmount })
      .where(and(eq(clientInvoiceLineItems.tenantId, tenantId), eq(clientInvoiceLineItems.id, p.id)));
  }
  const res = await tx
    .update(clientInvoices)
    .set({ subtotal: c.subtotal, markupTotal: c.markupTotal, taxTotal: c.taxTotal, total: c.total })
    .where(and(eq(clientInvoices.tenantId, tenantId), eq(clientInvoices.id, clientInvoiceId)));
  if (res[0].affectedRows === 0) throw new Error("CLIENT_INVOICE_NOT_FOUND");
}

/**
 * Recompute vendor-invoice (AP) line extended + header totals (NO markup). Caller owns the txn.
 *
 * 8c.2 ships the TOTALS body only. The exceeds_nte / nte_baseline_amount arm is ADDED in 8c.7
 * (after totals, same txn): it resolves the governing NTE, snapshots nte_baseline_amount, sets
 * exceeds_nte, and emits nte.exceeded. This writer does NOT touch those columns in 8c.2.
 */
export async function recalculateVendorInvoiceTotals(tx: Tx, tenantId: string, vendorInvoiceId: string): Promise<void> {
  const lines = await tx
    .select({
      id: vendorInvoiceLineItems.id,
      quantity: vendorInvoiceLineItems.quantity,
      unitPrice: vendorInvoiceLineItems.unitPrice,
      taxAmount: vendorInvoiceLineItems.taxAmount,
    })
    .from(vendorInvoiceLineItems)
    .where(and(eq(vendorInvoiceLineItems.tenantId, tenantId), eq(vendorInvoiceLineItems.vendorInvoiceId, vendorInvoiceId)));
  const c = computeApLines(lines);
  for (const p of c.perLine) {
    await tx
      .update(vendorInvoiceLineItems)
      .set({ extendedAmount: p.extendedAmount })
      .where(and(eq(vendorInvoiceLineItems.tenantId, tenantId), eq(vendorInvoiceLineItems.id, p.id)));
  }
  const res = await tx
    .update(vendorInvoices)
    .set({ subtotal: c.subtotal, taxTotal: c.taxTotal, total: c.total })
    .where(and(eq(vendorInvoices.tenantId, tenantId), eq(vendorInvoices.id, vendorInvoiceId)));
  if (res[0].affectedRows === 0) throw new Error("VENDOR_INVOICE_NOT_FOUND");
}
