"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import {
  addChangeOrderLineItem,
  approveChangeOrder,
  createChangeOrder,
  declineChangeOrder,
  removeChangeOrderLineItem,
  submitChangeOrder,
  updateChangeOrderDraft,
  updateChangeOrderLineItem,
  withdrawChangeOrder,
} from "@/server/billing/change-orders";
import {
  ChangeOrderNotApprovable,
  ChangeOrderNotEditable,
  ChangeOrderNotWithdrawable,
} from "@/server/billing/errors";

// ── Phase 8 batch 8c.11c — CHANGE-ORDER ACTIONS (first copy of the 11b template) ──────
// Same shape as proposals/actions.ts: requireTenant()-only (COs are operator-level), the
// useActionState/FormData wrappers, the specific-allowlist operationalMessage + throw-e-on-unmatched,
// the redirect-vs-error split. CO-specific divergences: the error set, the lifecycle (no Revise —
// COs are forward deltas, 8c-D5; a "redo" is a NEW CO), and approve/decline map to the
// {accepted,declined} decision enum in the data layer (CF-8c.6.1; invisible to the operator).

export type ChangeOrderActionState = { error: string } | null;

const NUM = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const OPT = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

function operationalMessage(e: unknown): string {
  if (e instanceof ChangeOrderNotEditable) return "This change order can no longer be edited (it was already submitted, approved, declined, or withdrawn).";
  if (e instanceof ChangeOrderNotApprovable) return "This change order isn't awaiting a decision.";
  if (e instanceof ChangeOrderNotWithdrawable) return "This change order can no longer be withdrawn.";
  if (e instanceof Error) {
    if (e.message === "CHANGE_ORDER_NOT_FOUND" || e.message === "CHANGE_ORDER_LINE_ITEM_NOT_FOUND") {
      return "This change order no longer exists — please reload.";
    }
    if (e.message.startsWith("INVALID_LINE_")) return "Check the line values (quantity, unit price, markup, tax).";
  }
  return "";
}

/** Create a draft change order, then redirect to its detail. */
export async function createChangeOrderAction(
  jobId: string,
  _prev: ChangeOrderActionState,
  formData: FormData,
): Promise<ChangeOrderActionState> {
  const ctx = await requireTenant();
  let newId: string;
  try {
    const r = await createChangeOrder({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      proposalId: OPT(formData, "proposalId"),
      reason: OPT(formData, "reason"),
      scopeDeltaSnapshot: OPT(formData, "scopeDeltaSnapshot"),
      currency: OPT(formData, "currency") ?? undefined,
      createdByUserId: ctx.user.id,
    });
    newId = r.id;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
  redirect(`/jobs/${jobId}/change-orders/${newId}`);
}

/** Edit a draft change order's header. */
export async function updateChangeOrderDraftAction(
  changeOrderId: string,
  jobId: string,
  _prev: ChangeOrderActionState,
  formData: FormData,
): Promise<ChangeOrderActionState> {
  const ctx = await requireTenant();
  try {
    await updateChangeOrderDraft({
      tenantId: ctx.activeTenant.tenantId,
      id: changeOrderId,
      reason: OPT(formData, "reason"),
      scopeDeltaSnapshot: OPT(formData, "scopeDeltaSnapshot"),
    });
    revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** Add a line item to a draft change order. */
export async function addChangeOrderLineItemAction(
  changeOrderId: string,
  jobId: string,
  _prev: ChangeOrderActionState,
  formData: FormData,
): Promise<ChangeOrderActionState> {
  const ctx = await requireTenant();
  // Phase (ii): a picked trade (rate_sheet labor/trip) + BLANK price → defer to the agreed rate
  // (undefined ⇒ the data-layer resolver fills it). Otherwise preserve the historic blank→"0".
  const tradeId = OPT(formData, "tradeId");
  const priceRaw = NUM(formData, "unitPrice");
  const unitPrice = tradeId && priceRaw === "" ? undefined : priceRaw || "0";
  try {
    await addChangeOrderLineItem({
      tenantId: ctx.activeTenant.tenantId,
      changeOrderId,
      category: NUM(formData, "category") as Parameters<typeof addChangeOrderLineItem>[0]["category"],
      description: NUM(formData, "description"),
      quantity: NUM(formData, "quantity") || "1",
      unit: OPT(formData, "unit"),
      unitPrice,
      markupPercent: OPT(formData, "markupPercent"),
      taxRate: OPT(formData, "taxRate"),
      taxAmount: NUM(formData, "taxAmount") || "0",
      tradeId, // rateType is derived from category in the data layer (labor→hourly, trip→trip_charge)
    });
    revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** Update a draft change order's line item. (Action-ready; inline-edit UI deferred — see 8c.11c notes.) */
export async function updateChangeOrderLineItemAction(
  lineId: string,
  changeOrderId: string,
  jobId: string,
  _prev: ChangeOrderActionState,
  formData: FormData,
): Promise<ChangeOrderActionState> {
  const ctx = await requireTenant();
  try {
    await updateChangeOrderLineItem({
      tenantId: ctx.activeTenant.tenantId,
      id: lineId,
      description: OPT(formData, "description") ?? undefined,
      quantity: OPT(formData, "quantity") ?? undefined,
      unitPrice: OPT(formData, "unitPrice") ?? undefined,
      markupPercent: OPT(formData, "markupPercent"),
      taxRate: OPT(formData, "taxRate"),
      taxAmount: OPT(formData, "taxAmount") ?? undefined,
    });
    revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** Remove a draft change order's line item. (No form inputs — bound id only.) */
export async function removeChangeOrderLineItemAction(
  lineId: string,
  changeOrderId: string,
  jobId: string,
): Promise<ChangeOrderActionState> {
  const ctx = await requireTenant();
  try {
    await removeChangeOrderLineItem({ tenantId: ctx.activeTenant.tenantId, id: lineId });
    revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** draft → submitted. */
export async function submitChangeOrderAction(changeOrderId: string, jobId: string): Promise<ChangeOrderActionState> {
  const ctx = await requireTenant();
  try {
    await submitChangeOrder({ tenantId: ctx.activeTenant.tenantId, id: changeOrderId, actorUserId: ctx.user.id });
    revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
    revalidatePath(`/jobs/${jobId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** submitted → approved (data layer maps to decision='accepted', CF-8c.6.1). */
export async function approveChangeOrderAction(changeOrderId: string, jobId: string): Promise<ChangeOrderActionState> {
  const ctx = await requireTenant();
  try {
    await approveChangeOrder({ tenantId: ctx.activeTenant.tenantId, id: changeOrderId, approverUserId: ctx.user.id, decidedAt: new Date() });
    revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
    revalidatePath(`/jobs/${jobId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** submitted → declined. */
export async function declineChangeOrderAction(changeOrderId: string, jobId: string): Promise<ChangeOrderActionState> {
  const ctx = await requireTenant();
  try {
    await declineChangeOrder({ tenantId: ctx.activeTenant.tenantId, id: changeOrderId, approverUserId: ctx.user.id, decidedAt: new Date() });
    revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
    revalidatePath(`/jobs/${jobId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** draft/submitted → withdrawn. */
export async function withdrawChangeOrderAction(changeOrderId: string, jobId: string): Promise<ChangeOrderActionState> {
  const ctx = await requireTenant();
  try {
    await withdrawChangeOrder({ tenantId: ctx.activeTenant.tenantId, id: changeOrderId, actorUserId: ctx.user.id });
    revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
    revalidatePath(`/jobs/${jobId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}
