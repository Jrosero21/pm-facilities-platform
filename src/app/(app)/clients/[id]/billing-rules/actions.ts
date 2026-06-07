"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import {
  archiveClientBillingRule,
  createClientBillingRule,
  setDefaultClientBillingRule,
} from "@/server/billing/billing-rules";

// ── CF-27.7 Seam 0 — CLIENT BILLING-RULE ADMIN ACTIONS — requireTenant-only ───────────
// Operator admin (mirrors NTE-rule actions: requireTenant-only, NOT accounting-gated — it governs
// FUTURE billing config, not an in-the-moment money action). The writer emits audit_logs.

export type BillingRuleActionState = { error: string } | null;

const STR = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function operationalMessage(e: unknown): string {
  if (e instanceof Error) {
    switch (e.message) {
      case "NAME_REQUIRED": return "A rule name is required.";
      case "MARKUP_REQUIRED": return "Enter a markup percentage.";
      case "MARKUP_INVALID": return "Markup must be a non-negative percent (up to 3 decimals, max 999.999).";
      case "PAYMENT_TERMS_INVALID": return "Payment terms must be a whole number of days.";
      case "EMERGENCY_MULTIPLIER_INVALID": return "Emergency multiplier must be a number like 1.50.";
      case "CLIENT_BILLING_RULE_NOT_FOUND": return "This billing rule no longer exists — please reload.";
      case "CLIENT_BILLING_RULE_NOT_ACTIVE": return "Only an active rule can be set as default.";
    }
  }
  return "";
}

/** Create a billing rule, then redirect to the list (mirrors createClientNteRuleAction). */
export async function createClientBillingRuleAction(
  clientId: string,
  _prev: BillingRuleActionState,
  formData: FormData,
): Promise<BillingRuleActionState> {
  const ctx = await requireTenant();
  const paymentTermsRaw = STR(formData, "paymentTermsDays");
  const emergencyRaw = STR(formData, "emergencyNteMultiplier");
  try {
    await createClientBillingRule({
      tenantId: ctx.activeTenant.tenantId,
      clientId,
      actorUserId: ctx.user.id,
      name: STR(formData, "name"),
      markupPercent: STR(formData, "markupPercent"),
      paymentTermsDays: paymentTermsRaw === "" ? undefined : Number(paymentTermsRaw),
      isTaxExempt: formData.get("isTaxExempt") != null,
      emergencyNteMultiplier: emergencyRaw === "" ? undefined : emergencyRaw,
      isDefault: formData.get("isDefault") != null,
    });
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
  redirect(`/clients/${clientId}/billing-rules`);
}

/** Make a rule the client's default. */
export async function setDefaultClientBillingRuleAction(
  ruleId: string,
  clientId: string,
): Promise<BillingRuleActionState> {
  const ctx = await requireTenant();
  try {
    await setDefaultClientBillingRule({ tenantId: ctx.activeTenant.tenantId, clientId, ruleId, actorUserId: ctx.user.id });
    revalidatePath(`/clients/${clientId}/billing-rules`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** Archive a rule (→ archived, clears default). */
export async function archiveClientBillingRuleAction(
  ruleId: string,
  clientId: string,
): Promise<BillingRuleActionState> {
  const ctx = await requireTenant();
  try {
    await archiveClientBillingRule({ tenantId: ctx.activeTenant.tenantId, ruleId, actorUserId: ctx.user.id });
    revalidatePath(`/clients/${clientId}/billing-rules`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}
