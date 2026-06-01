"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import {
  sendCommunication,
  shareNote,
  updateCommunicationDeliveryStatus,
  type ShareAudience,
} from "@/server/communications";
import type { DeliveryStatus } from "@/components/delivery-status-badge";

export type CommActionState = { error: string } | null;

// Bound with (jobId, noteId, audience); useActionState supplies (prev, formData),
// neither of which Share needs — a no-extra-param server action is assignable.
export async function shareNoteAction(
  jobId: string,
  noteId: string,
  audience: ShareAudience,
): Promise<CommActionState> {
  const ctx = await requireTenant();
  try {
    await shareNote({
      tenantId: ctx.activeTenant.tenantId,
      noteId,
      audience,
      sentByUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "NOTE_NOT_FOUND":
          return { error: "Note not found in this tenant." };
        case "NOTE_NOT_SHAREABLE":
          return { error: "This note's visibility doesn't permit sharing with that audience." };
        case "JOB_NOT_FOUND":
          return { error: "Job not found in this tenant." };
      }
    }
    throw err;
  }
  revalidatePath(`/jobs/${jobId}`);
  return null;
}

// Bound with (jobId, commId, toStatus); see note above re: no extra params.
export async function updateDeliveryStatusAction(
  jobId: string,
  commId: string,
  toStatus: DeliveryStatus,
): Promise<CommActionState> {
  const ctx = await requireTenant();
  try {
    await updateCommunicationDeliveryStatus({
      tenantId: ctx.activeTenant.tenantId,
      commId,
      toStatus,
      actorUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "COMMUNICATION_NOT_FOUND":
          return { error: "Communication not found." };
        case "INVALID_DELIVERY_TRANSITION":
          return { error: "That delivery transition isn't allowed from the current state." };
      }
    }
    throw err;
  }
  revalidatePath(`/jobs/${jobId}`);
  return null;
}

// Phase 19c — operator-triggered REAL send via the provider adapter (capture-by-default).
// Bound (jobId, commId). The send path (compose → provider.send() → flip sent/failed) lives
// in sendCommunication; this wrapper is the operator entry point. The existing "Send" button
// still calls the pure-flip updateDeliveryStatusAction — pointing the UI here is 19e.
export async function sendCommunicationAction(
  jobId: string,
  commId: string,
): Promise<CommActionState> {
  const ctx = await requireTenant();
  try {
    await sendCommunication({
      tenantId: ctx.activeTenant.tenantId,
      commId,
      actorUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "COMMUNICATION_NOT_FOUND":
          return { error: "Communication not found." };
        case "INVALID_DELIVERY_TRANSITION":
          return { error: "This message can't be sent from its current state." };
        case "MISSING_RECIPIENT":
          return { error: "No recipient email on this message." };
        case "UNRESOLVABLE_SEND_SOURCE":
          return { error: "Couldn't resolve the message content to send." };
      }
    }
    throw err;
  }
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/notifications");
  return null;
}
