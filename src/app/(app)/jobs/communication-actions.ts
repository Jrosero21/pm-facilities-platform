"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import {
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
