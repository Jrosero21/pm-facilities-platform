import "server-only";

import { and, asc, eq, ne } from "drizzle-orm";
import Big from "big.js";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { jobVendorAssignments, jobs, vendorInvoiceLineItems, vendorInvoices } from "@/server/schema";
import { recalculateVendorInvoiceTotals, roundHalfUp } from "@/server/billing/totals";
import { getEffectiveNte } from "@/server/billing/change-orders";
import { emitJobBillingEvent } from "@/server/billing/events";
import { assertCommonLineFields } from "@/server/billing/money";
import {
  VendorInvoiceNotApprovable,
  VendorInvoiceNotDisputable,
  VendorInvoiceNotEditable,
} from "@/server/billing/errors";

// ── Phase 8 batch 8c.7 — VENDOR-INVOICE DATA LAYER (AP, #6/#18) ────────────────────────
// Accounts-payable: what a vendor sent us. NO markup (AP). Lifecycle: received → approved
// (operator commit point, OQ-24) | disputed; line CRUD allowed in received/under_review.
// payment_status + the `paid` status are owned by the payments writer (8c.9), not here.
//
// TWO NTE ceilings, two INDEPENDENT nte.exceeded events — both emitted at APPROVE only
// (Decision 1: the breach signal fires when the operator commits to paying, not on raw receipt):
//   1. per-invoice  — this invoice's total vs its governing ceiling (the dispatch's agreed
//                     amount when an assignment is linked, else the job's effective NTE).
//   2. job-aggregate — Σ approved AP totals for the job vs the job's effective NTE, emitted on
//                     the FIRST crossing only (not re-emitted once already over).
// The exceeds_nte / nte_baseline_amount COLUMNS are set by recalculateVendorInvoiceTotals (8c.2
// arm); this module RESOLVES the governing ceiling and passes it in, then owns the EVENTS.
//
// THREE structural guarantees (asserted at verify time, whole-file string-match):
//  1. AP never writes the dispatch NTE snapshot — it only READS agreed_nte_amount.
//  2. AP never writes the job NTE column — createJob is its sole writer (8c.4); approve only
//     locks the parent job row (FOR UPDATE) to serialize aggregate first-crossing detection.
//  3. D-7.3 isolation (carried from 8c.5/8c.6): no published-scope substrate touched.
// (The module imports the jobs + dispatch-assignment SCHEMA objects to read/lock — the forbidden
//  patterns are the write-calls against them, which appear NOWHERE in this file.)

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type VendorInvoiceLineCategory = NonNullable<typeof vendorInvoiceLineItems.$inferInsert["category"]>;
type VendorInvoiceSourceType = NonNullable<typeof vendorInvoices.$inferInsert["sourceType"]>;
export type VendorInvoiceRow = typeof vendorInvoices.$inferSelect;

// Edit / approve / dispute are all gated to the pre-commit states. Three named sets (identical
// today) keep each guard's intent explicit and independently evolvable.
const EDITABLE_STATUSES = ["received", "under_review"] as const;
const APPROVABLE_STATUSES = ["received", "under_review"] as const;
const DISPUTABLE_STATUSES = ["received", "under_review"] as const;
function isEditable(s: string): boolean {
  return (EDITABLE_STATUSES as readonly string[]).includes(s);
}
function isApprovable(s: string): boolean {
  return (APPROVABLE_STATUSES as readonly string[]).includes(s);
}
function isDisputable(s: string): boolean {
  return (DISPUTABLE_STATUSES as readonly string[]).includes(s);
}

// Lock the invoice row FOR UPDATE; return status + the fields writers/guards/events need.
async function lockVendorInvoice(tx: Tx, tenantId: string, id: string) {
  const rows = await tx
    .select({
      id: vendorInvoices.id, jobId: vendorInvoices.jobId, assignmentId: vendorInvoices.assignmentId,
      status: vendorInvoices.status, total: vendorInvoices.total, currency: vendorInvoices.currency,
    })
    .from(vendorInvoices)
    .where(and(eq(vendorInvoices.tenantId, tenantId), eq(vendorInvoices.id, id)))
    .for("update");
  if (!rows[0]) throw new Error("VENDOR_INVOICE_NOT_FOUND");
  return rows[0];
}

