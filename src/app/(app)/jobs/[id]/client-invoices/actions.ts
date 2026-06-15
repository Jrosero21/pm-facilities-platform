"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { enforceAccountingGate, requireTenant } from "@/server/auth-context";
import {
  addClientInvoiceLineItem,
  createClientInvoice,
  getClientInvoice,
  removeClientInvoiceLineItem,
  sendClientInvoice,
  updateClientInvoiceLineItem,
  voidClientInvoice,
} from "@/server/billing/client-invoices";
import { shouldWarnMissingVendorDoc } from "@/server/billing/cost-plus-doc-gate";
import {
  ClientInvoiceNotEditable,
  ClientInvoiceNotSendable,
  ClientInvoiceNotVoidable,
} from "@/server/billing/errors";

// ── Phase 8 batch 8c.11d — CLIENT-INVOICE (AR) ACTIONS — MIXED gate ───────────────────
// CRUD (create + line edits) = requireTenant-only (operator authoring). ISSUING (send) + VOID =
// accounting-gated via enforceAccountingGate (8c-D2 / OQ-23/24; void is the 4th gated site,
// 8c.11d Decision 2). sendClientInvoiceAction is RESHAPED here from the 8c.8 typed-input shape to
// the useActionState/FormData template + relocated from billing-actions.ts.

export type ClientInvoiceActionState = { error: string } | null;

// Phase (iii) Part 3 — the SEND action returns a richer state than the generic {error}|null: it can ask
// the operator to ACKNOWLEDGE a missing vendor-invoice document before issuing cost-plus (advisory,
// never blocks — re-submitting with the ack proceeds). Mirrors previewProposalRoutingAction's union.
export type SendClientInvoiceState =
  | { error: string }
  | { needsVendorDocAck: true; warning: string }
  | null;

const VENDOR_DOC_WARNING =
  "No vendor invoice document is on file for this cost-plus invoice. The client is entitled to see the vendor cost. Attach it on the vendor invoice, or acknowledge to issue without it.";

