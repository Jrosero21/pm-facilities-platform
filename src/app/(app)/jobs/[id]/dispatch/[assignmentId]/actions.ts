"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { sendDispatch, setAssignmentStatus } from "@/server/dispatch";
import { notifyVendorOfDispatch } from "@/server/dispatch-notify";
import { approveRedispatch } from "@/server/redispatch-suggestion";
import { sendAssignmentLink } from "@/server/magic-links/send-link";
import { revokeToken } from "@/server/magic-links/token-core";
import { resendWorkOrder } from "@/server/work-order-resend";
import {
  operatorRecordCheckIn,
  operatorRecordCheckOut,
  operatorRecordEta,
} from "@/server/operator-presence";
import { canSeeOperations } from "@/server/role-predicates";
import { operatorRedispatchAfterCancellation } from "@/server/redispatch-cancellation";

export type SendDispatchState = { error: string } | null;
export type LinkControlState = { error?: string; info?: string } | null;
export type SetStatusState = { error?: string; info?: string } | null;
export type ResendWorkOrderState = { error?: string; info?: string } | null;

// vendor-WO batch 4 — operator re-sends the work order to the assignment's vendor.
// Bound with (jobId, assignmentId). Re-RENDERS from current state, so the vendor receives the
// document as it stands now (latest scope, NTE and dispatch instructions), not a stored copy.
// Every outcome reports rather than throws: this is a deliberate operator action and the page
// should tell them what happened.
export async function resendWorkOrderAction(
  jobId: string,
  assignmentId: string,
): Promise<ResendWorkOrderState> {
  const ctx = await requireTenant();
  const result = await resendWorkOrder({
    tenantId: ctx.activeTenant.tenantId,
    assignmentId,
    actorUserId: ctx.user.id,
  });

  if (result.sent) {
    revalidatePath(`/jobs/${jobId}/dispatch/${assignmentId}`);
    revalidatePath(`/jobs/${jobId}`);
    return { info: `Work order re-sent to ${result.recipientEmail}.` };
  }

  switch (result.reason) {
    case "assignment_not_found":
      return { error: "This dispatch no longer exists." };
    case "no_vendor_email":
      return { error: "No email on file for this vendor or contact — nothing was sent." };
    case "work_order_not_renderable":
      return { error: "The work order could not be produced, so nothing was sent." };
    case "cooldown":
      return { info: "That work order was just sent — give it a moment before resending." };
    default:
      return { error: "The work order could not be emailed. Please try again." };
  }
}

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

    // POST-COMMIT side effect: notify the vendor by email (Phase 19 send seam). The dispatch
    // is already committed SENT — a notification failure (or a missing vendor email) must NEVER
    // fail the dispatch, so this is fully isolated. The no-email case warns via a timeline event
    // inside notifyVendorOfDispatch (warn-not-block); any unexpected error is swallowed here.
    try {
      await notifyVendorOfDispatch({
        tenantId: ctx.activeTenant.tenantId,
        assignmentId,
        actorUserId: ctx.user.id,
      });
    } catch (notifyErr) {
      console.error("[dispatch-notify] send failed post-commit (dispatch stands):", notifyErr);
    }

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

export type PresenceState = { error?: string; info?: string } | null;

