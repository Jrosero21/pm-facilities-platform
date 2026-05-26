"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { createJobNote } from "@/server/job-notes";
import { isNoteVisibility } from "@/components/note-visibility-badge";

export type JobNoteActionState = { error: string } | null;

export async function createJobNoteAction(
  jobId: string,
  _prev: JobNoteActionState,
  formData: FormData,
): Promise<JobNoteActionState> {
  const ctx = await requireTenant();

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Note cannot be empty." };

  // Untrusted: validate to the 5-value enum; anything else falls back to the
  // safe default (internal_only). Classification only — does not share (R-5.8).
  const rawVisibility = String(formData.get("visibility") ?? "");
  const visibility = isNoteVisibility(rawVisibility) ? rawVisibility : "internal_only";

  try {
    await createJobNote({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      body,
      visibility,
      createdByUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "JOB_NOT_FOUND") {
      return { error: "Job not found in this tenant." };
    }
    throw err;
  }

  revalidatePath(`/jobs/${jobId}`);
  return null;
}
