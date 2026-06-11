import "server-only";

import { and, asc, eq } from "drizzle-orm";
import Big from "big.js";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { changeOrderApprovals, changeOrderLineItems, changeOrders, jobs } from "@/server/schema";
import { recalculateChangeOrderTotals, roundHalfUp } from "@/server/billing/totals";
import { emitJobBillingEvent } from "@/server/billing/events";
import { assertCommonLineFields, isDecimalStr } from "@/server/billing/money";
import { resolveLaborLineDefault, type RateType } from "@/server/billing/client-rates";
import {
  ChangeOrderNotApprovable,
  ChangeOrderNotEditable,
  ChangeOrderNotWithdrawable,
} from "@/server/billing/errors";

// ── Phase 8 batch 8c.6 — CHANGE-ORDER DATA LAYER (#12/#13) ────────────────────────────
// A change order is a FORWARD DELTA after work is underway — it does NOT revise a proposal
// (use createProposalRevision for that). The optional proposalId link is TRACEABILITY ("this
// CO adds to the work scoped by proposal X"), not a re-quote.
//
// TWO structural guarantees:
//  1. D-7.3 (carried from 8c.5): this module touches NO published-scope substrate — accepting/
//     approving a CO never writes the canonical scope-steps table or the job's approved-scope
//     column; the human-gated scope publish writer remains their sole writer.
//  2. 8c.4 sole-writer: this module NEVER writes the job's NTE column. It only READS
//     jobs.notToExceedAmount (in getEffectiveNte). The effective NTE is computed-on-read
//     (OQ-14): base snapshot + Σ approved CO totals — the base column is left untouched.
// Both are enforced structurally (no such imports/writes here; forbidden symbol names appear
// NOWHERE in this file) and asserted at verify time (Group 13, a whole-file string-match incl.
// the jobs-write pattern).
//
// Lifecycle: draft → submitted → approved (terminal commitment) | declined (terminal). draft|
// submitted → withdrawn. NO `sent`, NO `superseded` (COs stack as deltas, not revision chains).
// approve maps to {status:"approved", decision:"accepted"} — the change_order_approvals.decision
// enum is the shared {accepted,declined} from 8b (11f / CF-8c.6.1).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ChangeOrderLineCategory = NonNullable<typeof changeOrderLineItems.$inferInsert["category"]>;
export type ChangeOrderRow = typeof changeOrders.$inferSelect;

const WITHDRAWABLE_STATUSES = ["draft", "submitted"] as const;
function isWithdrawable(status: string): boolean {
  return (WITHDRAWABLE_STATUSES as readonly string[]).includes(status);
}

// Bounded preview for the varchar(500) event summary (emitJobBillingEvent caps summary length).
// The full reason stays in change_orders.reason; this is a UI/timeline headline only.
function reasonPreview(reason: string | null): string {
  if (reason && reason.length > 80) return `${reason.slice(0, 80).trim()}…`;
  return reason ?? "(no reason)";
}

// ── line-item validation ──────────────────────────────────────────────────────────────
// Shared 4-field shape (quantity/unit_price/tax_amount/tax_rate) lives in billing/money.ts
// (extracted at 8c.7, Option A); markup_percent is AR-only, so its check stays inline here.
function assertValidLineFields(f: Partial<ChangeOrderLineItemInput>): void {
  assertCommonLineFields(f);
  if (f.markupPercent != null && !isDecimalStr(f.markupPercent, 3, 3)) throw new Error("INVALID_LINE_MARKUP_PERCENT");
}

async function lockChangeOrder(tx: Tx, tenantId: string, id: string) {
  const rows = await tx
    .select({
      id: changeOrders.id, jobId: changeOrders.jobId, status: changeOrders.status,
      total: changeOrders.total, currency: changeOrders.currency,
      reason: changeOrders.reason, proposalId: changeOrders.proposalId,
    })
    .from(changeOrders)
    .where(and(eq(changeOrders.tenantId, tenantId), eq(changeOrders.id, id)))
    .for("update");
  if (!rows[0]) throw new Error("CHANGE_ORDER_NOT_FOUND");
  return rows[0];
}

export type CreateChangeOrderInput = {
  tenantId: string;
  jobId: string;
  proposalId?: string | null;
  reason?: string | null;
  scopeDeltaSnapshot?: string | null;
  currency?: string;
  createdByUserId: string | null;
};

