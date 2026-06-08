"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { createClientRate, archiveClientRate, setClientBillingModel } from "@/server/billing/client-rates";

// ── Phase (i) rate-sheet — CLIENT RATE + BILLING-MODEL ACTIONS — requireTenant-only ───
// Operator admin (mirrors the billing-rules / NTE-rule actions). The writer emits audit_logs.
// "use server" → ONLY async exports (no sync helpers — the v2.11.0 boundary lesson).

export type ClientRateActionState = { error: string } | null;

const STR = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
// type=date sends 'YYYY-MM-DD' (or ""). client_rates.effective_date/expiry_date are drizzle mode-'date'
// → Date | null; parse at the action boundary.
const toDate = (raw: string): Date | null => (raw === "" ? null : new Date(raw));

function operationalMessage(e: unknown): string {
  if (e instanceof Error) {
    switch (e.message) {
      case "RATE_TYPE_INVALID": return "Choose a valid rate type.";
      case "AMOUNT_INVALID": return "Rate amount must be a positive dollar amount (up to 2 decimals).";
      case "TRADE_NOT_FOUND": return "That trade no longer exists.";
      case "CLIENT_RATE_NOT_FOUND": return "This rate no longer exists — please reload.";
      case "BILLING_MODEL_INVALID": return "Choose a valid billing model.";
      case "CLIENT_NOT_FOUND": return "Client not found in this tenant.";
    }
  }
  return "";
}

/** Create a rate, then redirect to the rate sheet (mirrors createClientBillingRuleAction). */
export async function createClientRateAction(
  clientId: string,
  _prev: ClientRateActionState,
  formData: FormData,
): Promise<ClientRateActionState> {
  const ctx = await requireTenant();
  const tradeId = STR(formData, "tradeId"); // "" = general / all-trade rate
  const unit = STR(formData, "unit");
  const notes = STR(formData, "notes");
  try {
    await createClientRate({
      tenantId: ctx.activeTenant.tenantId,
      clientId,
      actorUserId: ctx.user.id,
      tradeId: tradeId === "" ? null : tradeId,
      rateType: STR(formData, "rateType"),
      amount: STR(formData, "amount"),
      unit: unit === "" ? null : unit,
      effectiveDate: toDate(STR(formData, "effectiveDate")),
      expiryDate: toDate(STR(formData, "expiryDate")),
      notes: notes === "" ? null : notes,
    });
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
  redirect(`/clients/${clientId}/rates`);
}

/** Archive a rate. */
export async function archiveClientRateAction(
  rateId: string,
  clientId: string,
): Promise<ClientRateActionState> {
  const ctx = await requireTenant();
  try {
    await archiveClientRate({ tenantId: ctx.activeTenant.tenantId, rateId, actorUserId: ctx.user.id });
    revalidatePath(`/clients/${clientId}/rates`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** Set the client's billing model (the selector on the client detail page). */
export async function setBillingModelAction(
  clientId: string,
  _prev: ClientRateActionState,
  formData: FormData,
): Promise<ClientRateActionState> {
  const ctx = await requireTenant();
  try {
    await setClientBillingModel({
      tenantId: ctx.activeTenant.tenantId,
      clientId,
      actorUserId: ctx.user.id,
      billingModel: STR(formData, "billingModel"),
    });
    revalidatePath(`/clients/${clientId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}
