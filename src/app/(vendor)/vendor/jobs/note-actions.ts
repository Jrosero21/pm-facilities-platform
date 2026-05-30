"use server";

import { revalidatePath } from "next/cache";
import { requireVendor } from "@/server/auth-context";
import { createVendorNote } from "@/server/vendor/create-vendor-note";

/**
 * Vendor creates a note on an assignment's job. Body required; visibility is
 * fixed at internal_only and origin at 'vendor' inside createVendorNote
 * (DoR-10l.1). Mirrors the operator createJobNoteAction (jobId, _prev, formData)
 * useActionState shape.
 *
 * Phase 10 batch 10l-construct.
 */
export async function createVendorNoteAction(
  assignmentId: string,
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const ctx = await requireVendor();
  const bodyRaw = formData.get("body");
  if (typeof bodyRaw !== "string" || bodyRaw.trim().length === 0) {
    return { error: "Note body cannot be empty." };
  }
  try {
    await createVendorNote({
      assignmentId,
      tenantId: ctx.activeTenant.tenantId,
      vendorScope: ctx.vendorScope,
      actorUserId: ctx.user.id,
      body: bodyRaw.trim(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "ASSIGNMENT_NOT_FOUND" || message === "VENDOR_SCOPE_MISMATCH") {
      return { error: message };
    }
    throw err;
  }
  revalidatePath(`/vendor/jobs/${assignmentId}`);
  return {};
}
