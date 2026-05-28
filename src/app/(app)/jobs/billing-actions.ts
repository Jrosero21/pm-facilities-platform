"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { enforceAccountingGate, requireTenant } from "@/server/auth-context";
import { recordPayment, type PaymentDirection } from "@/server/billing/payments";
import { markBillingClosed } from "@/server/billing/close";
import {
  JobAlreadyBillingClosed,
  PaymentAmountInvalid,
  PaymentDirectionMismatch,
  PaymentInvoiceNotPayable,
  PaymentInvoiceRefInvalid,
} from "@/server/billing/errors";

// ── Phase 8 — ACCOUNTING-GATED BILLING ACTIONS (payment + close) ──────────────────────
// 8c.11e: FormData-reshaped to the useActionState template (the deferred half of the §5 hybrid;
// the gate was already centralized to enforceAccountingGate at 8c.11d). Both stay accounting-gated.

export type PaymentActionState = { error: string } | null;
export type BillingCloseActionState = { error: string } | null;

const NUM = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const OPT = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

function paymentMessage(e: unknown): string {
  if (e instanceof PaymentInvoiceRefInvalid) return "Select exactly one invoice for this payment.";
  if (e instanceof PaymentDirectionMismatch) return "The payment direction doesn't match the selected invoice.";
  if (e instanceof PaymentInvoiceNotPayable) return "This invoice can't be paid in its current status (vendor must be approved; client must be sent).";
  if (e instanceof PaymentAmountInvalid) return "Enter a valid positive amount.";
  return "";
}

/** Record a payment (XOR direction → invoice ref). Accounting-gated. Redirects to the job on success.
 *  `jobId` is the revalidate/redirect target only — recordPayment derives job_id from the invoice. */
export async function recordPaymentAction(
  jobId: string,
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const ctx = await requireTenant();
  enforceAccountingGate(ctx);
  const direction = NUM(formData, "direction") as PaymentDirection;
  const vendorInvoiceId = direction === "outbound" ? OPT(formData, "vendorInvoiceId") : null;
  const clientInvoiceId = direction === "inbound" ? OPT(formData, "clientInvoiceId") : null;
  try {
    await recordPayment({
      tenantId: ctx.activeTenant.tenantId,
      direction,
      vendorInvoiceId,
      clientInvoiceId,
      amount: NUM(formData, "amount"),
      method: OPT(formData, "method"),
      reference: OPT(formData, "reference"),
      recordedByUserId: ctx.user.id,
    });
  } catch (e) {
    const m = paymentMessage(e);
    if (m) return { error: m };
    throw e;
  }
  redirect(`/jobs/${jobId}`);
}

/** Close billing for a job (→ CLOSED_BILLED). Accounting-gated. note is optional (FormData). */
export async function markBillingClosedAction(
  jobId: string,
  _prev: BillingCloseActionState,
  formData: FormData,
): Promise<BillingCloseActionState> {
  const ctx = await requireTenant();
  enforceAccountingGate(ctx);
  try {
    await markBillingClosed({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      actorUserId: ctx.user.id,
      note: OPT(formData, "note"),
    });
    revalidatePath(`/jobs/${jobId}`);
    return null;
  } catch (e) {
    if (e instanceof JobAlreadyBillingClosed) return { error: "Billing is already closed for this job." };
    throw e;
  }
}