/** Create a draft change order. No event (draft creation not audited). Trusts jobId ∈ tenant. */
export async function createChangeOrder(input: CreateChangeOrderInput): Promise<{ id: string }> {
  const id = uuidv7();
  await db.insert(changeOrders).values({
    id,
    tenantId: input.tenantId,
    jobId: input.jobId,
    proposalId: input.proposalId ?? null,
    reason: input.reason ?? null,
    scopeDeltaSnapshot: input.scopeDeltaSnapshot ?? null,
    currency: input.currency ?? "USD",
    createdByUserId: input.createdByUserId,
  });
  return { id };
}

export async function updateChangeOrderDraft(input: {
  tenantId: string; id: string; reason?: string | null; scopeDeltaSnapshot?: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const co = await lockChangeOrder(tx, input.tenantId, input.id);
    if (co.status !== "draft") throw new ChangeOrderNotEditable(input.id, co.status);
    await tx
      .update(changeOrders)
      .set({
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        ...(input.scopeDeltaSnapshot !== undefined ? { scopeDeltaSnapshot: input.scopeDeltaSnapshot } : {}),
      })
      .where(and(eq(changeOrders.tenantId, input.tenantId), eq(changeOrders.id, input.id)));
  });
}

export type ChangeOrderLineItemInput = {
  category: ChangeOrderLineCategory;
  description: string;
  quantity: string;
  unit?: string | null;
  // OPTIONAL since Phase (ii): when omitted on a rate_sheet labor line with a tradeId, the agreed
  // rate is resolved as the default unit_price. An explicit value always wins (operator override).
  unitPrice?: string;
  markupPercent?: string | null;
  taxRate?: string | null;
  taxAmount?: string;
  // Phase (ii) billing-from-rates — lookup key + provenance. tradeId drives the labor-rate lookup;
  // rateType overrides the category default (labor→hourly, trip→trip_charge) when set.
  tradeId?: string | null;
  rateType?: RateType;
};

/** Add a line to a DRAFT change order, then recalc.
 *  Phase (ii): a rate_sheet labor/trip line with a tradeId and NO explicit unit_price is priced from
 *  the agreed rate (markup forced null, trade_id/rate_type stored as provenance). Explicit unit_price
 *  always wins; cost_plus/flat are unchanged. */
export async function addChangeOrderLineItem(
  input: { tenantId: string; changeOrderId: string } & ChangeOrderLineItemInput,
): Promise<{ id: string }> {
  const id = uuidv7();
  await db.transaction(async (tx) => {
    const co = await lockChangeOrder(tx, input.tenantId, input.changeOrderId);
    if (co.status !== "draft") throw new ChangeOrderNotEditable(input.changeOrderId, co.status);

    // billing-from-rates: resolve a DEFAULT labor unit_price when the operator passed none.
    const rate = await resolveLaborLineDefault({
      tenantId: input.tenantId, jobId: co.jobId, category: input.category,
      explicitUnitPrice: input.unitPrice, tradeId: input.tradeId, rateType: input.rateType,
    });
    const unitPrice = rate?.unitPrice ?? input.unitPrice;
    if (unitPrice === undefined) throw new Error("INVALID_LINE_UNIT_PRICE"); // no price + no rate resolved
    const markupPercent = rate ? null : input.markupPercent ?? null; // agreed rate → no markup
    assertValidLineFields({ ...input, unitPrice, markupPercent });

    const existing = await tx
      .select({ ln: changeOrderLineItems.lineNumber })
      .from(changeOrderLineItems)
      .where(and(eq(changeOrderLineItems.tenantId, input.tenantId), eq(changeOrderLineItems.changeOrderId, input.changeOrderId)));
    const nextLine = existing.reduce((m, r) => Math.max(m, r.ln), 0) + 1;
    await tx.insert(changeOrderLineItems).values({
      id,
      tenantId: input.tenantId,
      changeOrderId: input.changeOrderId,
      lineNumber: nextLine,
      category: input.category,
      description: input.description,
      quantity: input.quantity,
      unit: input.unit ?? null,
      unitPrice,
      markupPercent,
      taxRate: input.taxRate ?? null,
      taxAmount: input.taxAmount ?? "0",
      tradeId: rate?.tradeId ?? null, // provenance: stored only when rate-resolved
      rateType: rate?.rateType ?? null,
    });
    await recalculateChangeOrderTotals(tx, input.tenantId, input.changeOrderId);
  });
  return { id };
}

