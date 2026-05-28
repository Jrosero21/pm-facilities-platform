import "server-only";

import { and, asc, eq } from "drizzle-orm";
import Big from "big.js";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { clientInvoices, paymentRecords, vendorInvoices } from "@/server/schema";
import { roundHalfUp } from "@/server/billing/totals";
import { emitJobBillingEvent } from "@/server/billing/events";
import { isDecimalStr } from "@/server/billing/money";
import {
  PaymentAmountInvalid,
  PaymentDirectionMismatch,
  PaymentInvoiceNotPayable,
  PaymentInvoiceRefInvalid,
} from "@/server/billing/errors";

// ── Phase 8 batch 8c.9 — PAYMENT DATA LAYER (#16) ─────────────────────────────────────
// The convergence sub-batch: ONE payment_records table, a `direction` discriminator.
//   outbound = aggregator→vendor (AP) → references a vendor invoice;
//   inbound  = client→aggregator (AR) → references a client invoice.
//
// Four load-bearing properties:
//  1. XOR invoice ref — exactly one of (vendorInvoiceId, clientInvoiceId) set, agreeing with
//     direction (D-7.7 data-layer invariant; no DB CHECK). Validated before the txn.
//  2. Writer-derived job_id — recordPayment has NO jobId parameter; job_id is read off the
//     referenced invoice (8b-D5 / 8c.4 sole-writer discipline for a denormalized column).
//  3. Derived payment_status — this writer is the SOLE post-creation writer of the invoice's
//     payment_status (unpaid → partially_paid → paid), computed-on-write from Σ payments.
//  4. SINGLE-SIDED execution — a single recordPayment touches EITHER the vendor side OR the
//     client side, never both: the lock + payment_status update + paid-event live entirely inside
//     one of two mutually-exclusive direction branches (applyOutbound / applyInbound). This module
//     imports both invoice schemas (for the discriminator) but no execution path reads/writes both
//     invoice tables — it is a uniform direction-discriminated writer, not a cross-side join.
//
// The accounting gate (recording payments is accounting-controlled, OQ-24) lives in the ACTION
// layer; this DATA layer trusts its callers (no role/session import).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PaymentStatus = "unpaid" | "partially_paid" | "paid";
export type PaymentDirection = "inbound" | "outbound";
export type PaymentRow = typeof paymentRecords.$inferSelect;

export type RecordPaymentInput = {
  tenantId: string;
  direction: PaymentDirection;
  vendorInvoiceId?: string | null; // set iff outbound
  clientInvoiceId?: string | null; // set iff inbound
  amount: string; // decimal(12,2), > 0
  currency?: string;
  method?: string | null;
  reference?: string | null;
  paidAt?: Date; // Catch 1: column is notNull w/ no DB default → writer applies `?? new Date()`
  recordedByUserId: string | null;
  // NO jobId — its ABSENCE is the writer-derived guarantee.
};

// ── pure helpers ──────────────────────────────────────────────────────────────────────
function sumAmounts(rows: { amount: string }[]): string {
  return roundHalfUp(rows.reduce((acc, r) => acc.plus(r.amount), new Big(0)));
}
function derivePaymentStatus(paid: string, total: string): PaymentStatus {
  const p = new Big(paid);
  if (p.gte(total)) return "paid"; // Σ ≥ total ⇒ paid (overpayment caps here — CF-8c.9.1)
  if (p.gt(0)) return "partially_paid";
  return "unpaid";
}

// XOR + direction agreement (D-7.7). Throws before any DB work.
function validateInvoiceRef(input: RecordPaymentInput): void {
  const hasVendor = input.vendorInvoiceId != null;
  const hasClient = input.clientInvoiceId != null;
  if (hasVendor === hasClient) throw new PaymentInvoiceRefInvalid(); // both, or neither
  if (input.direction === "outbound" && !hasVendor) throw new PaymentDirectionMismatch(input.direction);
  if (input.direction === "inbound" && !hasClient) throw new PaymentDirectionMismatch(input.direction);
}
function validateAmount(amount: string): void {
  if (!isDecimalStr(amount, 10, 2) || !(parseFloat(amount) > 0)) throw new PaymentAmountInvalid(amount);
}