// Resolve the governing per-invoice NTE ceiling: the dispatch's agreed amount when an assignment
// is linked (level "dispatch"), else the job's effective NTE (level "job"). Reads jobs /
// dispatch assignments only (never the invoice row), so callers resolve BEFORE the header insert
// (Catch 1). Either may be null (no ceiling) — recalc then leaves exceeds_nte false.
async function resolveInvoiceNte(
  tenantId: string,
  jobId: string,
  assignmentId: string | null,
): Promise<{ baseline: string | null; level: "dispatch" | "job" }> {
  if (assignmentId) {
    const a = (
      await db
        .select({ nte: jobVendorAssignments.agreedNteAmount })
        .from(jobVendorAssignments)
        .where(and(eq(jobVendorAssignments.tenantId, tenantId), eq(jobVendorAssignments.id, assignmentId)))
        .limit(1)
    )[0];
    return { baseline: a?.nte ?? null, level: "dispatch" };
  }
  return { baseline: await getEffectiveNte(tenantId, jobId), level: "job" };
}

// Sum already-2dp AP totals (pure; round-half-up no-op safety). Shared by the public reader and
// the aggregate first-crossing detection.
function sumTotals(rows: { total: string }[]): string {
  return roundHalfUp(rows.reduce((acc, r) => acc.plus(r.total), new Big(0)));
}

export type VendorInvoiceLineItemInput = {
  category: VendorInvoiceLineCategory;
  description: string;
  quantity: string;
  unit?: string | null;
  unitPrice: string;
  taxRate?: string | null;
  taxAmount?: string;
}; // NO markupPercent — AP carries no markup (#6).

export type RecordVendorInvoiceInput = {
  tenantId: string;
  jobId: string;
  vendorId: string;
  assignmentId?: string | null;
  sourceType?: VendorInvoiceSourceType;
  sourceExternalId?: string | null;
  invoiceNumber?: string | null;
  sequenceNumber?: number | null;
  isFinal?: boolean;
  currency?: string;
  invoiceDate?: Date | null;
  notes?: string | null;
  createdByUserId: string | null;
  lineItems?: VendorInvoiceLineItemInput[];
};

/** Record an incoming vendor invoice (status `received`) with optional line items, then recalc +
 *  emit vendor_invoice.received. NO nte.exceeded here — the breach event waits for approve
 *  (Decision 1); recalc still sets the exceeds_nte column so the row is truthful immediately. */
export async function recordVendorInvoice(input: RecordVendorInvoiceInput): Promise<{ id: string }> {
  if (input.lineItems) for (const li of input.lineItems) assertCommonLineFields(li);
  const id = uuidv7();
  const currency = input.currency ?? "USD";
  await db.transaction(async (tx) => {
    // Catch 1: resolve the governing NTE BEFORE the header insert (reads jobs / assignments, not
    // the invoice row), then insert header → lines → recalc(governingNte).
    const { baseline } = await resolveInvoiceNte(input.tenantId, input.jobId, input.assignmentId ?? null);
    await tx.insert(vendorInvoices).values({
      id,
      tenantId: input.tenantId,
      jobId: input.jobId,
      vendorId: input.vendorId,
      assignmentId: input.assignmentId ?? null,
      sourceType: input.sourceType ?? "manual",
      sourceExternalId: input.sourceExternalId ?? null,
      invoiceNumber: input.invoiceNumber ?? null,
      sequenceNumber: input.sequenceNumber ?? null,
      isFinal: input.isFinal ?? false,
      currency,
      invoiceDate: input.invoiceDate ?? null,
      notes: input.notes ?? null,
      createdByUserId: input.createdByUserId,
    });
    if (input.lineItems) {
      let lineNumber = 1;
      for (const li of input.lineItems) {
        await tx.insert(vendorInvoiceLineItems).values({
          id: uuidv7(),
          tenantId: input.tenantId,
          vendorInvoiceId: id,
          lineNumber: lineNumber++,
          category: li.category,
          description: li.description,
          quantity: li.quantity,
          unit: li.unit ?? null,
          unitPrice: li.unitPrice,
          taxRate: li.taxRate ?? null,
          taxAmount: li.taxAmount ?? "0",
        });
      }
    }
    await recalculateVendorInvoiceTotals(tx, input.tenantId, id, baseline);
    const row = (
      await tx
        .select({ total: vendorInvoices.total, exceedsNte: vendorInvoices.exceedsNte })
        .from(vendorInvoices)
        .where(and(eq(vendorInvoices.tenantId, input.tenantId), eq(vendorInvoices.id, id)))
        .limit(1)
    )[0]!;
    await emitJobBillingEvent(tx, {
      tenantId: input.tenantId, jobId: input.jobId, eventType: "vendor_invoice.received",
      actorUserId: input.createdByUserId,
      summary: `Vendor invoice received: ${input.invoiceNumber ?? "(no number)"} — ${row.total}`,
      amount: row.total, currency, vendorInvoiceId: id,
      metadata: {
        sourceType: input.sourceType ?? "manual",
        assignmentId: input.assignmentId ?? null,
        exceedsNte: row.exceedsNte,
      },
    });
  });
  return { id };
}

