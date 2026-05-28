"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { activateClientNteRule, archiveClientNteRule, createClientNteRule } from "@/server/billing/nte";
import { ActivationTargetMismatch, SingleActiveInvariantViolated } from "@/server/billing/errors";

// ── Phase 8 batch 8c.11e — CLIENT NTE-RULE ADMIN ACTIONS — requireTenant-only ─────────
// NTE-rule configuration is operator admin (Decision 1: requireTenant-only, NOT accounting-gated;
// it governs FUTURE commitments, it is not an in-the-moment money action). Same 11b template:
// useActionState/FormData, specific operationalMessage allowlist + throw-e-on-unmatched. The
// lifecycle writers emit audit_logs (CF-8c.1.1, closed at 8c.11e).

export type NteRuleActionState = { error: string } | null;

const NUM = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const OPT = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

function operationalMessage(e: unknown): string {
  if (e instanceof SingleActiveInvariantViolated) return "An active NTE rule already exists for this client/trade/priority — archive it first.";
  if (e instanceof ActivationTargetMismatch) return "This rule can't be activated (it may already be active or has changed — please reload).";
  if (e instanceof Error) {
    if (e.message === "INVALID_NTE_AMOUNT") return "Enter a valid NTE amount (positive, up to 2 decimals).";
    if (e.message === "INVALID_CURRENCY") return "Enter a 3-letter currency code (e.g. USD).";
    if (e.message === "CLIENT_NTE_RULE_NOT_FOUND") return "This NTE rule no longer exists — please reload.";
  }
  return "";
}

/** Create a new active NTE rule (supersedes any prior active for the tuple), then redirect to the list. */
export async function createClientNteRuleAction(
  clientId: string,
  _prev: NteRuleActionState,
  formData: FormData,
): Promise<NteRuleActionState> {
  const ctx = await requireTenant();
  try {
    await createClientNteRule({
      tenantId: ctx.activeTenant.tenantId,
      clientId,
      tradeId: NUM(formData, "tradeId"),
      priorityId: NUM(formData, "priorityId"),
      clientLocationId: OPT(formData, "clientLocationId"),
      nteAmount: NUM(formData, "nteAmount"),
      currency: OPT(formData, "currency") ?? undefined,
      createdByUserId: ctx.user.id,
    });
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
  redirect(`/clients/${clientId}/nte-rules`);
}

/** Re-activate an archived rule (supersedes the active for its tuple). */
export async function activateClientNteRuleAction(
  id: string,
  clientId: string,
  tradeId: string,
  priorityId: string,
  clientLocationId: string | null,
): Promise<NteRuleActionState> {
  const ctx = await requireTenant();
  try {
    await activateClientNteRule({
      tenantId: ctx.activeTenant.tenantId,
      clientId,
      tradeId,
      priorityId,
      clientLocationId,
      id,
      actorUserId: ctx.user.id,
    });
    revalidatePath(`/clients/${clientId}/nte-rules`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** Archive a rule (active|archived → archived). */
export async function archiveClientNteRuleAction(id: string, clientId: string): Promise<NteRuleActionState> {
  const ctx = await requireTenant();
  try {
    await archiveClientNteRule({ tenantId: ctx.activeTenant.tenantId, id, actorUserId: ctx.user.id });
    revalidatePath(`/clients/${clientId}/nte-rules`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}
