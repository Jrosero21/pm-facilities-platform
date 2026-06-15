import "server-only";

import { and, asc, eq } from "drizzle-orm";
import Big from "big.js";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { clientBillingRules, clientInvoiceLineItems, clientInvoices } from "@/server/schema";
import { recalculateClientInvoiceTotals, roundHalfUp } from "@/server/billing/totals";
import { emitJobBillingEvent } from "@/server/billing/events";
import { assertCommonLineFields, isDecimalStr } from "@/server/billing/money";
import { resolveLaborLineDefault, resolveAgreedRateProvenance, type RateType } from "@/server/billing/client-rates";
import {
  ClientInvoiceNotEditable,
  ClientInvoiceNotSendable,
  ClientInvoiceNotVoidable,
} from "@/server/billing/errors";

// ── Phase 8 batch 8c.8 — CLIENT-INVOICE DATA LAYER (AR, #6/#16/#20) ────────────────────
// Accounts-receivable: what we issue to the client. The AR mirror of the AP invoice layer (8c.7),
// diverging on: markup (cost+uplift, 8c-D4); a markup-default SNAPSHOT from client_billing_rules
// at line creation; issuance (draft → sent) is the platform's first enforced ROLE GATE — but the
// gate lives in the ACTION layer (billing-actions.ts); this DATA layer trusts its callers (no
// role/session import). No NTE (that is AP). void replaces dispute. The `paid`
// payment status + client_invoice.paid event are owned by 8c.9.
//
// Structural guarantees (verify Group string-match): D-7.3 (no scope substrate), 8c.4 sole-writer
// (no write to the job NTE column), no sibling cross-coupling (this module imports neither AR/AP
// sibling data-layer module nor the quote modules — the AR + AP aggregators meet ONLY in
// margin.ts), and the gate is action-layer-only (no role/session import here).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ClientInvoiceLineCategory = NonNullable<typeof clientInvoiceLineItems.$inferInsert["category"]>;
export type ClientInvoiceRow = typeof clientInvoices.$inferSelect;

// ── line-item field validation (same pattern as the other AR quote modules) ───────────
// Shared four fields live in billing/money.ts; markup_percent (AR-only) stays inline. markup is
// decimal(6,3) ⇒ maxIntDigits = 6 − 3 = 3.
function assertValidLineFields(f: Partial<ClientInvoiceLineItemInput>): void {
  assertCommonLineFields(f);
  if (f.markupPercent != null && !isDecimalStr(f.markupPercent, 3, 3)) throw new Error("INVALID_LINE_MARKUP_PERCENT");
}

// The default billing rule for (tenant, client): is_default + active, deterministic tie-break
// (8b §6: earliest created_at, then lowest id — no DB unique on is_default). Pure db read.
async function defaultBillingRule(
  tenantId: string,
  clientId: string,
): Promise<{ markupPercent: string | null; paymentTermsDays: number | null } | null> {
  const r = (
    await db
      .select({ markupPercent: clientBillingRules.markupPercent, paymentTermsDays: clientBillingRules.paymentTermsDays })
      .from(clientBillingRules)
      .where(
        and(
          eq(clientBillingRules.tenantId, tenantId),
          eq(clientBillingRules.clientId, clientId),
          eq(clientBillingRules.isDefault, true),
          eq(clientBillingRules.status, "active"),
        ),
      )
      .orderBy(asc(clientBillingRules.createdAt), asc(clientBillingRules.id))
      .limit(1)
  )[0];
  return r ?? null;
}

/** The markup-percent the default billing rule would snapshot onto a new line (or null). Exposed
 *  so the 8c.11d UI can pre-fill the markup field with the resolved default (operator may override). */
export async function resolveClientMarkupDefault(tenantId: string, clientId: string): Promise<string | null> {
  return (await defaultBillingRule(tenantId, clientId))?.markupPercent ?? null;
}

// Lock the invoice row FOR UPDATE; return status + the fields writers/guards/events need.
async function lockClientInvoice(tx: Tx, tenantId: string, id: string) {
  const rows = await tx
    .select({
      id: clientInvoices.id, jobId: clientInvoices.jobId, clientId: clientInvoices.clientId,
      status: clientInvoices.status, total: clientInvoices.total, currency: clientInvoices.currency,
    })
    .from(clientInvoices)
    .where(and(eq(clientInvoices.tenantId, tenantId), eq(clientInvoices.id, id)))
    .for("update");
  if (!rows[0]) throw new Error("CLIENT_INVOICE_NOT_FOUND");
  return rows[0];
}