/** Add a line to a received/under_review invoice, then recalc (re-resolving the governing NTE). */
export async function addVendorInvoiceLineItem(
  input: { tenantId: string; vendorInvoiceId: string } & VendorInvoiceLineItemInput,
): Promise<{ id: string }> {
  assertCommonLineFields(input);
  const id = uuidv7();
  await db.transaction(async (tx) => {
    const inv = await lockVendorInvoice(tx, input.tenantId, input.vendorInvoiceId);
    if (!isEditable(inv.status)) throw new VendorInvoiceNotEditable(input.vendorInvoiceId, inv.status);
    const existing = await tx
      .select({ ln: vendorInvoiceLineItems.lineNumber })
      .from(vendorInvoiceLineItems)
      .where(and(eq(vendorInvoiceLineItems.tenantId, input.tenantId), eq(vendorInvoiceLineItems.vendorInvoiceId, input.vendorInvoiceId)));
    const nextLine = existing.reduce((m, r) => Math.max(m, r.ln), 0) + 1;
    await tx.insert(vendorInvoiceLineItems).values({
      id,
      tenantId: input.tenantId,
      vendorInvoiceId: input.vendorInvoiceId,
      lineNumber: nextLine,
      category: input.category,
      description: input.description,
      quantity: input.quantity,
      unit: input.unit ?? null,
      unitPrice: input.unitPrice,
      taxRate: input.taxRate ?? null,
      taxAmount: input.taxAmount ?? "0",
    });
    // Catch 2: re-resolve the governing NTE on EVERY recalc (never cache from record) — keeps
    // exceeds_nte / nte_baseline_amount truthful if an underlying NTE source ever moves.
    const { baseline } = await resolveInvoiceNte(input.tenantId, inv.jobId, inv.assignmentId);
    await recalculateVendorInvoiceTotals(tx, input.tenantId, input.vendorInvoiceId, baseline);
  });
  return { id };
}

/** Update a received/under_review invoice's line item, then recalc (re-resolving the NTE). */
export async function updateVendorInvoiceLineItem(
  input: { tenantId: string; id: string } & Partial<VendorInvoiceLineItemInput>,
): Promise<void> {
  assertCommonLineFields(input);
  await db.transaction(async (tx) => {
    const line = (
      await tx
        .select({ vendorInvoiceId: vendorInvoiceLineItems.vendorInvoiceId })
        .from(vendorInvoiceLineItems)
        .where(and(eq(vendorInvoiceLineItems.tenantId, input.tenantId), eq(vendorInvoiceLineItems.id, input.id)))
        .limit(1)
    )[0];
    if (!line) throw new Error("VENDOR_INVOICE_LINE_ITEM_NOT_FOUND");
    const inv = await lockVendorInvoice(tx, input.tenantId, line.vendorInvoiceId);
    if (!isEditable(inv.status)) throw new VendorInvoiceNotEditable(line.vendorInvoiceId, inv.status);
    await tx
      .update(vendorInvoiceLineItems)
      .set({
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice } : {}),
        ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
        ...(input.taxAmount !== undefined ? { taxAmount: input.taxAmount } : {}),
      })
      .where(and(eq(vendorInvoiceLineItems.tenantId, input.tenantId), eq(vendorInvoiceLineItems.id, input.id)));
    const { baseline } = await resolveInvoiceNte(input.tenantId, inv.jobId, inv.assignmentId);
    await recalculateVendorInvoiceTotals(tx, input.tenantId, line.vendorInvoiceId, baseline);
  });
}

