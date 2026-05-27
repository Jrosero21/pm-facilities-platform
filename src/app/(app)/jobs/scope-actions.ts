"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { runScopeGenerator } from "@/server/agents/scope-generator";
import { NoActivePromptError } from "@/server/agents/config/errors";
import { getScopeDraft, discardScopeDraft } from "@/server/agents/scope-generator/drafts";
import { createScopeReview } from "@/server/agents/scope-generator/reviews";
import { resolveEditedSteps } from "@/server/agents/scope-generator/edits";
import { publishScopeDraft } from "@/server/agents/scope-generator/publish";
import { DraftNotApproved, ScopeAlreadyPublished } from "@/server/agents/scope-generator/errors";

// ── Phase 7 batch 7d — scope generator server actions ─────────────────────────────────
// Mirrors rewriter-actions.ts: {error}|null state, requireTenant, try/catch error-mapping,
// revalidatePath. 7d.1 ships generateScopeAction only; approve/reject/discard land in 7d.2
// and publish in 7d.3.

export type ScopeActionState = { error: string } | null;

// Trigger the scope generator on a job. Bound (jobId); no extra params (useActionState
// passes prevState/formData, which this ignores — same pattern as draftClientUpdateAction).
// LLM/provider errors are caught and surfaced (the run is already recorded status='failed'
// inside runScopeGenerator); a missing active prompt is fail-closed (NoActivePromptError).
export async function generateScopeAction(jobId: string): Promise<ScopeActionState> {
  const ctx = await requireTenant();
  try {
    await runScopeGenerator({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      triggeredByUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof NoActivePromptError) {
      return { error: "Scope generation isn't configured (no active prompt)." };
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "JOB_NOT_FOUND") return { error: "Job not found in this tenant." };
    return { error: `Scope generation failed: ${msg}` };
  }
  revalidatePath(`/jobs/${jobId}`);
  return null;
}

// Approve a draft. Reads the editor's serialized steps from formData; resolveEditedSteps
// validates (≥1 step, each with instruction text) and computes editedSteps NULL-IF-UNCHANGED
// vs proposed_steps across every D3 affordance (mirrors approveDraftAction's null discipline).
// Bound (jobId, draftId).
export async function approveScopeDraftAction(
  jobId: string,
  draftId: string,
  _prev: ScopeActionState,
  formData: FormData,
): Promise<ScopeActionState> {
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;
  const raw = (formData.get("editedSteps") as string | null) ?? "[]";
  try {
    const draft = await getScopeDraft(tenantId, draftId);
    if (!draft) return { error: "Draft not found." };
    const res = resolveEditedSteps(raw, draft.proposedSteps);
    if (!res.ok) {
      if (res.error === "SCOPE_DRAFT_REQUIRES_STEPS") {
        return { error: "A scope needs at least one step, each with instruction text." };
      }
      return { error: "Could not read the edited steps." };
    }
    await createScopeReview({
      tenantId,
      draftId,
      reviewerUserId: ctx.user.id,
      decision: "approve",
      editedSteps: res.editedSteps,
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
export async function rejectScopeDraftAction(
  jobId: string,
  draftId: string,
  _prev: ScopeActionState,
  formData: FormData,
): Promise<ScopeActionState> {
  const ctx = await requireTenant();
  const reviewNotes = ((formData.get("reviewNotes") as string | null) ?? "").trim();
  if (!reviewNotes) return { error: "A reason is required to reject." };
  try {
    await createScopeReview({
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
export async function discardScopeDraftAction(jobId: string, draftId: string): Promise<ScopeActionState> {
  const ctx = await requireTenant();
  try {
    await discardScopeDraft(ctx.activeTenant.tenantId, draftId, ctx.user.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "DRAFT_NOT_DISCARDABLE") return { error: "This draft cannot be discarded in its current state." };
    if (msg === "DRAFT_NOT_FOUND") return { error: "Draft not found." };
    throw err;
  }
  revalidatePath(`/jobs/${jobId}`);
  return null;
}

// Publish an approved draft to the job (the human-gated, only draft → job_scope_steps path).
// Bound (jobId, draftId); no extra params. Mirrors publishDraftAction; adds the KL-7.g gate
// (SCOPE_ALREADY_PUBLISHED) enforced in the data-layer transaction.
export async function publishScopeDraftAction(jobId: string, draftId: string): Promise<ScopeActionState> {
  const ctx = await requireTenant();
  try {
    await publishScopeDraft({ tenantId: ctx.activeTenant.tenantId, draftId, actorUserId: ctx.user.id });
  } catch (err) {
    if (err instanceof ScopeAlreadyPublished) {
      return { error: "Scope already published for this job. This draft can no longer be published. Discard or leave as history." };
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
