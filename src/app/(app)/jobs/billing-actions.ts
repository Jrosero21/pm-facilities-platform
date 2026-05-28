"use server";

import { revalidatePath } from "next/cache";
import { enforceAccountingGate, requireTenant } from "@/server/auth-context";
import { recordPayment, type PaymentDirection } from "@/server/billing/payments";
import { markBillingClosed } from "@/server/billing/close";

// ── Phase 8 — ACCOUNTING-GATED BILLING ACTIONS (payment + close) ──────────────────────
// 8c.11d: the gate is now the shared enforceAccountingGate(ctx) helper (auth-context.ts) — the
// policy still lives in the pure, unit-tested isAccountingRole predicate (8c-D2), but the
// redirect-on-fail is centralized + structurally verifiable across all gated sites. (The 8c.8
// client-invoice issue action relocated to client-invoices/actions.ts, reshaped to useActionState.)
// recordPaymentAction + markBillingClosedAction keep their typed-input shape here until 8c.11e
// FormData-reshapes them alongside the payment + billing-close UIs.

/** Record a payment against an invoice. Accounting-gated. `jobId` is revalidate-only — NOT
 *  forwarded to recordPayment (the data layer derives job_id from the referenced invoice). */
export async function recordPaymentAction(input: {
  direction: PaymentDirection;
  vendorInvoiceId?: string | null;
  clientInvoiceId?: string | null;
  amount: string;
  method?: string | null;
  reference?: string | null;
  jobId: string;
}): Promise<void> {
  const ctx = await requireTenant();
  enforceAccountingGate(ctx);
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

/** Close billing for a job (→ CLOSED_BILLED). Accounting-gated. */
export async function markBillingClosedAction(input: { jobId: string; note?: string | null }): Promise<void> {
  const ctx = await requireTenant();
  enforceAccountingGate(ctx);
  await markBillingClosed({ tenantId: ctx.activeTenant.tenantId, jobId: input.jobId, actorUserId: ctx.user.id, note: input.note ?? null });
  revalidatePath(`/jobs/${input.jobId}`);
}
