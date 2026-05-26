"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { sendDispatch } from "@/server/dispatch";

export type SendDispatchState = { error: string } | null;

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
