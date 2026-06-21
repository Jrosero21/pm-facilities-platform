"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { sendDispatch, setAssignmentStatus } from "@/server/dispatch";
import { approveRedispatch } from "@/server/redispatch-suggestion";
import { sendAssignmentLink } from "@/server/magic-links/send-link";
import { revokeToken } from "@/server/magic-links/token-core";

export type SendDispatchState = { error: string } | null;
export type LinkControlState = { error?: string; info?: string } | null;
export type SetStatusState = { error?: string; info?: string } | null;

// Operator mints + emails a fresh magic link to the assignment's vendor contact. Recipient is
// checked before minting (no orphan token on a missing email). Bound with (jobId, assignmentId).
export async function sendLinkAction(
  jobId: string,
  assignmentId: string,
): Promise<LinkControlState> {
  const ctx = await requireTenant();
  try {
    const r = await sendAssignmentLink({
      tenantId: ctx.activeTenant.tenantId,
      assignmentId,
      actorUserId: ctx.user.id,
    });
    revalidatePath(`/jobs/${jobId}/dispatch/${assignmentId}`);
    if (r.deliveryStatus !== "sent") {
      return { error: "The link was created but the email could not be sent. Try again." };
    }
    return { info: "Link sent to the vendor contact." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "MISSING_RECIPIENT") {
      return { error: "No contact email on file for this vendor — add one to send a link." };
    }
    if (msg === "ASSIGNMENT_NOT_FOUND") {
      return { error: "This dispatch no longer exists." };
    }
    throw err;
  }
}

// Operator revokes a magic-link token (tenant-scoped, idempotent). Bound (jobId, assignmentId, tokenId).
export async function revokeLinkAction(
  jobId: string,
  assignmentId: string,
  tokenId: string,
): Promise<LinkControlState> {
  const ctx = await requireTenant();
  await revokeToken({ tokenId, tenantId: ctx.activeTenant.tenantId });
  revalidatePath(`/jobs/${jobId}/dispatch/${assignmentId}`);
  return { info: "Link revoked." };
}

// Bound with assignmentId; useActionState calls it with (prevState, formData),
// neither of which Send needs — a no-extra-param server action is assignable.
export async function sendDispatchAction(
  assignmentId: string,
): Promise<SendDispatchState> {
  const ctx = await requireTenant();

  try {
    const result = await sendDispatch({
      tenantId: ctx.activeTenant.tenantId,
      assignmentId,
      actorUserId: ctx.user.id,
    });
    // Re-render the assignment workspace (now SENT) + the parent job (status may
    // have advanced to DISPATCHED). No redirect — stay on the workspace.
    revalidatePath(`/jobs/${result.assignment.jobId}/dispatch/${assignmentId}`);
    revalidatePath(`/jobs/${result.assignment.jobId}`);
    return null;
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "ASSIGNMENT_NOT_FOUND":
          return { error: "This dispatch no longer exists." };
        case "ASSIGNMENT_NOT_DRAFT":
          return { error: "This dispatch was already sent." };
        case "JOB_NOT_DISPATCHABLE":
        case "JOB_BECAME_TERMINAL":
          return { error: "This job can no longer be dispatched (it was closed or cancelled)." };
        case "JOB_NOT_FOUND":
        case "STATUS_NOT_FOUND":
          return { error: "Could not send the dispatch — please reload and try again." };
      }
    }
    throw err;
  }
}

// Operator hand-advance: set the dispatch's status directly (vendor-called-in workflow). Bound
// with assignmentId; reads toCode (+ optional note) from the form. Mirrors sendDispatchAction's
// requireTenant + revalidate shape. The DRAFT/SENT guard + ASSIGNMENT_NOT_FOUND map to messages.
export async function setAssignmentStatusAction(
  assignmentId: string,
  _prev: SetStatusState,
  formData: FormData,
): Promise<SetStatusState> {
  const ctx = await requireTenant();
  const toCode = String(formData.get("toCode") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!toCode) return { error: "Pick a status." };

  try {
    const result = await setAssignmentStatus({
      tenantId: ctx.activeTenant.tenantId,
      assignmentId,
      toCode,
      actorUserId: ctx.user.id,
      note,
    });
    revalidatePath(`/jobs/${result.jobId}/dispatch/${assignmentId}`);
    revalidatePath(`/jobs/${result.jobId}`);
    return result.changed
      ? { info: `Status set to ${result.toCode}.` }
      : { info: "Status unchanged." };
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "STATUS_NOT_OPERATOR_SETTABLE":
          return { error: "Draft and Sent are set through the Send action, not here." };
        case "STATUS_NOT_FOUND":
          return { error: "That status is not valid." };
        case "ASSIGNMENT_NOT_FOUND":
          return { error: "This dispatch no longer exists." };
      }
    }
    throw err;
  }
}

export type ApproveRedispatchState =
  | { error: string }
  | {
      ok: true;
      result: { kind: "approved"; ghostedAssignmentId: string; sentAssignmentId: string };
    };

// Phase 28: approve a re-dispatch suggestion DRAFT — ghost the stuck assignment + send the DRAFT
// (ordered-with-recovery). Bound with (jobId, draftAssignmentId); mirrors sendDispatchAction's
// requireTenant + revalidate shape. The approve guards map to operator-readable messages.
export async function approveRedispatchAction(
  jobId: string,
  draftAssignmentId: string,
): Promise<ApproveRedispatchState> {
  const ctx = await requireTenant();

  try {
    const result = await approveRedispatch({
      tenantId: ctx.activeTenant.tenantId,
      draftAssignmentId,
      actorUserId: ctx.user.id,
    });
    revalidatePath(`/jobs/${jobId}/dispatch/${draftAssignmentId}`);
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true, result };
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "NOT_A_REDISPATCH_SUGGESTION":
          return { error: "This draft is not a re-dispatch suggestion." };
        case "DRAFT_NOT_PENDING":
          return { error: "This suggestion was already approved (or is no longer a draft)." };
        case "STUCK_NO_LONGER_SENT":
          return { error: "The original dispatch is no longer awaiting a response — re-check before re-dispatching." };
        case "ASSIGNMENT_NOT_FOUND":
          return { error: "This dispatch no longer exists." };
        case "JOB_NOT_DISPATCHABLE":
        case "JOB_BECAME_TERMINAL":
          return { error: "This job can no longer be dispatched (it was closed or cancelled)." };
        case "JOB_NOT_FOUND":
        case "STATUS_NOT_FOUND":
          return { error: "Could not approve the re-dispatch — please reload and try again." };
      }
    }
    throw err;
  }
}
