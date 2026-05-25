"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { createJobNote } from "@/server/job-notes";

export type JobNoteActionState = { error: string } | null;

export async function createJobNoteAction(
  jobId: string,
  _prev: JobNoteActionState,
  formData: FormData,
): Promise<JobNoteActionState> {
  const ctx = await requireTenant();

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Note cannot be empty." };

  try {
    await createJobNote({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      body,
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
