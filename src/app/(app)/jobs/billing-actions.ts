"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { isAccountingRole } from "@/server/billing/role-gates";
import { sendClientInvoice } from "@/server/billing/client-invoices";
import { recordPayment, type PaymentDirection } from "@/server/billing/payments";
import { markBillingClosed } from "@/server/billing/close";

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

// ── Phase 8 batch 8c.9 — gate #2: recording payments is accounting-gated (OQ-24) ──────
// Same pattern: requireTenant() + the isAccountingRole predicate → /forbidden. `jobId` here is
// used ONLY for revalidatePath — it is NOT forwarded to recordPayment (the data layer derives
// job_id from the referenced invoice; recordPayment's type has no jobId field — Catch 3).

/** Record a payment against an invoice. Accounting-gated; redirects /forbidden for everyone else. */
export async function recordPaymentAction(input: {
  direction: PaymentDirection;
  vendorInvoiceId?: string | null;
  clientInvoiceId?: string | null;
  amount: string;
  method?: string | null;
  reference?: string | null;
  jobId: string; // revalidate target only — NOT a recordPayment argument
}): Promise<void> {
  const ctx = await requireTenant();
  if (!isAccountingRole(ctx.roleKeys, ctx.isSuperAdmin)) redirect("/forbidden");
  await recordPayment({
    tenantId: ctx.activeTenant.tenantId,
    direction: input.direction,
    vendorInvoiceId: input.vendorInvoiceId,
    clientInvoiceId: input.clientInvoiceId,
    amount: input.amount,
    method: input.method,
    reference: input.reference,
    recordedByUserId: ctx.user.id,
  });
  revalidatePath(`/jobs/${input.jobId}`);
}

// ── Phase 8 batch 8c.10 — gate #3: closing billing is accounting-gated (OQ-25) ────────
// Same pattern: requireTenant() + the isAccountingRole predicate → /forbidden. Third reuse of
// the predicate, fully validating the 8c.8 extraction. markBillingClosed is job-scoped, so jobId
// is a genuine argument (the job IS the close target) — unlike the payment action's revalidate-only jobId.

/** Close billing for a job (→ CLOSED_BILLED). Accounting-gated; redirects /forbidden otherwise. */
export async function markBillingClosedAction(input: { jobId: string; note?: string | null }): Promise<void> {
  const ctx = await requireTenant();
  if (!isAccountingRole(ctx.roleKeys, ctx.isSuperAdmin)) redirect("/forbidden");
  await markBillingClosed({ tenantId: ctx.activeTenant.tenantId, jobId: input.jobId, actorUserId: ctx.user.id, note: input.note ?? null });
  revalidatePath(`/jobs/${input.jobId}`);
}
