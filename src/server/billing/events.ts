import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { jobBillingEvents } from "@/server/schema";

// ── Phase 8 batch 8c.3 — JOB BILLING EVENTS (R-7.2 enforcement boundary, #17) ─────────
// emitJobBillingEvent is the SINGLE shape/taxonomy enforcement boundary for the financial
// timeline; every billing write path (8c.4–8c.10) calls it INSIDE its own txn. Append-only:
// this module exports ONLY emit (write) + list (read) — no update/delete (+ the table has no
// updated_at). The reader parses metadata at the read boundary (R-6.19 — MariaDB json() is
// longtext; mysql2 returns it as a string).
//
// Taxonomy is a const array (as const) → string-literal union + a runtime Set for membership
// (9a). dot-namespaced domain.verb. event_type is varchar(64) (open) — extending the const is
// migration-free; a generous allowlist is the safe side (the failure mode is the opposite:
// emitting a type NOT in the const throws).
//
// RECORD-REF CONVENTION (9b — 0-to-many refs, NO XOR): an event may carry zero, one, or several
// typed record refs; its meaning = event_type + job_id + the applicable refs. Conventional:
//   proposal.*       → proposalId
//   change_order.*    → changeOrderId
//   vendor_invoice.*  → vendorInvoiceId
//   client_invoice.*  → clientInvoiceId
//   payment.recorded  → paymentId + the paid invoice (clientInvoiceId OR vendorInvoiceId)
//   vendor_invoice.paid / client_invoice.paid → the invoice id (+ optionally paymentId)
//   nte.exceeded      → vendorInvoiceId (the over-NTE invoice)
//   nte.overridden    → (none — job-level)
//   billing.closed    → (none — job-level)

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const BILLING_EVENT_TYPES = [
  "proposal.sent",
  "proposal.accepted",
  "proposal.declined",
  "proposal.withdrawn",
  "proposal.superseded",
  "change_order.submitted",
  "change_order.approved",
  "change_order.declined",
  "change_order.withdrawn",
  "vendor_invoice.received",
  "vendor_invoice.approved",
  "vendor_invoice.disputed",
  "vendor_invoice.paid",
  "client_invoice.created",
  "client_invoice.sent",
  "client_invoice.paid",
  "client_invoice.voided",
  "payment.recorded",
  "nte.exceeded",
  "nte.overridden",
  "billing.closed",
] as const;
export type BillingEventType = (typeof BILLING_EVENT_TYPES)[number];

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(BILLING_EVENT_TYPES);

// amount may be signed (events are informational — a credit/refund/over-NTE delta can be
// negative). decimal(12,2) ⇒ at most 10 integer digits.
function isValidEventAmount(s: string): boolean {
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return false;
  const intPart = (s.replace(/^-/, "").split(".")[0] ?? "").replace(/^0+/, "");
  return intPart.length <= 10;
}
function isValidCurrency(s: string): boolean {
  return /^[A-Z]{3}$/.test(s);
}

export type EmitJobBillingEventParams = {
  tenantId: string;
  jobId: string;
  eventType: BillingEventType;
  summary: string;
  actorUserId?: string | null;
  amount?: string | null;
  currency?: string | null;
  proposalId?: string | null;
  changeOrderId?: string | null;
  vendorInvoiceId?: string | null;
  clientInvoiceId?: string | null;
  paymentId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Append a billing event — THE enforcement boundary (R-7.2 analog). Validates the taxonomy +
 * field shapes, then inserts. Runs INSIDE the caller's transaction (no db.transaction here) —
 * callers MUST wrap so the state change + its event commit atomically. Throws generic Error on
 * validation failure (programmer errors; the data layer passes typed-valid values, the UI never
 * calls emit). Trusts jobId ∈ tenantId (9f — the FK guarantees the job exists).
 */
export async function emitJobBillingEvent(tx: Tx, params: EmitJobBillingEventParams): Promise<void> {
  if (!EVENT_TYPE_SET.has(params.eventType)) {
    throw new Error(`INVALID_BILLING_EVENT_TYPE: ${params.eventType}`);
  }
  // Catch 2: trim BEFORE the length check, and store the trimmed value.
  const summary = params.summary.trim();
  if (summary.length === 0 || summary.length > 500) {
    throw new Error("INVALID_BILLING_EVENT_SUMMARY");
  }
  const amount = params.amount ?? null;
  if (amount !== null && !isValidEventAmount(amount)) {
    throw new Error("INVALID_BILLING_EVENT_AMOUNT");
  }
  const currency = params.currency ?? null;
  if (currency !== null && !isValidCurrency(currency)) {
    throw new Error("INVALID_BILLING_EVENT_CURRENCY");
  }

  await tx.insert(jobBillingEvents).values({
    id: uuidv7(),
    tenantId: params.tenantId,
    jobId: params.jobId,
    eventType: params.eventType,
    actorUserId: params.actorUserId ?? null,
    summary,
    amount,
    currency,
    proposalId: params.proposalId ?? null,
    changeOrderId: params.changeOrderId ?? null,
    vendorInvoiceId: params.vendorInvoiceId ?? null,
    clientInvoiceId: params.clientInvoiceId ?? null,
    paymentId: params.paymentId ?? null,
    // Catch 3: pass the object; Drizzle json() serializes (the codebase pattern — every
    // metadata write passes an object to .values(), never JSON.stringify).
    metadata: params.metadata ?? null,
  });
}

export type BillingEvent = {
  id: string;
  jobId: string;
  eventType: string;
  actorUserId: string | null;
  summary: string;
  amount: string | null;
  currency: string | null;
  proposalId: string | null;
  changeOrderId: string | null;
  vendorInvoiceId: string | null;
  clientInvoiceId: string | null;
  paymentId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

// R-6.19: MariaDB json() comes back as a string; parse at the read boundary.
function parseMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return raw as Record<string, unknown>;
}

/**
 * The job's financial timeline, chronological, tenant-scoped. created_at is second-granularity,
 * so id (uuidv7, time-ordered) is the deterministic tie-break for same-second events.
 */
export async function listJobBillingEvents(tenantId: string, jobId: string): Promise<BillingEvent[]> {
  const rows = await db
    .select({
      id: jobBillingEvents.id,
      jobId: jobBillingEvents.jobId,
      eventType: jobBillingEvents.eventType,
      actorUserId: jobBillingEvents.actorUserId,
      summary: jobBillingEvents.summary,
      amount: jobBillingEvents.amount,
      currency: jobBillingEvents.currency,
      proposalId: jobBillingEvents.proposalId,
      changeOrderId: jobBillingEvents.changeOrderId,
      vendorInvoiceId: jobBillingEvents.vendorInvoiceId,
      clientInvoiceId: jobBillingEvents.clientInvoiceId,
      paymentId: jobBillingEvents.paymentId,
      metadata: jobBillingEvents.metadata,
      createdAt: jobBillingEvents.createdAt,
    })
    .from(jobBillingEvents)
    .where(and(eq(jobBillingEvents.tenantId, tenantId), eq(jobBillingEvents.jobId, jobId)))
    .orderBy(asc(jobBillingEvents.createdAt), asc(jobBillingEvents.id));
  return rows.map((r) => ({ ...r, metadata: parseMetadata(r.metadata) }));
}