// ── FOUNDATION Gap 1 — the operator presence door ─────────────────────────────────────
// One action for all three kinds; the form's `kind` field selects. Bound with (jobId,
// assignmentId). Gated canSeeOperations — recording what a vendor said on the phone is ordinary
// dispatch work, the same tier as advancing the assignment status, and carries no money.
//
// ★ These RECORD only. None of them advances the assignment status — that stays the
// DispatchStatusPicker's job (see operator-presence.ts for why the two are kept separable).
// The single exception is the ETA form's "also update the scheduled time" checkbox, which is
// opt-in and touches scheduledStartAt, not status.
export async function recordVendorPresenceAction(
  jobId: string,
  assignmentId: string,
  _prev: PresenceState,
  formData: FormData,
): Promise<PresenceState> {
  const ctx = await requireTenant();
  if (!canSeeOperations(ctx)) return { error: "You don't have access to dispatch actions." };

  const tenantId = ctx.activeTenant.tenantId;
  const kind = String(formData.get("kind") ?? "");
  const rawNote = formData.get("note");
  const note = typeof rawNote === "string" && rawNote.trim() !== "" ? rawNote.trim() : null;

  // datetime-local yields "YYYY-MM-DDTHH:mm" (browser wall clock). Blank ⇒ the server default.
  const rawWhen = formData.get("occurredAt");
  const when =
    typeof rawWhen === "string" && rawWhen.trim() !== "" ? new Date(rawWhen) : undefined;

  try {
    if (kind === "eta") {
      if (!when) return { error: "An ETA needs a date and time." };
      const rawEnd = formData.get("etaEndAt");
      const end = typeof rawEnd === "string" && rawEnd.trim() !== "" ? new Date(rawEnd) : null;
      const updateSchedule = formData.get("updateSchedule") === "on";
      await operatorRecordEta({
        tenantId, assignmentId, etaStartAt: when, etaEndAt: end, note,
        updateSchedule, actorUserId: ctx.user.id,
      });
      revalidatePath(`/jobs/${jobId}/dispatch/${assignmentId}`);
      revalidatePath(`/jobs/${jobId}`);
      return {
        info: updateSchedule
          ? "ETA recorded and the scheduled time updated."
          : "ETA recorded.",
      };
    }

    if (kind === "check_in" || kind === "check_out") {
      const fn = kind === "check_in" ? operatorRecordCheckIn : operatorRecordCheckOut;
      await fn({ tenantId, assignmentId, occurredAt: when, note, actorUserId: ctx.user.id });
      revalidatePath(`/jobs/${jobId}/dispatch/${assignmentId}`);
      revalidatePath(`/jobs/${jobId}`);
      return { info: kind === "check_in" ? "Check-in recorded." : "Check-out recorded." };
    }

    return { error: "Pick what you're recording." };
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "ASSIGNMENT_NOT_FOUND":
          return { error: "This dispatch no longer exists." };
        case "PRESENCE_OCCURRED_AT_INVALID":
          return { error: "That date and time couldn't be read." };
        case "PRESENCE_OCCURRED_AT_FUTURE":
          return { error: "A check-in or check-out can't be in the future — use an ETA for that." };
        case "PRESENCE_ETA_END_BEFORE_START":
          return { error: "The ETA window ends before it starts." };
        case "PRESENCE_NOTE_TOO_LONG":
          return { error: "That note is too long — keep it under 500 characters." };
      }
    }
    throw err;
  }
}

export type VendorCancelledState = { error?: string } | null;

// ── FOUNDATION Gap 5 — choreography outcome 1(c) ──────────────────────────────────────
// "The vendor phoned and cancelled." Closes the assignment as DECLINED (the honest word — they
// responded and said no), opens the linked replacement DRAFT, and REDIRECTS the operator to the
// pre-filled dispatch form to pick the new vendor.
//
// Distinct from the exceptions queue's SuggestReplacement, which is for jobs the SYSTEM flagged as
// stuck (vendor went silent). This one is operator-initiated on a KNOWN cancellation, and it must
// never close the old assignment as GHOSTED — see redispatch-cancellation-rules.ts.
export async function vendorCancelledRedispatchAction(
  jobId: string,
  assignmentId: string,
  _prev: VendorCancelledState,
  formData: FormData,
): Promise<VendorCancelledState> {
  const ctx = await requireTenant();
  if (!canSeeOperations(ctx)) return { error: "You don't have access to dispatch actions." };

  const rawReason = formData.get("reason");
  const reason = typeof rawReason === "string" && rawReason.trim() !== "" ? rawReason.trim() : null;

  let replacementId: string;
  try {
    const result = await operatorRedispatchAfterCancellation({
      tenantId: ctx.activeTenant.tenantId,
      assignmentId,
      reason,
      actorUserId: ctx.user.id,
    });
    replacementId = result.replacementAssignmentId;
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "ASSIGNMENT_NOT_FOUND":
          return { error: "This dispatch no longer exists." };
        case "ASSIGNMENT_NOT_CANCELLABLE":
          return {
            error:
              "This dispatch can't be cancelled from its current state — it's already closed, or the vendor is on site.",
          };
        case "CANCELLATION_NOTE_TOO_LONG":
          return { error: "That reason is too long — keep it under 500 characters." };
        case "VENDOR_NOT_FOUND":
        case "JOB_NOT_FOUND":
          return { error: "Could not open a replacement dispatch — please reload and try again." };
      }
    }
    throw err;
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/dispatch/${assignmentId}`);
  // Land the operator on the linked replacement DRAFT so they can change the vendor and send.
  redirect(`/jobs/${jobId}/dispatch/${replacementId}`);
}