/** Remove a line from a received/under_review invoice, then recalc (re-resolving the NTE). */
export async function removeVendorInvoiceLineItem(input: { tenantId: string; id: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const line = (
      await tx
        .select({ vendorInvoiceId: vendorInvoiceLineItems.vendorInvoiceId })
        .from(vendorInvoiceLineItems)
        .where(and(eq(vendorInvoiceLineItems.tenantId, input.tenantId), eq(vendorInvoiceLineItems.id, input.id)))
        .limit(1)
    )[0];
    if (!line) throw new Error("VENDOR_INVOICE_LINE_ITEM_NOT_FOUND");
    const inv = await lockVendorInvoice(tx, input.tenantId, line.vendorInvoiceId);
    if (!isEditable(inv.status)) throw new VendorInvoiceNotEditable(line.vendorInvoiceId, inv.status);
    await tx
      .delete(vendorInvoiceLineItems)
      .where(and(eq(vendorInvoiceLineItems.tenantId, input.tenantId), eq(vendorInvoiceLineItems.id, input.id)));
    const { baseline } = await resolveInvoiceNte(input.tenantId, inv.jobId, inv.assignmentId);
    await recalculateVendorInvoiceTotals(tx, input.tenantId, line.vendorInvoiceId, baseline);
  });
}

/** received/under_review → approved (operator commit point, OQ-24). Emits vendor_invoice.approved
 *  and — at approve only (Decision 1) — up to TWO nte.exceeded events (per-invoice + job-aggregate
 *  first-crossing). Locks the parent job row FOR UPDATE (Decision 2) so concurrent approvals on the
 *  same job serialize and the aggregate crossing is detected exactly once. */
export async function approveVendorInvoice(input: {
  tenantId: string; id: string; approverUserId: string | null; approvedAt: Date;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const inv = await lockVendorInvoice(tx, input.tenantId, input.id);
    if (!isApprovable(inv.status)) throw new VendorInvoiceNotApprovable(input.id, inv.status);

    // Decision 2: lock the parent job row (parent-before-child order) — serializes job-aggregate
    // first-crossing detection across concurrent same-job approvals.
    // LOCK ORDER: invoice row first, then parent job row. Any future writer (8c.8/9/10) that
    // acquires BOTH must use this same order to prevent deadlock. No current writer takes both.
    await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.tenantId, input.tenantId), eq(jobs.id, inv.jobId)))
      .for("update");

    // Refresh exceeds_nte / nte_baseline_amount against the CURRENT governing ceiling before the
    // per-invoice breach decision (defensive — Catch 2), keeping the flag's computation solely in
    // recalc. Totals are unchanged (no line edit), so this is idempotent on the money columns.
    const { baseline, level } = await resolveInvoiceNte(input.tenantId, inv.jobId, inv.assignmentId);
    await recalculateVendorInvoiceTotals(tx, input.tenantId, input.id, baseline);
    const fresh = (
      await tx
        .select({
          total: vendorInvoices.total,
          currency: vendorInvoices.currency,
          exceedsNte: vendorInvoices.exceedsNte,
          nteBaselineAmount: vendorInvoices.nteBaselineAmount,
        })
        .from(vendorInvoices)
        .where(and(eq(vendorInvoices.tenantId, input.tenantId), eq(vendorInvoices.id, input.id)))
        .limit(1)
    )[0]!;

    await tx
      .update(vendorInvoices)
      .set({ status: "approved", approvedByUserId: input.approverUserId, approvedAt: input.approvedAt })
      .where(and(eq(vendorInvoices.tenantId, input.tenantId), eq(vendorInvoices.id, input.id)));

    await emitJobBillingEvent(tx, {
      tenantId: input.tenantId, jobId: inv.jobId, eventType: "vendor_invoice.approved",
      actorUserId: input.approverUserId,
      summary: `Vendor invoice approved — ${fresh.total}`,
      amount: fresh.total, currency: fresh.currency, vendorInvoiceId: input.id,
    });

    // Event 1 — per-invoice NTE breach (this invoice vs its dispatch/job ceiling).
    // CONVENTION: metadata.assignmentId is ALWAYS present — the assignment id for level="dispatch",
    // explicit `null` for level="job". Readers test `=== null`, never `=== undefined`.
    if (fresh.exceedsNte) {
      await emitJobBillingEvent(tx, {
        tenantId: input.tenantId, jobId: inv.jobId, eventType: "nte.exceeded",
        actorUserId: input.approverUserId,
        summary: `Vendor invoice exceeds ${level} NTE: ${fresh.total} > ${fresh.nteBaselineAmount}`,
        amount: fresh.total, currency: fresh.currency, vendorInvoiceId: input.id,
        metadata: {
          level, baseline: fresh.nteBaselineAmount, invoiceTotal: fresh.total, assignmentId: inv.assignmentId,
        },
      });
    }

    // Event 2 — job-aggregate NTE breach, FIRST CROSSING only. Compare Σ-of-OTHER-approved (prior)
    // and prior+this against the job's effective NTE; emit only on the prior≤NTE → new>NTE step.
    const effectiveNte = await getEffectiveNte(input.tenantId, inv.jobId);
    if (effectiveNte !== null) {
      const priorRows = await tx
        .select({ total: vendorInvoices.total })
        .from(vendorInvoices)
        .where(
          and(
            eq(vendorInvoices.tenantId, input.tenantId),
            eq(vendorInvoices.jobId, inv.jobId),
            eq(vendorInvoices.status, "approved"),
            ne(vendorInvoices.id, input.id),
          ),
        );
      const prior = sumTotals(priorRows);
      const newSum = roundHalfUp(new Big(prior).plus(fresh.total));
      const crossedNow = new Big(prior).lte(effectiveNte) && new Big(newSum).gt(effectiveNte);
      if (crossedNow) {
        await emitJobBillingEvent(tx, {
          tenantId: input.tenantId, jobId: inv.jobId, eventType: "nte.exceeded",
          actorUserId: input.approverUserId,
          summary: `Job approved AP total exceeds NTE: ${newSum} > ${effectiveNte}`,
          amount: newSum, currency: fresh.currency, vendorInvoiceId: input.id,
          metadata: {
            level: "job_aggregate", effectiveNte, priorApprovedTotal: prior, newApprovedTotal: newSum,
          },
        });
      }
    }
  });
}