// ── OUTBOUND (AP) — touches the vendor side ONLY ──────────────────────────────────────
async function applyOutboundPayment(tx: Tx, paymentId: string, input: RecordPaymentInput, paidAt: Date): Promise<void> {
  const vendorInvoiceId = input.vendorInvoiceId as string;
  const inv = (
    await tx
      .select({
        jobId: vendorInvoices.jobId, status: vendorInvoices.status, total: vendorInvoices.total,
        currency: vendorInvoices.currency, paymentStatus: vendorInvoices.paymentStatus,
      })
      .from(vendorInvoices)
      .where(and(eq(vendorInvoices.tenantId, input.tenantId), eq(vendorInvoices.id, vendorInvoiceId)))
      .for("update")
  )[0];
  if (!inv) throw new Error("VENDOR_INVOICE_NOT_FOUND");
  if (inv.status !== "approved") throw new PaymentInvoiceNotPayable(vendorInvoiceId, inv.status);
  const currency = input.currency ?? inv.currency;

  await tx.insert(paymentRecords).values({
    id: paymentId, tenantId: input.tenantId, direction: "outbound",
    vendorInvoiceId, clientInvoiceId: null, jobId: inv.jobId, // job_id WRITER-DERIVED from the invoice
    amount: input.amount, currency, method: input.method ?? null, reference: input.reference ?? null,
    paidAt, recordedByUserId: input.recordedByUserId,
  });

  const paid = sumAmounts(
    await tx
      .select({ amount: paymentRecords.amount })
      .from(paymentRecords)
      .where(and(eq(paymentRecords.tenantId, input.tenantId), eq(paymentRecords.vendorInvoiceId, vendorInvoiceId))),
  );
  const newStatus = derivePaymentStatus(paid, inv.total);
  await tx
    .update(vendorInvoices)
    .set({ paymentStatus: newStatus })
    .where(and(eq(vendorInvoices.tenantId, input.tenantId), eq(vendorInvoices.id, vendorInvoiceId)));

  // paid event fires ONLY on the first crossing into `paid` (Decision 7).
  if (inv.paymentStatus !== "paid" && newStatus === "paid") {
    await emitJobBillingEvent(tx, {
      tenantId: input.tenantId, jobId: inv.jobId, eventType: "vendor_invoice.paid",
      actorUserId: input.recordedByUserId,
      summary: `Vendor invoice paid in full — ${inv.total}`,
      amount: inv.total, currency, vendorInvoiceId, paymentId, metadata: { totalPaid: paid },
    });
  }
  await emitJobBillingEvent(tx, {
    tenantId: input.tenantId, jobId: inv.jobId, eventType: "payment.recorded",
    actorUserId: input.recordedByUserId,
    summary: `Payment recorded (outbound) — ${input.amount}`,
    amount: input.amount, currency, vendorInvoiceId, paymentId,
    metadata: { direction: "outbound", method: input.method ?? null, newPaymentStatus: newStatus },
  });
}