export async function updateChangeOrderLineItem(
  input: { tenantId: string; id: string } & Partial<ChangeOrderLineItemInput>,
): Promise<void> {
  assertValidLineFields(input);
  await db.transaction(async (tx) => {
    const line = (
      await tx
        .select({ changeOrderId: changeOrderLineItems.changeOrderId })
        .from(changeOrderLineItems)
        .where(and(eq(changeOrderLineItems.tenantId, input.tenantId), eq(changeOrderLineItems.id, input.id)))
        .limit(1)
    )[0];
    if (!line) throw new Error("CHANGE_ORDER_LINE_ITEM_NOT_FOUND");
    const co = await lockChangeOrder(tx, input.tenantId, line.changeOrderId);
    if (co.status !== "draft") throw new ChangeOrderNotEditable(line.changeOrderId, co.status);
    await tx
      .update(changeOrderLineItems)
      .set({
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice } : {}),
        ...(input.markupPercent !== undefined ? { markupPercent: input.markupPercent } : {}),
        ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
        ...(input.taxAmount !== undefined ? { taxAmount: input.taxAmount } : {}),
      })
      .where(and(eq(changeOrderLineItems.tenantId, input.tenantId), eq(changeOrderLineItems.id, input.id)));
    await recalculateChangeOrderTotals(tx, input.tenantId, line.changeOrderId);
  });
}

export async function removeChangeOrderLineItem(input: { tenantId: string; id: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const line = (
      await tx
        .select({ changeOrderId: changeOrderLineItems.changeOrderId })
        .from(changeOrderLineItems)
        .where(and(eq(changeOrderLineItems.tenantId, input.tenantId), eq(changeOrderLineItems.id, input.id)))
        .limit(1)
    )[0];
    if (!line) throw new Error("CHANGE_ORDER_LINE_ITEM_NOT_FOUND");
    const co = await lockChangeOrder(tx, input.tenantId, line.changeOrderId);
    if (co.status !== "draft") throw new ChangeOrderNotEditable(line.changeOrderId, co.status);
    await tx
      .delete(changeOrderLineItems)
      .where(and(eq(changeOrderLineItems.tenantId, input.tenantId), eq(changeOrderLineItems.id, input.id)));
    await recalculateChangeOrderTotals(tx, input.tenantId, line.changeOrderId);
  });
}

/** draft → submitted. Emits change_order.submitted (proposalId ref + metadata when linked). */
export async function submitChangeOrder(input: { tenantId: string; id: string; actorUserId: string | null }): Promise<void> {
  await db.transaction(async (tx) => {
    const co = await lockChangeOrder(tx, input.tenantId, input.id);
    if (co.status !== "draft") throw new ChangeOrderNotEditable(input.id, co.status);
    await tx
      .update(changeOrders)
      .set({ status: "submitted" })
      .where(and(eq(changeOrders.tenantId, input.tenantId), eq(changeOrders.id, input.id)));
    await emitJobBillingEvent(tx, {
      tenantId: input.tenantId, jobId: co.jobId, eventType: "change_order.submitted",
      actorUserId: input.actorUserId,
      summary: `Change order submitted: ${reasonPreview(co.reason)} — ${co.total}`,
      amount: co.total, currency: co.currency, changeOrderId: input.id, proposalId: co.proposalId,
    });
  });
}

/** submitted → approved. Writes change_order_approvals (decision="accepted", 11f) + change_order.approved.
 *  Does NOT touch the published-scope substrate (D-7.3) or the job's NTE column (8c.4 sole-writer). */
export async function approveChangeOrder(input: {
  tenantId: string; id: string; approverUserId?: string | null; approverName?: string | null; decidedAt: Date; notes?: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const co = await lockChangeOrder(tx, input.tenantId, input.id);
    if (co.status !== "submitted") throw new ChangeOrderNotApprovable(input.id, co.status);
    await tx
      .update(changeOrders)
      .set({ status: "approved" })
      .where(and(eq(changeOrders.tenantId, input.tenantId), eq(changeOrders.id, input.id)));
    await tx.insert(changeOrderApprovals).values({
      tenantId: input.tenantId, changeOrderId: input.id, decision: "accepted", // status "approved" / enum "accepted" (11f)
      approverUserId: input.approverUserId ?? null, approverName: input.approverName ?? null,
      decidedAt: input.decidedAt, notes: input.notes ?? null,
    });
    await emitJobBillingEvent(tx, {
      tenantId: input.tenantId, jobId: co.jobId, eventType: "change_order.approved",
      actorUserId: input.approverUserId ?? null,
      summary: `Change order approved: ${reasonPreview(co.reason)} — ${co.total}`,
      amount: co.total, currency: co.currency, changeOrderId: input.id, proposalId: co.proposalId,
      metadata: input.approverName ? { approverName: input.approverName } : undefined,
    });
  });
}

