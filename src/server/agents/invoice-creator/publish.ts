import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLogs, invoiceDrafts } from "@/server/schema";
import { createClientInvoice, addClientInvoiceLineItem } from "@/server/billing/client-invoices";
import { loadJobBillingContext } from "@/server/billing/client-rates";
import { getInvoiceDraft, type ProposedInvoice } from "./drafts";
import { getApproveReviewForInvoiceDraft } from "./reviews";
import { DraftNotApproved, InvoiceAlreadyMaterialized } from "./errors";

// ── Phase 26 batch 2b-ii — publishInvoiceDraft ────────────────────────────────────────
// The human-gated path that MATERIALIZES an APPROVED agent draft into a canonical
// client_invoices row at status='draft'. It does NOT issue/send — issuance (draft → sent) is
// the existing accounting-role-gated sendClientInvoice, invoked separately from the action
// layer (sendClientInvoiceAction). The agent can never reach this (§2.9 / R-6.15).
//
// MONEY DISCIPLINE:
//  - All dollar figures come from the APPROVED CONTENT (the approve review's edited_content if
//    the operator corrected anything — the gold signal, D4 — else the draft's proposed_invoice,
//    which carries the vendor-copied costs). The LLM never supplied a number (D1).
//  - markup is RE-RESOLVED FRESH (D2): addClientInvoiceLineItem is called with
//    markupPercent: undefined, so the billing writer re-snapshots the client's CURRENT rule.
//    The draft's preview markupPercent is never passed as the billed markup.
//  - recalculateClientInvoiceTotals (the sole money writer) runs inside each addClientInvoiceLineItem.
//
// ATOMICITY (§2.6 — deliberate NON-atomic sequence; we do NOT refactor the billing writers to
// take an external tx): guard → createClientInvoice → N×addClientInvoiceLineItem → finalize txn.
// The client_invoices row is created (e–f) BEFORE the draft is flipped to published (g). If the
// process dies in the e–f window, the draft's published_client_invoice_id is still NULL, so a
// retry re-materializes and leaves the FIRST client invoice ORPHANED (a never-issued DRAFT, safely
// operator-deletable). This is a documented known limitation, NOT a blocker (see closeout). The
// finalize txn's lock+recheck is the single authority for "this draft published exactly once."

export type PublishInvoiceResult = { clientInvoiceId: string };

/**
 * Materialize an APPROVED invoice draft into a client_invoices DRAFT. Throws DRAFT_NOT_FOUND,
 * DraftNotApproved, InvoiceAlreadyMaterialized.
 */
export async function publishInvoiceDraft(input: {
  tenantId: string;
  jobId: string;
  draftId: string;
  actorUserId: string;
}): Promise<PublishInvoiceResult> {
  // a. load the draft (read-only, before any write). Wrong tenant/job → not found.
  const draft = await getInvoiceDraft(input.tenantId, input.draftId);
  if (!draft || draft.jobId !== input.jobId) throw new Error("DRAFT_NOT_FOUND");

  // b. idempotency guard (pre-flight): already materialized → refuse double-materialize.
  if (draft.publishedClientInvoiceId != null) throw new InvoiceAlreadyMaterialized(input.draftId);

  // c. status guard: only an approved draft materializes.
  if (draft.status !== "approved") throw new DraftNotApproved(input.draftId);

  // d. resolve the APPROVED CONTENT — edited_content wins (operator corrections, D4); else the
  //    immutable proposed_invoice (vendor-copied costs).
  const approved = await getApproveReviewForInvoiceDraft(input.tenantId, input.draftId);
  const content: ProposedInvoice = approved?.editedContent ?? draft.proposedInvoice;

  // e. create the canonical client invoice (own txn; lands status='draft'; snapshots
  //    payment_terms_days from the client's billing rule).
  const { id: clientInvoiceId } = await createClientInvoice({
    tenantId: input.tenantId,
    jobId: input.jobId,
    clientId: draft.clientId,
    createdByUserId: input.actorUserId,
  });

  // f. add each line (own txn each; recalculateClientInvoiceTotals runs inside).
  //    MARKUP fork on the job's effective billing model (Phase ii Unit 2b):
  //    - rate_sheet → markupPercent: null (NO markup on ANY line — labor bills the agreed rate,
  //      materials are operator judgment; neither is marked up). tradeId/rateType are threaded so the
  //      writer re-confirms the agreed rate server-side and PERSISTS provenance on a kept labor line
  //      (a typed-over price re-verifies false → no provenance, still null markup under rate_sheet).
  //    - cost_plus / flat → markupPercent: UNDEFINED → the writer re-snapshots the client's CURRENT
  //      rule fresh (D2), and tradeId/rateType are absent on those lines, so the call is unchanged.
  const billingCtx = await loadJobBillingContext({ tenantId: input.tenantId, jobId: input.jobId });
  const isRateSheet = billingCtx?.billingModel === "rate_sheet";
  for (const line of content.lineItems) {
    await addClientInvoiceLineItem({
      tenantId: input.tenantId,
      clientInvoiceId,
      category: line.category,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      unit: line.unit ?? undefined,
      markupPercent: isRateSheet ? null : undefined,
      tradeId: line.tradeId ?? undefined,
      rateType: line.rateType ?? undefined,
    });
  }

  // g. finalize — the single authority for "published exactly once". Lock the draft, re-check it
  //    is still approved AND not-yet-materialized (a concurrent publish between b and g loses
  //    here), stamp the provenance link + status, audit INSIDE the txn (R-6.7).
  await db.transaction(async (tx) => {
    const locked = await tx
      .select({ status: invoiceDrafts.status, publishedClientInvoiceId: invoiceDrafts.publishedClientInvoiceId })
      .from(invoiceDrafts)
      .where(and(eq(invoiceDrafts.tenantId, input.tenantId), eq(invoiceDrafts.id, input.draftId)))
      .for("update");
    if (!locked[0]) throw new Error("DRAFT_NOT_FOUND");
    if (locked[0].status !== "approved") throw new DraftNotApproved(input.draftId);
    if (locked[0].publishedClientInvoiceId != null) throw new InvoiceAlreadyMaterialized(input.draftId);

    const res = await tx
      .update(invoiceDrafts)
      .set({ status: "published", publishedClientInvoiceId: clientInvoiceId })
      .where(
        and(
          eq(invoiceDrafts.tenantId, input.tenantId),
          eq(invoiceDrafts.id, input.draftId),
          isNull(invoiceDrafts.publishedClientInvoiceId), // belt-and-suspenders: only flip if still null
        ),
      );
    // The WHERE excludes the new value, so a matching row necessarily changed; 0 rows means a
    // concurrent publish already stamped it (the lock above should already have caught it).
    if (res.rowCount !== 1) throw new InvoiceAlreadyMaterialized(input.draftId);

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "invoice_draft.published",
      targetType: "invoice_draft",
      targetId: input.draftId,
      metadata: {
        clientInvoiceId,
        lineCount: content.lineItems.length,
        usedEditedContent: approved?.editedContent != null,
      },
    });
  });

  return { clientInvoiceId };
}