function sumTotals(rows: { total: string }[]): string {
  return roundHalfUp(rows.reduce((acc, r) => acc.plus(r.total), new Big(0)));
}

export type CreateClientInvoiceInput = {
  tenantId: string;
  jobId: string;
  clientId: string;
  invoiceNumber?: string | null;
  sequenceNumber?: number | null;
  isFinal?: boolean;
  currency?: string;
  dueAt?: Date | null;
  createdByUserId: string | null;
};

/** Create a draft client invoice. Snapshots payment_terms_days from the default billing rule at
 *  creation (immutable to later rule edits, 8c-D4). Emits client_invoice.created (the AR document's
 *  authoring IS a meaningful operator state — the deliberate asymmetry vs the absent vendor_invoice.created). */
export async function createClientInvoice(input: CreateClientInvoiceInput): Promise<{ id: string }> {
  const id = uuidv7();
  const currency = input.currency ?? "USD";
  const sequenceNumber = input.sequenceNumber ?? null;
  const isFinal = input.isFinal ?? false;
  await db.transaction(async (tx) => {
    const rule = await defaultBillingRule(input.tenantId, input.clientId);
    const paymentTermsDays = rule?.paymentTermsDays ?? null;
    await tx.insert(clientInvoices).values({
      id,
      tenantId: input.tenantId,
      jobId: input.jobId,
      clientId: input.clientId,
      invoiceNumber: input.invoiceNumber ?? null,
      sequenceNumber,
      isFinal,
      currency,
      paymentTermsDays,
      dueAt: input.dueAt ?? null,
      createdByUserId: input.createdByUserId,
    });
    await emitJobBillingEvent(tx, {
      tenantId: input.tenantId, jobId: input.jobId, eventType: "client_invoice.created",
      actorUserId: input.createdByUserId,
      summary: `Client invoice created: ${input.invoiceNumber ?? "(draft)"}`,
      amount: "0.00", currency, clientInvoiceId: id,
      metadata: { paymentTermsDays, sequenceNumber, isFinal },
    });
  });
  return { id };
}

