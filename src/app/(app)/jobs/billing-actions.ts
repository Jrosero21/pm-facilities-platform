"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { isAccountingRole } from "@/server/billing/role-gates";
import { sendClientInvoice } from "@/server/billing/client-invoices";

// ── Phase 8 batch 8c.8 — BILLING ACTIONS (the platform's first ENFORCED role gate) ────
// Issuing a client invoice (draft → sent) is accounting-gated (8c-D2 / OQ-23/24): `accounting`
// role OR `super_admin` auto-pass; NO tenant_admin. The policy lives in the pure, testable
// predicate isAccountingRole (role-gates.ts) — this action IS the live enforcement; the data-layer
// sendClientInvoice trusts its caller (no auth check there). requireTenant supplies auth + the
// active-tenant context (and redirects /login or /no-tenant); the predicate gates the role.

/** Issue a draft client invoice. Accounting-gated; redirects /forbidden for everyone else. */
export async function sendClientInvoiceAction(input: { id: string; jobId: string }): Promise<void> {
  const ctx = await requireTenant();
  if (!isAccountingRole(ctx.roleKeys, ctx.isSuperAdmin)) redirect("/forbidden");
  await sendClientInvoice({ tenantId: ctx.activeTenant.tenantId, id: input.id, actorUserId: ctx.user.id });
  revalidatePath(`/jobs/${input.jobId}`);
}
