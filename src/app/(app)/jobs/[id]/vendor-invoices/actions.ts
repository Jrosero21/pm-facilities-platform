"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import {
  addVendorInvoiceLineItem,
  approveVendorInvoice,
  disputeVendorInvoice,
  recordVendorInvoice,
  removeVendorInvoiceLineItem,
  updateVendorInvoiceLineItem,
} from "@/server/billing/vendor-invoices";
import {
  VendorInvoiceNotApprovable,
  VendorInvoiceNotDisputable,
  VendorInvoiceNotEditable,
} from "@/server/billing/errors";

// ── Phase 8 batch 8c.11d — VENDOR-INVOICE (AP) ACTIONS — requireTenant-only ───────────
// AP actions are operator-level (OQ-24: the operator validates/approves the vendor invoice;
// accounting approves the PAYMENT). Same 11b/11c template: useActionState/FormData, the specific
// operationalMessage allowlist + throw-e-on-unmatched, redirect-vs-error split. NO accounting gate.

export type VendorInvoiceActionState = { error: string } | null;

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
  if (e instanceof VendorInvoiceNotEditable) return "This vendor invoice can no longer be edited (it was already approved or disputed).";
  if (e instanceof VendorInvoiceNotApprovable) return "This vendor invoice can no longer be approved.";
  if (e instanceof VendorInvoiceNotDisputable) return "This vendor invoice can no longer be disputed.";
  if (e instanceof Error) {
    if (e.message === "VENDOR_INVOICE_NOT_FOUND" || e.message === "VENDOR_INVOICE_LINE_ITEM_NOT_FOUND") {
      return "This vendor invoice no longer exists — please reload.";
    }
    if (e.message.startsWith("INVALID_LINE_")) return "Check the line values (quantity, unit price, tax).";
  }
  return "";
}

/** Record a vendor invoice (against a job assignment), then redirect to its detail. The form
 *  supplies vendorId + assignmentId from the operator's assignment selection (CF-8c.11d.1). */
export async function recordVendorInvoiceAction(
  jobId: string,
  _prev: VendorInvoiceActionState,
  formData: FormData,
): Promise<VendorInvoiceActionState> {
  const ctx = await requireTenant();
  const vendorId = NUM(formData, "vendorId");
  if (!vendorId) return { error: "Select a dispatch (vendor) for this invoice." };
  let newId: string;
  try {
    const r = await recordVendorInvoice({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      vendorId,
      assignmentId: OPT(formData, "assignmentId"),
      invoiceNumber: OPT(formData, "invoiceNumber"),
      invoiceDate: parseDate(NUM(formData, "invoiceDate")),
      createdByUserId: ctx.user.id,
    });
    newId = r.id;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
  redirect(`/jobs/${jobId}/vendor-invoices/${newId}`);
}

/** Add a line to a received/under_review vendor invoice (NO markup — AP). */
export async function addVendorInvoiceLineItemAction(
  vendorInvoiceId: string,
  jobId: string,
  _prev: VendorInvoiceActionState,
  formData: FormData,
): Promise<VendorInvoiceActionState> {
  const ctx = await requireTenant();
  try {
    await addVendorInvoiceLineItem({
      tenantId: ctx.activeTenant.tenantId,
      vendorInvoiceId,
      category: NUM(formData, "category") as Parameters<typeof addVendorInvoiceLineItem>[0]["category"],
      description: NUM(formData, "description"),
      quantity: NUM(formData, "quantity") || "1",
      unit: OPT(formData, "unit"),
      unitPrice: NUM(formData, "unitPrice") || "0",
      taxRate: OPT(formData, "taxRate"),
      taxAmount: NUM(formData, "taxAmount") || "0",
    });
    revalidatePath(`/jobs/${jobId}/vendor-invoices/${vendorInvoiceId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** Update a vendor-invoice line. (Action-ready; inline-edit UI deferred.) */
export async function updateVendorInvoiceLineItemAction(
  lineId: string,
  vendorInvoiceId: string,
  jobId: string,
  _prev: VendorInvoiceActionState,
  formData: FormData,
): Promise<VendorInvoiceActionState> {
  const ctx = await requireTenant();
  try {
    await updateVendorInvoiceLineItem({
      tenantId: ctx.activeTenant.tenantId,
      id: lineId,
      description: OPT(formData, "description") ?? undefined,
      quantity: OPT(formData, "quantity") ?? undefined,
      unitPrice: OPT(formData, "unitPrice") ?? undefined,
      taxRate: OPT(formData, "taxRate"),
      taxAmount: OPT(formData, "taxAmount") ?? undefined,
    });
    revalidatePath(`/jobs/${jobId}/vendor-invoices/${vendorInvoiceId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** Remove a vendor-invoice line. (No form inputs — bound id only.) */
export async function removeVendorInvoiceLineItemAction(
  lineId: string,
  vendorInvoiceId: string,
  jobId: string,
): Promise<VendorInvoiceActionState> {
  const ctx = await requireTenant();
  try {
    await removeVendorInvoiceLineItem({ tenantId: ctx.activeTenant.tenantId, id: lineId });
    revalidatePath(`/jobs/${jobId}/vendor-invoices/${vendorInvoiceId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** received/under_review → approved (operator commit point, OQ-24). */
export async function approveVendorInvoiceAction(vendorInvoiceId: string, jobId: string): Promise<VendorInvoiceActionState> {
  const ctx = await requireTenant();
  try {
    await approveVendorInvoice({ tenantId: ctx.activeTenant.tenantId, id: vendorInvoiceId, approverUserId: ctx.user.id, approvedAt: new Date() });
    revalidatePath(`/jobs/${jobId}/vendor-invoices/${vendorInvoiceId}`);
    revalidatePath(`/jobs/${jobId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** received/under_review → disputed. */
export async function disputeVendorInvoiceAction(vendorInvoiceId: string, jobId: string): Promise<VendorInvoiceActionState> {
  const ctx = await requireTenant();
  try {
    await disputeVendorInvoice({ tenantId: ctx.activeTenant.tenantId, id: vendorInvoiceId, actorUserId: ctx.user.id });
    revalidatePath(`/jobs/${jobId}/vendor-invoices/${vendorInvoiceId}`);
    revalidatePath(`/jobs/${jobId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}
