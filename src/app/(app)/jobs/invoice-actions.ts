"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { runInvoiceCreator } from "@/server/agents/invoice-creator";
import { NoActivePromptError } from "@/server/agents/config/errors";
import { getInvoiceDraft, discardInvoiceDraft } from "@/server/agents/invoice-creator/drafts";
import { createInvoiceReview } from "@/server/agents/invoice-creator/reviews";
import { resolveEditedInvoice } from "@/server/agents/invoice-creator/edits";
import { publishInvoiceDraft } from "@/server/agents/invoice-creator/publish";
import { DraftNotApproved, InvoiceAlreadyMaterialized } from "@/server/agents/invoice-creator/errors";

// ── Phase 26 batch 2b-i — invoice creator server actions ──────────────────────────────
// Mirrors scope-actions.ts: {error}|null state, requireTenant, try/catch error-mapping,
// revalidatePath. 2b-i ships trigger + approve/reject/discard; PUBLISH lands in 2b-ii.

export type InvoiceActionState = { error: string } | null;

// Trigger the invoice creator on a (job, vendor invoice). Bound (jobId, vendorInvoiceId).
// LLM/provider errors are caught and surfaced (the run is already recorded status='failed'
// inside runInvoiceCreator); a missing active prompt is fail-closed (NoActivePromptError).
export async function generateInvoiceAction(
  jobId: string,
  vendorInvoiceId: string,
): Promise<InvoiceActionState> {
  const ctx = await requireTenant();
  try {
    await runInvoiceCreator({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      vendorInvoiceId,
      triggeredByUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof NoActivePromptError) {
      return { error: "Invoice drafting isn't configured (no active prompt)." };
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "JOB_NOT_FOUND") return { error: "Job not found in this tenant." };
    if (msg === "VENDOR_INVOICE_NOT_FOUND") return { error: "Vendor invoice not found on this job." };
    if (msg === "JOB_NOT_COMPLETED") return { error: "The job must be completed before invoicing the client." };
    return { error: `Invoice drafting failed: ${msg}` };
  }
  revalidatePath(`/jobs/${jobId}`);
  return null;
}

// Approve a draft. Reads the editor's serialized invoice from formData; resolveEditedInvoice
// validates (≥1 line, valid category + description, well-formed numbers) and computes
// editedContent NULL-IF-UNCHANGED vs proposed_invoice (mirrors approveScopeDraftAction).
// Per D4, operator-edited numbers ARE accepted. Bound (jobId, draftId).
export async function approveInvoiceDraftAction(
  jobId: string,
  draftId: string,
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;
  const raw = (formData.get("editedContent") as string | null) ?? "{}";
  try {
    const draft = await getInvoiceDraft(tenantId, draftId);
    if (!draft) return { error: "Draft not found." };
    const res = resolveEditedInvoice(raw, draft.proposedInvoice);
    if (!res.ok) {
      if (res.error === "INVOICE_REQUIRES_LINES") {
        return { error: "An invoice needs at least one line, each with a description and category." };
      }
      if (res.error === "INVALID_LINE_NUMBERS") {
        return { error: "Each line needs a valid quantity and unit price." };
      }
      return { error: "Could not read the edited invoice." };
    }
    await createInvoiceReview({
      tenantId,
      draftId,
      reviewerUserId: ctx.user.id,
      decision: "approve",
      editedContent: res.editedContent,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "DRAFT_NOT_PENDING_REVIEW") return { error: "This draft is no longer pending review." };
    if (msg === "DRAFT_NOT_FOUND") return { error: "Draft not found." };
    throw err;
  }
  revalidatePath(`/jobs/${jobId}`);
  return null;
}

// Reject a draft with a required reason (review_notes). Bound (jobId, draftId).
export async function rejectInvoiceDraftAction(
  jobId: string,
  draftId: string,
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const ctx = await requireTenant();
  const reviewNotes = ((formData.get("reviewNotes") as string | null) ?? "").trim();
  if (!reviewNotes) return { error: "A reason is required to reject." };
  try {
    await createInvoiceReview({
      tenantId: ctx.activeTenant.tenantId,
      draftId,
      reviewerUserId: ctx.user.id,
      decision: "reject",
      reviewNotes,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "DRAFT_NOT_PENDING_REVIEW") return { error: "This draft is no longer pending review." };
    if (msg === "DRAFT_NOT_FOUND") return { error: "Draft not found." };
    throw err;
  }
  revalidatePath(`/jobs/${jobId}`);
  return null;
}

// Publish (MATERIALIZE) an approved draft into a client_invoices DRAFT — the human-gated draft
// → client_invoices path. This does NOT issue/send the invoice: issuance (draft → sent) is the
// existing accounting-role-gated sendClientInvoiceAction (jobs/[id]/client-invoices/actions.ts),
// invoked from the client-invoice screen. Bound (jobId, draftId); no extra params.
export async function publishInvoiceDraftAction(jobId: string, draftId: string): Promise<InvoiceActionState> {
  const ctx = await requireTenant();
  try {
    await publishInvoiceDraft({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      draftId,
      actorUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof InvoiceAlreadyMaterialized) {
      return { error: "This draft has already been turned into a client invoice. Open it from Client Invoices to issue it." };
    }
    if (err instanceof DraftNotApproved) return { error: "Only approved drafts can be published." };
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "DRAFT_NOT_FOUND") return { error: "Draft not found." };
    if (msg === "JOB_NOT_FOUND") return { error: "Job not found in this tenant." };
    throw err;
  }
  revalidatePath(`/jobs/${jobId}`);
  return null;
}

// Discard a draft (silent dismissal, no reason). Bound (jobId, draftId); no extra params.
export async function discardInvoiceDraftAction(jobId: string, draftId: string): Promise<InvoiceActionState> {
  const ctx = await requireTenant();
  try {
    await discardInvoiceDraft(ctx.activeTenant.tenantId, draftId, ctx.user.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "DRAFT_NOT_DISCARDABLE") return { error: "This draft cannot be discarded in its current state." };
    if (msg === "DRAFT_NOT_FOUND") return { error: "Draft not found." };
    throw err;
  }
  revalidatePath(`/jobs/${jobId}`);
  return null;
}