export type ClientInvoiceLineItemInput = {
  category: ClientInvoiceLineCategory;
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

/** Add a line to a DRAFT client invoice, then recalc.
 *  THREE-WAY markup semantic (8c.8 Decision 1):
 *    - markupPercent OMITTED (undefined) → SNAPSHOT the default rule's markup at creation time;
 *    - markupPercent === null           → explicit "no markup" (stays null; computeMarkup treats as 0);
 *    - markupPercent === "d.ddd"        → operator OVERRIDE.
 *  The snapshot is a creation-time copy; later rule edits never retroactively touch existing lines.
 *  Phase (ii): a rate_sheet labor/trip line with a tradeId and NO explicit unit_price is priced from
 *  the agreed rate — bypassing the cost-plus markup snapshot entirely (markup forced null, the rate
 *  has margin baked in) and storing trade_id/rate_type as provenance. Explicit unit_price always wins. */
export async function addClientInvoiceLineItem(
  input: { tenantId: string; clientInvoiceId: string } & ClientInvoiceLineItemInput,
): Promise<{ id: string }> {
  const id = uuidv7();
  await db.transaction(async (tx) => {
    const ci = await lockClientInvoice(tx, input.tenantId, input.clientInvoiceId);
    if (ci.status !== "draft") throw new ClientInvoiceNotEditable(input.clientInvoiceId, ci.status);

    // billing-from-rates: resolve a DEFAULT labor unit_price when the operator passed none.
    const rate = await resolveLaborLineDefault({
      tenantId: input.tenantId, jobId: ci.jobId, category: input.category,
      explicitUnitPrice: input.unitPrice, tradeId: input.tradeId, rateType: input.rateType,
    });
    const unitPrice = rate?.unitPrice ?? input.unitPrice;
    if (unitPrice === undefined) throw new Error("INVALID_LINE_UNIT_PRICE"); // no price + no rate resolved

    // Provenance (Phase ii Unit 2b): the resolver-filled rate, OR an explicit agreed-rate line re-
    // confirmed server-side (the rate_sheet pre-fill path passes the resolved price back as an explicit
    // unitPrice + the trade it came from). resolveAgreedRateProvenance re-resolves and returns null
    // unless the explicit price EQUALS the agreed rate — a typed-over price records no provenance and
    // bills with markup. Mirrors addProposalLineItem (the single provenance authority).
    let provTradeId = rate?.tradeId ?? null;
    let provRateType: RateType | null = rate?.rateType ?? null;
    if (!rate && input.unitPrice !== undefined && input.tradeId != null) {
      const prov = await resolveAgreedRateProvenance({
        tenantId: input.tenantId, jobId: ci.jobId, category: input.category,
        explicitUnitPrice: input.unitPrice, tradeId: input.tradeId, rateType: input.rateType,
      });
      if (prov) { provTradeId = prov.tradeId; provRateType = prov.rateType; }
    }
    // agreed rate (resolved or re-confirmed) → no markup (margin baked in); else the three-way cost-plus
    // semantic (undefined → snapshot default; null → explicit no-markup; "d.ddd" → operator override).
    const markupPercent = provTradeId
      ? null
      : input.markupPercent === undefined
        ? await resolveClientMarkupDefault(input.tenantId, ci.clientId)
        : input.markupPercent;
    assertValidLineFields({ ...input, unitPrice, markupPercent });

    const existing = await tx
      .select({ ln: clientInvoiceLineItems.lineNumber })
      .from(clientInvoiceLineItems)
      .where(and(eq(clientInvoiceLineItems.tenantId, input.tenantId), eq(clientInvoiceLineItems.clientInvoiceId, input.clientInvoiceId)));
    const nextLine = existing.reduce((m, r) => Math.max(m, r.ln), 0) + 1;
    await tx.insert(clientInvoiceLineItems).values({
      id,
      tenantId: input.tenantId,
      clientInvoiceId: input.clientInvoiceId,
      lineNumber: nextLine,
      category: input.category,
      description: input.description,
      quantity: input.quantity,
      unit: input.unit ?? null,
      unitPrice,
      markupPercent: markupPercent ?? null,
      taxRate: input.taxRate ?? null,
      taxAmount: input.taxAmount ?? "0",
      tradeId: provTradeId, // provenance: resolver-filled OR re-confirmed explicit agreed rate
      rateType: provRateType,
    });
    await recalculateClientInvoiceTotals(tx, input.tenantId, input.clientInvoiceId);
  });
  return { id };
}

/** Update a DRAFT client invoice's line item, then recalc. markupPercent ABSENT from the input
 *  leaves the existing value UNCHANGED (no re-snapshot) — preserving snapshot-at-creation. */
export async function updateClientInvoiceLineItem(
  input: { tenantId: string; id: string } & Partial<ClientInvoiceLineItemInput>,
): Promise<void> {
  assertValidLineFields(input);
  await db.transaction(async (tx) => {
    const line = (
      await tx
        .select({ clientInvoiceId: clientInvoiceLineItems.clientInvoiceId })
        .from(clientInvoiceLineItems)
        .where(and(eq(clientInvoiceLineItems.tenantId, input.tenantId), eq(clientInvoiceLineItems.id, input.id)))
        .limit(1)
    )[0];
    if (!line) throw new Error("CLIENT_INVOICE_LINE_ITEM_NOT_FOUND");
    const ci = await lockClientInvoice(tx, input.tenantId, line.clientInvoiceId);
    if (ci.status !== "draft") throw new ClientInvoiceNotEditable(line.clientInvoiceId, ci.status);
    await tx
      .update(clientInvoiceLineItems)
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
      .where(and(eq(clientInvoiceLineItems.tenantId, input.tenantId), eq(clientInvoiceLineItems.id, input.id)));
    await recalculateClientInvoiceTotals(tx, input.tenantId, line.clientInvoiceId);
  });
}

/** Remove a line from a DRAFT client invoice, then recalc. */
export async function removeClientInvoiceLineItem(input: { tenantId: string; id: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const line = (
      await tx
        .select({ clientInvoiceId: clientInvoiceLineItems.clientInvoiceId })
        .from(clientInvoiceLineItems)
        .where(and(eq(clientInvoiceLineItems.tenantId, input.tenantId), eq(clientInvoiceLineItems.id, input.id)))
        .limit(1)
    )[0];
    if (!line) throw new Error("CLIENT_INVOICE_LINE_ITEM_NOT_FOUND");
    const ci = await lockClientInvoice(tx, input.tenantId, line.clientInvoiceId);
    if (ci.status !== "draft") throw new ClientInvoiceNotEditable(line.clientInvoiceId, ci.status);
    await tx
      .delete(clientInvoiceLineItems)
      .where(and(eq(clientInvoiceLineItems.tenantId, input.tenantId), eq(clientInvoiceLineItems.id, input.id)));
    await recalculateClientInvoiceTotals(tx, input.tenantId, line.clientInvoiceId);
  });
}

/** draft → sent (ISSUANCE). NO role check here — the action layer (billing-actions.ts) gates this
 *  with the accounting role predicate (8c-D2). Stamps issued_at + issued_by_user_id; emits client_invoice.sent.
 *  Phase (iii) Part 3: acknowledgedMissingVendorDoc is set true ONLY when the cost-plus doc-advisory
 *  warning applied AND the operator acknowledged it — recorded in the event metadata (the override
 *  audit). It never gates the send (the gate is the advisory action layer). */
