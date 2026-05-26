"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { runRewriter } from "@/server/agents/update-rewriter";
import { getDraft, discardDraft } from "@/server/agents/drafts";
import { createReview } from "@/server/agents/reviews";
import { publishRewriteDraft } from "@/server/client-updates";

export type RewriterActionState = { error: string } | null;

// Trigger the rewriter on a note. Bound (jobId, noteId); no extra params. LLM/provider
// errors are caught and surfaced (expected failure modes), not thrown — the run is already
// recorded status='failed' inside runRewriter.
export async function draftClientUpdateAction(
  jobId: string,
  noteId: string,
): Promise<RewriterActionState> {
  const ctx = await requireTenant();
  try {
    await runRewriter({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      noteId,
      triggeredByUserId: ctx.user.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "NOTE_NOT_FOUND") return { error: "Note not found in this tenant." };
    if (msg === "JOB_NOT_FOUND") return { error: "Job not found in this tenant." };
    return { error: `Rewriter failed: ${msg}` };
  }
  revalidatePath(`/jobs/${jobId}`);
  return null;
}

// Approve a draft. Reads the (possibly edited) content from formData; passes edited_content
// ONLY when it actually differs from draft_content (LOCK 6 — else NULL). Bound
// (jobId, draftId); formData IS used so the preceding _prev is fine under args:after-used.
export async function approveDraftAction(
  jobId: string,
  draftId: string,
  _prev: RewriterActionState,
  formData: FormData,
): Promise<RewriterActionState> {
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;
  const edited = ((formData.get("editedContent") as string | null) ?? "").trim();
  try {
    const draft = await getDraft(tenantId, draftId);
    if (!draft) return { error: "Draft not found." };
    const editedContent = edited.length > 0 && edited !== draft.draftContent ? edited : null;
    await createReview({ tenantId, draftId, reviewerUserId: ctx.user.id, decision: "approve", editedContent });
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
export async function rejectDraftAction(
  jobId: string,
  draftId: string,
  _prev: RewriterActionState,
  formData: FormData,
): Promise<RewriterActionState> {
  const ctx = await requireTenant();
  const reviewNotes = ((formData.get("reviewNotes") as string | null) ?? "").trim();
  if (!reviewNotes) return { error: "A reason is required to reject." };
  try {
    await createReview({
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

// Discard a draft (silent dismissal, no reason). Bound (jobId, draftId); no extra params.
export async function discardDraftAction(jobId: string, draftId: string): Promise<RewriterActionState> {
  const ctx = await requireTenant();
  try {
    await discardDraft(ctx.activeTenant.tenantId, draftId, ctx.user.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "DRAFT_NOT_PENDING_REVIEW") return { error: "This draft is no longer pending review." };
    if (msg === "DRAFT_NOT_FOUND") return { error: "Draft not found." };
    throw err;
  }
  revalidatePath(`/jobs/${jobId}`);
  return null;
}

// Publish an approved draft to the client (the human-gated draft→comm path). Bound
// (jobId, draftId); no extra params.
export async function publishDraftAction(jobId: string, draftId: string): Promise<RewriterActionState> {
  const ctx = await requireTenant();
  try {
    await publishRewriteDraft({
      tenantId: ctx.activeTenant.tenantId,
      draftId,
      actorUserId: ctx.user.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "DRAFT_NOT_APPROVED") return { error: "Only approved drafts can be published." };
    if (msg === "DRAFT_NOT_FOUND") return { error: "Draft not found." };
    if (msg === "JOB_NOT_FOUND") return { error: "Job not found in this tenant." };
    throw err;
  }
  revalidatePath(`/jobs/${jobId}`);
  return null;
}