/** submitted → declined. Writes change_order_approvals (decision="declined") + change_order.declined. */
export async function declineChangeOrder(input: {
  tenantId: string; id: string; approverUserId?: string | null; approverName?: string | null; decidedAt: Date; notes?: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const co = await lockChangeOrder(tx, input.tenantId, input.id);
    if (co.status !== "submitted") throw new ChangeOrderNotApprovable(input.id, co.status);
    await tx
      .update(changeOrders)
      .set({ status: "declined" })
      .where(and(eq(changeOrders.tenantId, input.tenantId), eq(changeOrders.id, input.id)));
    await tx.insert(changeOrderApprovals).values({
      tenantId: input.tenantId, changeOrderId: input.id, decision: "declined",
      approverUserId: input.approverUserId ?? null, approverName: input.approverName ?? null,
      decidedAt: input.decidedAt, notes: input.notes ?? null,
    });
    await emitJobBillingEvent(tx, {
      tenantId: input.tenantId, jobId: co.jobId, eventType: "change_order.declined",
      actorUserId: input.approverUserId ?? null,
      summary: `Change order declined: ${reasonPreview(co.reason)}`,
      amount: co.total, currency: co.currency, changeOrderId: input.id, proposalId: co.proposalId,
      metadata: input.approverName ? { approverName: input.approverName } : undefined,
    });
  });
}

/** draft|submitted → withdrawn (approved is a commitment; declined/withdrawn are terminal). */
export async function withdrawChangeOrder(input: { tenantId: string; id: string; actorUserId: string | null }): Promise<void> {
  await db.transaction(async (tx) => {
    const co = await lockChangeOrder(tx, input.tenantId, input.id);
    if (!isWithdrawable(co.status)) throw new ChangeOrderNotWithdrawable(input.id, co.status);
    await tx
      .update(changeOrders)
      .set({ status: "withdrawn" })
      .where(and(eq(changeOrders.tenantId, input.tenantId), eq(changeOrders.id, input.id)));
    await emitJobBillingEvent(tx, {
      tenantId: input.tenantId, jobId: co.jobId, eventType: "change_order.withdrawn",
      actorUserId: input.actorUserId,
      summary: `Change order withdrawn: ${reasonPreview(co.reason)}`,
      amount: co.total, currency: co.currency, changeOrderId: input.id, proposalId: co.proposalId,
    });
  });
}

/**
 * Effective NTE = base (jobs.notToExceedAmount, the 8c.4 creation snapshot) + Σ approved CO totals
 * (OQ-14, computed-on-read). NEVER writes the job's NTE column. Pure read.
 * Returns null when the base is null — a job with no NTE has no ceiling (11a); downstream callers
 * (8c.7 exceedance) skip the job-level aggregate check on null rather than treat it as 0.
 */
export async function getEffectiveNte(tenantId: string, jobId: string): Promise<string | null> {
  const base =
    (await db.select({ nte: jobs.notToExceedAmount }).from(jobs).where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId))).limit(1))[0]?.nte ?? null;
  if (base === null) return null;
  const approved = await db
    .select({ total: changeOrders.total })
    .from(changeOrders)
    .where(and(eq(changeOrders.tenantId, tenantId), eq(changeOrders.jobId, jobId), eq(changeOrders.status, "approved")));
  const sum = approved.reduce((acc, r) => acc.plus(r.total), new Big(base));
  return roundHalfUp(sum);
}

export async function getChangeOrder(tenantId: string, id: string): Promise<ChangeOrderRow | null> {
  const rows = await db
    .select()
    .from(changeOrders)
    .where(and(eq(changeOrders.tenantId, tenantId), eq(changeOrders.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listChangeOrdersForJob(tenantId: string, jobId: string): Promise<ChangeOrderRow[]> {
  return db
    .select()
    .from(changeOrders)
    .where(and(eq(changeOrders.tenantId, tenantId), eq(changeOrders.jobId, jobId)))
    .orderBy(asc(changeOrders.createdAt), asc(changeOrders.id));
}

export type ChangeOrderLineItemRow = typeof changeOrderLineItems.$inferSelect;

/** Line items for a change order, ordered by line number. Tenant-scoped. Pure read (8c.11c — the
 *  detail screen renders inputs + the writer-owned extended_amount/markup_amount). */
export async function listChangeOrderLineItems(tenantId: string, changeOrderId: string): Promise<ChangeOrderLineItemRow[]> {
  return db
    .select()
    .from(changeOrderLineItems)
    .where(and(eq(changeOrderLineItems.tenantId, tenantId), eq(changeOrderLineItems.changeOrderId, changeOrderId)))
    .orderBy(asc(changeOrderLineItems.lineNumber));
}