export async function sendClientInvoice(input: {
  tenantId: string;
  id: string;
  actorUserId: string | null;
  acknowledgedMissingVendorDoc?: boolean;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const ci = await lockClientInvoice(tx, input.tenantId, input.id);
    if (ci.status !== "draft") throw new ClientInvoiceNotSendable(input.id, ci.status);
    await tx
      .update(clientInvoices)
      .set({ status: "sent", issuedAt: new Date(), issuedByUserId: input.actorUserId })
      .where(and(eq(clientInvoices.tenantId, input.tenantId), eq(clientInvoices.id, input.id)));
    await emitJobBillingEvent(tx, {
      tenantId: input.tenantId, jobId: ci.jobId, eventType: "client_invoice.sent",
      actorUserId: input.actorUserId,
      summary: `Client invoice sent — ${ci.total}`,
      amount: ci.total, currency: ci.currency, clientInvoiceId: input.id,
      // Override audit: only present when the operator issued past the missing-vendor-doc advisory.
      ...(input.acknowledgedMissingVendorDoc ? { metadata: { issuedWithoutVendorDoc: true } } : {}),
    });
  });
}

/** sent → void. Catch 1: void does NOT check payment_status — voiding an issued invoice against
 *  which payment was received is allowed; reconciliation/refund is the operator's responsibility
 *  (06-business-rules). Emits client_invoice.voided. */
export async function voidClientInvoice(input: { tenantId: string; id: string; actorUserId: string | null }): Promise<void> {
  await db.transaction(async (tx) => {
    const ci = await lockClientInvoice(tx, input.tenantId, input.id);
    if (ci.status !== "sent") throw new ClientInvoiceNotVoidable(input.id, ci.status);
    await tx
      .update(clientInvoices)
      .set({ status: "void" })
      .where(and(eq(clientInvoices.tenantId, input.tenantId), eq(clientInvoices.id, input.id)));
    await emitJobBillingEvent(tx, {
      tenantId: input.tenantId, jobId: ci.jobId, eventType: "client_invoice.voided",
      actorUserId: input.actorUserId,
      summary: `Client invoice voided — ${ci.total}`,
      amount: ci.total, currency: ci.currency, clientInvoiceId: input.id,
    });
  });
}

export async function getClientInvoice(tenantId: string, id: string): Promise<ClientInvoiceRow | null> {
  const rows = await db
    .select()
    .from(clientInvoices)
    .where(and(eq(clientInvoices.tenantId, tenantId), eq(clientInvoices.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listClientInvoicesForJob(tenantId: string, jobId: string): Promise<ClientInvoiceRow[]> {
  return db
    .select()
    .from(clientInvoices)
    .where(and(eq(clientInvoices.tenantId, tenantId), eq(clientInvoices.jobId, jobId)))
    .orderBy(asc(clientInvoices.createdAt), asc(clientInvoices.id));
}

export type ClientInvoiceLineItemRow = typeof clientInvoiceLineItems.$inferSelect;

/** Line items for a client invoice, ordered by line number. Tenant-scoped. Pure read (8c.11d —
 *  the detail screen renders inputs + the writer-owned extended_amount/markup_amount). */
export async function listClientInvoiceLineItems(tenantId: string, clientInvoiceId: string): Promise<ClientInvoiceLineItemRow[]> {
  return db
    .select()
    .from(clientInvoiceLineItems)
    .where(and(eq(clientInvoiceLineItems.tenantId, tenantId), eq(clientInvoiceLineItems.clientInvoiceId, clientInvoiceId)))
    .orderBy(asc(clientInvoiceLineItems.lineNumber));
}

/** Σ issued AR totals for a job (the revenue side). AR-"issued" = status='sent' ONLY (draft + void
 *  excluded); payment_status is orthogonal — a paid invoice is still status='sent' (8c.8 Decision 4).
 *  getJobMargin (margin.ts) consumes this minus sumApprovedVendorInvoiceTotals. Pure read. */
export async function sumApprovedClientInvoiceTotals(tenantId: string, jobId: string): Promise<string> {
  const rows = await db
    .select({ total: clientInvoices.total })
    .from(clientInvoices)
    .where(
      and(
        eq(clientInvoices.tenantId, tenantId),
        eq(clientInvoices.jobId, jobId),
        eq(clientInvoices.status, "sent"),
      ),
    );
  return sumTotals(rows);
}