// ── INBOUND (AR) — touches the client side ONLY ───────────────────────────────────────
async function applyInboundPayment(tx: Tx, paymentId: string, input: RecordPaymentInput, paidAt: Date): Promise<void> {
  const clientInvoiceId = input.clientInvoiceId as string;
  const inv = (
    await tx
      .select({
        jobId: clientInvoices.jobId, status: clientInvoices.status, total: clientInvoices.total,
        currency: clientInvoices.currency, paymentStatus: clientInvoices.paymentStatus,
      })
      .from(clientInvoices)
      .where(and(eq(clientInvoices.tenantId, input.tenantId), eq(clientInvoices.id, clientInvoiceId)))
      .for("update")
  )[0];
  if (!inv) throw new Error("CLIENT_INVOICE_NOT_FOUND");
  if (inv.status !== "sent") throw new PaymentInvoiceNotPayable(clientInvoiceId, inv.status);
  const currency = input.currency ?? inv.currency;

  await tx.insert(paymentRecords).values({
    id: paymentId, tenantId: input.tenantId, direction: "inbound",
    clientInvoiceId, vendorInvoiceId: null, jobId: inv.jobId, // job_id WRITER-DERIVED from the invoice
    amount: input.amount, currency, method: input.method ?? null, reference: input.reference ?? null,
    paidAt, recordedByUserId: input.recordedByUserId,
  });

  const paid = sumAmounts(
    await tx
      .select({ amount: paymentRecords.amount })
      .from(paymentRecords)
      .where(and(eq(paymentRecords.tenantId, input.tenantId), eq(paymentRecords.clientInvoiceId, clientInvoiceId))),
  );
  const newStatus = derivePaymentStatus(paid, inv.total);
  await tx
    .update(clientInvoices)
    .set({ paymentStatus: newStatus })
    .where(and(eq(clientInvoices.tenantId, input.tenantId), eq(clientInvoices.id, clientInvoiceId)));

  if (inv.paymentStatus !== "paid" && newStatus === "paid") {
    await emitJobBillingEvent(tx, {
      tenantId: input.tenantId, jobId: inv.jobId, eventType: "client_invoice.paid",
      actorUserId: input.recordedByUserId,
      summary: `Client invoice paid in full — ${inv.total}`,
      amount: inv.total, currency, clientInvoiceId, paymentId, metadata: { totalPaid: paid },
    });
  }
  await emitJobBillingEvent(tx, {
    tenantId: input.tenantId, jobId: inv.jobId, eventType: "payment.recorded",
    actorUserId: input.recordedByUserId,
    summary: `Payment recorded (inbound) — ${input.amount}`,
    amount: input.amount, currency, clientInvoiceId, paymentId,
    metadata: { direction: "inbound", method: input.method ?? null, newPaymentStatus: newStatus },
  });
}

/**
 * Record a payment against a single invoice and derive that invoice's payment_status.
 * XOR + amount validated before the txn; job_id is writer-derived (no caller param).
 * LOCK ORDER: the referenced invoice row only (FOR UPDATE) — a strict subset of
 * approveVendorInvoice's (invoice row, then job row), so no deadlock partner. Single-sided:
 * dispatches to exactly one of applyOutbound/applyInbound; no path touches both invoice tables.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<{ id: string }> {
  validateInvoiceRef(input);
  validateAmount(input.amount);
  const id = uuidv7();
  const paidAt = input.paidAt ?? new Date();
  await db.transaction(async (tx) => {
    if (input.direction === "outbound") {
      await applyOutboundPayment(tx, id, input, paidAt);
    } else {
      await applyInboundPayment(tx, id, input, paidAt);
    }
  });
  return { id };
}

export async function getPayment(tenantId: string, id: string): Promise<PaymentRow | null> {
  const rows = await db
    .select()
    .from(paymentRecords)
    .where(and(eq(paymentRecords.tenantId, tenantId), eq(paymentRecords.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listPaymentsForJob(tenantId: string, jobId: string): Promise<PaymentRow[]> {
  return db
    .select()
    .from(paymentRecords)
    .where(and(eq(paymentRecords.tenantId, tenantId), eq(paymentRecords.jobId, jobId)))
    .orderBy(asc(paymentRecords.createdAt), asc(paymentRecords.id));
}

export async function listPaymentsForVendorInvoice(tenantId: string, vendorInvoiceId: string): Promise<PaymentRow[]> {
  return db
    .select()
    .from(paymentRecords)
    .where(and(eq(paymentRecords.tenantId, tenantId), eq(paymentRecords.vendorInvoiceId, vendorInvoiceId)))
    .orderBy(asc(paymentRecords.createdAt), asc(paymentRecords.id));
}

export async function listPaymentsForClientInvoice(tenantId: string, clientInvoiceId: string): Promise<PaymentRow[]> {
  return db
    .select()
    .from(paymentRecords)
    .where(and(eq(paymentRecords.tenantId, tenantId), eq(paymentRecords.clientInvoiceId, clientInvoiceId)))
    .orderBy(asc(paymentRecords.createdAt), asc(paymentRecords.id));
}