/** received/under_review → disputed (pre-approval). Emits vendor_invoice.disputed. */
export async function disputeVendorInvoice(input: {
  tenantId: string; id: string; actorUserId: string | null; reason?: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const inv = await lockVendorInvoice(tx, input.tenantId, input.id);
    if (!isDisputable(inv.status)) throw new VendorInvoiceNotDisputable(input.id, inv.status);
    await tx
      .update(vendorInvoices)
      .set({ status: "disputed" })
      .where(and(eq(vendorInvoices.tenantId, input.tenantId), eq(vendorInvoices.id, input.id)));
    await emitJobBillingEvent(tx, {
      tenantId: input.tenantId, jobId: inv.jobId, eventType: "vendor_invoice.disputed",
      actorUserId: input.actorUserId,
      summary: `Vendor invoice disputed — ${inv.total}`,
      amount: inv.total, currency: inv.currency, vendorInvoiceId: input.id,
      metadata: input.reason ? { reason: input.reason } : undefined,
    });
  });
}

export async function getVendorInvoice(tenantId: string, id: string): Promise<VendorInvoiceRow | null> {
  const rows = await db
    .select()
    .from(vendorInvoices)
    .where(and(eq(vendorInvoices.tenantId, tenantId), eq(vendorInvoices.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listVendorInvoicesForJob(tenantId: string, jobId: string): Promise<VendorInvoiceRow[]> {
  return db
    .select()
    .from(vendorInvoices)
    .where(and(eq(vendorInvoices.tenantId, tenantId), eq(vendorInvoices.jobId, jobId)))
    .orderBy(asc(vendorInvoices.createdAt), asc(vendorInvoices.id));
}

/** Σ approved AP totals for a job (the AP cost side). 8c.8's getJobMargin (OQ-16, CF-8c.7.1)
 *  consumes this minus sumApprovedClientInvoiceTotals once client invoices land. Pure read. */
export async function sumApprovedVendorInvoiceTotals(tenantId: string, jobId: string): Promise<string> {
  const rows = await db
    .select({ total: vendorInvoices.total })
    .from(vendorInvoices)
    .where(
      and(
        eq(vendorInvoices.tenantId, tenantId),
        eq(vendorInvoices.jobId, jobId),
        eq(vendorInvoices.status, "approved"),
      ),
    );
  return sumTotals(rows);
}
