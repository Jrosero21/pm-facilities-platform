"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { getJobDetail } from "@/server/jobs";
import { runProposalGenerator } from "@/server/agents/proposal-generator";
import { NoActivePromptError } from "@/server/agents/config/errors";
import { getProposalDraft, discardProposalDraft } from "@/server/agents/proposal-generator/drafts";
import { createProposalReview } from "@/server/agents/proposal-generator/reviews";
import { resolveEditedProposal } from "@/server/agents/proposal-generator/edits";
import { publishProposalDraft } from "@/server/agents/proposal-generator/publish";
import {
  DraftNotApproved,
  ProposalAlreadyMaterialized,
  ProposalRequiresPricing,
} from "@/server/agents/proposal-generator/errors";
import { resolveClientMarkupDefault } from "@/server/billing/client-invoices";
import { resolveAgreedRateLineMarkups } from "@/server/billing/client-rates";
import { getEffectiveNte } from "@/server/billing/change-orders";
import { computeArLines, type ArLineInput } from "@/server/billing/totals";
import { decideProposalKind } from "@/server/billing/proposal-routing";

// ── Phase 27 batch 5a — proposal generator server actions ─────────────────────────────
// Mirrors invoice-actions.ts (structure) + scope-actions.ts (patterns): {error}|null state,
// requireTenant, try/catch error-mapping, revalidatePath. Trigger + approve/reject/discard +
// publish + a read-only routing PREVIEW. NO rendered review section this batch (referenced-only,
// matching Phase 26's invoice actions) — a cross-agent UI pass wires them.
//
// MONEY-SAFETY: these actions pass the operator-AUTHORED numbers through editedContent; the LLM
// draft (proposed_proposal) is untouched and number-free. The kind decision is the shared
// decideProposalKind helper — identical to publishProposalDraft (preview ≡ publish).

export type ProposalDraftActionState = { error: string } | null;

