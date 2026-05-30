"use server";

import { revalidatePath } from "next/cache";
import { requireVendor } from "@/server/auth-context";
import { createVendorPhotoPlaceholder } from "@/server/vendor/create-vendor-photo-placeholder";

/**
 * Vendor creates a photo placeholder. Title required (DoR-10m.3); no file
 * upload in MVP (Fork 7). Mirrors the createVendorNoteAction shape.
 *
 * Phase 10 batch 10m-construct.
 */
export async function createVendorPhotoPlaceholderAction(
  assignmentId: string,
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const ctx = await requireVendor();
  const titleRaw = formData.get("title");
  if (typeof titleRaw !== "string" || titleRaw.trim().length === 0) {
    return { error: "Photo title cannot be empty." };
  }
  if (titleRaw.trim().length > 255) {
    return { error: "Photo title is too long (max 255 chars)." };
  }
  try {
    await createVendorPhotoPlaceholder({
      assignmentId,
      tenantId: ctx.activeTenant.tenantId,
      vendorScope: ctx.vendorScope,
      actorUserId: ctx.user.id,
      title: titleRaw.trim(),
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