const NUM = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const OPT = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};
function parseDate(v: string): Date | null {
  const t = v.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function operationalMessage(e: unknown): string {
  if (e instanceof ClientInvoiceNotEditable) return "This client invoice can no longer be edited (it has already been sent or voided).";
  if (e instanceof ClientInvoiceNotSendable) return "This client invoice can no longer be sent.";
  if (e instanceof ClientInvoiceNotVoidable) return "This client invoice can no longer be voided.";
  if (e instanceof Error) {
    if (e.message === "CLIENT_INVOICE_NOT_FOUND" || e.message === "CLIENT_INVOICE_LINE_ITEM_NOT_FOUND") {
      return "This client invoice no longer exists — please reload.";
    }
    if (e.message.startsWith("INVALID_LINE_")) return "Check the line values (quantity, unit price, markup, tax).";
  }
  return "";
}

/** Create a draft client invoice (clientId supplied hidden from the job), then redirect to detail. */
export async function createClientInvoiceAction(
  jobId: string,
  _prev: ClientInvoiceActionState,
  formData: FormData,
): Promise<ClientInvoiceActionState> {
  const ctx = await requireTenant();
  const clientId = NUM(formData, "clientId");
  if (!clientId) return { error: "Missing client for this invoice." };
  let newId: string;
  try {
    const r = await createClientInvoice({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      clientId,
      invoiceNumber: OPT(formData, "invoiceNumber"),
      currency: OPT(formData, "currency") ?? undefined,
      dueAt: parseDate(NUM(formData, "dueAt")),
      createdByUserId: ctx.user.id,
    });
    newId = r.id;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
  redirect(`/jobs/${jobId}/client-invoices/${newId}`);
}

/** Add a line to a draft client invoice. Markup THREE-WAY (8c.8 Decision 1): blank field →
 *  undefined → snapshot the default rule; "0" → explicit zero; a value → override. */
export async function addClientInvoiceLineItemAction(
  clientInvoiceId: string,
  jobId: string,
  _prev: ClientInvoiceActionState,
  formData: FormData,
): Promise<ClientInvoiceActionState> {
  const ctx = await requireTenant();
  const markupRaw = String(formData.get("markupPercent") ?? "").trim();
  const markupPercent = markupRaw === "" ? undefined : markupRaw; // "" → snapshot; "0"/value → explicit
  // Phase (ii): a picked trade (rate_sheet labor/trip) + BLANK price → defer to the agreed rate
  // (undefined ⇒ the data-layer resolver fills it; markup is forced null there). Otherwise blank→"0".
  const tradeId = OPT(formData, "tradeId");
  const priceRaw = NUM(formData, "unitPrice");
  const unitPrice = tradeId && priceRaw === "" ? undefined : priceRaw || "0";
  try {
    await addClientInvoiceLineItem({
      tenantId: ctx.activeTenant.tenantId,
      clientInvoiceId,
      category: NUM(formData, "category") as Parameters<typeof addClientInvoiceLineItem>[0]["category"],
      description: NUM(formData, "description"),
      quantity: NUM(formData, "quantity") || "1",
      unit: OPT(formData, "unit"),
      unitPrice,
      markupPercent,
      taxRate: OPT(formData, "taxRate"),
      taxAmount: NUM(formData, "taxAmount") || "0",
      tradeId, // rateType is derived from category in the data layer (labor→hourly, trip→trip_charge)
    });
    revalidatePath(`/jobs/${jobId}/client-invoices/${clientInvoiceId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** Update a client-invoice line. (Action-ready; inline-edit UI deferred.) */
export async function updateClientInvoiceLineItemAction(
  lineId: string,
  clientInvoiceId: string,
  jobId: string,
  _prev: ClientInvoiceActionState,
  formData: FormData,
): Promise<ClientInvoiceActionState> {
  const ctx = await requireTenant();
  try {
    await updateClientInvoiceLineItem({
      tenantId: ctx.activeTenant.tenantId,
      id: lineId,
      description: OPT(formData, "description") ?? undefined,
      quantity: OPT(formData, "quantity") ?? undefined,
      unitPrice: OPT(formData, "unitPrice") ?? undefined,
      markupPercent: OPT(formData, "markupPercent"),
      taxRate: OPT(formData, "taxRate"),
      taxAmount: OPT(formData, "taxAmount") ?? undefined,
    });
    revalidatePath(`/jobs/${jobId}/client-invoices/${clientInvoiceId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** Remove a client-invoice line. (No form inputs — bound id only.) */
export async function removeClientInvoiceLineItemAction(
  lineId: string,
  clientInvoiceId: string,
  jobId: string,
): Promise<ClientInvoiceActionState> {
  const ctx = await requireTenant();
  try {
    await removeClientInvoiceLineItem({ tenantId: ctx.activeTenant.tenantId, id: lineId });
    revalidatePath(`/jobs/${jobId}/client-invoices/${clientInvoiceId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** draft → sent (ISSUANCE) — ACCOUNTING-GATED. Phase (iii) Part 3: re-shaped to read an ack checkbox.
 *  At cost-plus issuance with no vendor-invoice document on file (and the client's toggle on), this
 *  RE-VERIFIES the advisory server-side and returns { needsVendorDocAck } WITHOUT sending unless the
 *  operator acknowledged it (raw === "true"/"on"/"1", mirroring forceClientReview). The ack ALWAYS lets
 *  them proceed — it never blocks; the override is recorded in the client_invoice.sent event metadata. */
export async function sendClientInvoiceAction(
  clientInvoiceId: string,
  jobId: string,
  _prev: SendClientInvoiceState,
  formData: FormData,
): Promise<SendClientInvoiceState> {
  const ctx = await requireTenant();
  enforceAccountingGate(ctx); // redirects /forbidden for non-accounting (authorization backstop)
  const tenantId = ctx.activeTenant.tenantId;
  try {
    const inv = await getClientInvoice(tenantId, clientInvoiceId);
    if (!inv) return { error: "This client invoice no longer exists — please reload." };

    // RE-VERIFY the advisory server-side (no-trust-client). Acknowledged ⇒ proceed + record override.
    const warn = await shouldWarnMissingVendorDoc(tenantId, inv);
    const ackRaw = formData.get("acknowledgeMissingVendorDoc");
    const acknowledged = ackRaw === "true" || ackRaw === "on" || ackRaw === "1";
    if (warn && !acknowledged) {
      return { needsVendorDocAck: true, warning: VENDOR_DOC_WARNING };
    }

    await sendClientInvoice({
      tenantId,
      id: clientInvoiceId,
      actorUserId: ctx.user.id,
      acknowledgedMissingVendorDoc: warn && acknowledged, // override audit only when the warning applied
    });
    revalidatePath(`/jobs/${jobId}/client-invoices/${clientInvoiceId}`);
    revalidatePath(`/jobs/${jobId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** sent → void — ACCOUNTING-GATED (8c.11d Decision 2; retracting issued revenue is accounting). */
export async function voidClientInvoiceAction(clientInvoiceId: string, jobId: string): Promise<ClientInvoiceActionState> {
  const ctx = await requireTenant();
  enforceAccountingGate(ctx);
  try {
    await voidClientInvoice({ tenantId: ctx.activeTenant.tenantId, id: clientInvoiceId, actorUserId: ctx.user.id });
    revalidatePath(`/jobs/${jobId}/client-invoices/${clientInvoiceId}`);
    revalidatePath(`/jobs/${jobId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}