// Trigger the proposal generator on a job. Bound (jobId); useActionState passes prevState/formData,
// which this ignores (same pattern as generateScopeAction). A missing active prompt is fail-closed.
export async function generateProposalAction(jobId: string): Promise<ProposalDraftActionState> {
  const ctx = await requireTenant();
  try {
    await runProposalGenerator({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      triggeredByUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof NoActivePromptError) {
      return { error: "Proposal drafting isn't configured (no active prompt)." };
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "JOB_NOT_FOUND") return { error: "Job not found in this tenant." };
    if (msg === "JOB_NOT_BILLABLE") {
      return { error: "This job can't be proposed (it's new, cancelled, or closed)." };
    }
    return { error: `Proposal drafting failed: ${msg}` };
  }
  revalidatePath(`/jobs/${jobId}`);
  return null;
}

// Approve a draft. Reads the editor's serialized proposal from formData; resolveEditedProposal
// validates (≥1 line, valid category + description + scopePhrasing, well-formed numbers) and
// computes editedContent NULL-IF-UNCHANGED vs proposed_proposal. APPROVE records the review at
// decision='approve' — it does NOT publish (publish is the separate action below, mirroring
// scope/invoice). Per D4, operator-authored numbers ARE accepted. Bound (jobId, draftId).
export async function approveProposalDraftAction(
  jobId: string,
  draftId: string,
  _prev: ProposalDraftActionState,
  formData: FormData,
): Promise<ProposalDraftActionState> {
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;
  const raw = (formData.get("editedProposal") as string | null) ?? "{}";
  try {
    const draft = await getProposalDraft(tenantId, draftId);
    if (!draft) return { error: "Draft not found." };
    const res = resolveEditedProposal(raw, draft.proposedProposal);
    if (!res.ok) {
      if (res.error === "PROPOSAL_REQUIRES_LINES") {
        return { error: "A proposal needs at least one line, each with a description, scope, and category." };
      }
      if (res.error === "INVALID_LINE_NUMBERS") {
        return { error: "Each line needs a valid quantity and unit price." };
      }
      return { error: "Could not read the edited proposal." };
    }
    await createProposalReview({
      tenantId,
      proposalDraftId: draftId,
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
export async function rejectProposalDraftAction(
  jobId: string,
  draftId: string,
  _prev: ProposalDraftActionState,
  formData: FormData,
): Promise<ProposalDraftActionState> {
  const ctx = await requireTenant();
  const reviewNotes = ((formData.get("reviewNotes") as string | null) ?? "").trim();
  if (!reviewNotes) return { error: "A reason is required to reject." };
  try {
    await createProposalReview({
      tenantId: ctx.activeTenant.tenantId,
      proposalDraftId: draftId,
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

// Discard a draft (silent dismissal, no reason). Bound (jobId, draftId); no extra params.
export async function discardProposalDraftAction(
  jobId: string,
  draftId: string,
): Promise<ProposalDraftActionState> {
  const ctx = await requireTenant();
  try {
    await discardProposalDraft(ctx.activeTenant.tenantId, draftId, ctx.user.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "DRAFT_NOT_DISCARDABLE") return { error: "This draft cannot be discarded in its current state." };
    if (msg === "DRAFT_NOT_FOUND") return { error: "Draft not found." };
    throw err;
  }
  revalidatePath(`/jobs/${jobId}`);
  return null;
}

// Publish (MATERIALIZE) an approved draft into a canonical proposals row — the human-gated path.
// The NTE send-gate decides kind (internal vs client); forceClientReview (checkbox) overrides
// TOWARD the client review flow. Bound (jobId, draftId); reads forceClientReview from formData.
export async function publishProposalDraftAction(
  jobId: string,
  draftId: string,
  _prev: ProposalDraftActionState,
  formData: FormData,
): Promise<ProposalDraftActionState> {
  const ctx = await requireTenant();
  const raw = formData.get("forceClientReview");
  const forceClientReview = raw === "true" || raw === "on" || raw === "1";
  try {
    await publishProposalDraft({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      draftId,
      actorUserId: ctx.user.id,
      forceClientReview,
    });
  } catch (err) {
    if (err instanceof ProposalAlreadyMaterialized) {
      return { error: "This draft has already been published into a proposal." };
    }
    if (err instanceof DraftNotApproved) return { error: "Only approved drafts can be published." };
    if (err instanceof ProposalRequiresPricing) {
      return { error: "Add a valid quantity and unit price to every line before publishing." };
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "DRAFT_NOT_FOUND") return { error: "Draft not found." };
    if (msg === "JOB_NOT_FOUND") return { error: "Job not found in this tenant." };
    throw err;
  }
  revalidatePath(`/jobs/${jobId}`);
  return null;
}

// ── Read-only NTE routing PREVIEW (no publish, no writes) ─────────────────────────────
// What a future review UI calls for the live "routes INTERNAL/CLIENT" indicator. Validates the
// editor's current lines, computes the total with the SHARED computeArLines primitive (money math
// server-side ONLY — never reimplemented client-side), reads the effective NTE, and decides the
// kind with the SAME decideProposalKind helper publish uses (preview ≡ publish). willRouteIfForced
// is always "client" — the override only ever forces toward review.
export type ProposalRoutingPreview =
  | {
      ok: true;
      total: string;
      effectiveNte: string | null;
      willRoute: "client" | "internal";
      willRouteIfForced: "client";
    }
  | { ok: false; error: string };

export async function previewProposalRoutingAction(
  jobId: string,
  draftId: string,
  serializedLines: string,
): Promise<ProposalRoutingPreview> {
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;

  const draft = await getProposalDraft(tenantId, draftId);
  if (!draft || draft.jobId !== jobId) return { ok: false, error: "Draft not found." };

  const res = resolveEditedProposal(serializedLines, draft.proposedProposal);
  if (!res.ok) {
    if (res.error === "PROPOSAL_REQUIRES_LINES") {
      return { ok: false, error: "Add at least one line with a description, scope, and category." };
    }
    if (res.error === "INVALID_LINE_NUMBERS") {
      return { ok: false, error: "Add a valid quantity and unit price to every line to preview routing." };
    }
    return { ok: false, error: "Could not read the edited proposal." };
  }
  // editedContent is null only when the lines equal the (number-free) draft — i.e. unpriced; the
  // validator would already have rejected that, but guard defensively.
  const content = res.editedContent;
  if (!content) return { ok: false, error: "Add pricing to preview routing." };

  const job = await getJobDetail(tenantId, jobId);
  if (!job) return { ok: false, error: "Job not found in this tenant." };

  const markupResolved = await resolveClientMarkupDefault(tenantId, job.clientId);
  // Phase (ii) Unit 2a — per-line billed markup: "0" for a confirmed agreed-rate labor/trip line,
  // else the rule default. SHARED with publishProposalDraft (f2) so this preview's total is the
  // byte-identical basis the publish gate will use (preview ≡ publish — they can never disagree).
  const lineMarkups = await resolveAgreedRateLineMarkups({
    tenantId,
    jobId,
    ruleMarkupPercent: markupResolved,
    lines: content.lineItems.map((ln) => ({
      category: ln.category,
      unitPrice: ln.unitPrice ?? "",
      tradeId: ln.tradeId,
      rateType: ln.rateType,
    })),
  });
  const arLines: ArLineInput[] = content.lineItems.map((ln, i) => ({
    id: String(i),
    quantity: ln.quantity as string, // resolveEditedProposal proved these well-formed
    unitPrice: ln.unitPrice as string,
    markupPercent: lineMarkups[i],
    taxAmount: ln.taxAmount ?? "0",
  }));
  const total = computeArLines(arLines).total;
  const effectiveNte = await getEffectiveNte(tenantId, jobId);
  const willRoute = decideProposalKind(total, effectiveNte, false);

  return { ok: true, total, effectiveNte, willRoute, willRouteIfForced: "client" };
}
