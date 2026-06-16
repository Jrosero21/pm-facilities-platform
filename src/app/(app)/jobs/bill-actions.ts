"use server";

import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { canSeeFinancials } from "@/server/role-predicates";
import { getJob } from "@/server/jobs";
import { createClientInvoice, addClientInvoiceLineItem } from "@/server/billing/client-invoices";
import { buildJobBillPrefill } from "@/server/analytics/job-bill-prefill";
import type { RateType } from "@/server/billing/client-rates";
import type { ClientInvoiceLineItemInput } from "@/server/billing/client-invoices";

// ── CF-27.16 Piece 3 — "Bill this job" (job-first client-invoice entry) ─────────────────
// Creates a DRAFT client invoice for the whole job, PRE-FILLED with all work-to-date, then redirects
// to the draft for the operator to review / trim (remove lines) / send. Job-first: no vendor-invoice
// precondition (Job #4 billable). Deterministic pre-fill (buildJobBillPrefill) → addClientInvoiceLineItem
// per line (the agreed-rate + provenance authority). A line that can't be priced (no rate, no cost) is
// added at $0.00 (never-block — the operator prices it), never a hard failure. The draft is a normal
// client invoice: the existing review/send/cost-plus-advisory flow takes over. canSeeFinancials-gated.
export async function billJobAction(jobId: string): Promise<void> {
  const ctx = await requireTenant();
  if (!canSeeFinancials(ctx)) redirect("/forbidden");
  const tenantId = ctx.activeTenant.tenantId;

  const job = await getJob(tenantId, jobId);
  if (!job) redirect(`/jobs/${jobId}`);

  const { id: clientInvoiceId } = await createClientInvoice({
    tenantId,
    jobId,
    clientId: job.clientId,
    createdByUserId: ctx.user.id,
  });

  const prefill = await buildJobBillPrefill(tenantId, jobId);
  for (const line of prefill) {
    const input: { tenantId: string; clientInvoiceId: string } & ClientInvoiceLineItemInput = {
      tenantId,
      clientInvoiceId,
      category: line.category as ClientInvoiceLineItemInput["category"],
      description: line.description,
      quantity: line.quantity,
      unit: line.unit ?? null,
      unitPrice: line.unitPrice,
      markupPercent: line.markupPercent,
      tradeId: line.tradeId ?? null,
      rateType: line.rateType as RateType | undefined,
    };
    try {
      await addClientInvoiceLineItem(input);
    } catch (err) {
      // never-block: a line with no resolvable rate and no cost basis can't be priced — add it at
      // $0.00 so the operator prices it on review, rather than failing the whole bill.
      if (err instanceof Error && err.message === "INVALID_LINE_UNIT_PRICE") {
        await addClientInvoiceLineItem({ ...input, unitPrice: "0.00" });
      } else {
        throw err;
      }
    }
  }

  redirect(`/jobs/${jobId}/client-invoices/${clientInvoiceId}`);
}
