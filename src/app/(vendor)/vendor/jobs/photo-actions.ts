"use server";

import { revalidatePath } from "next/cache";
import { requireVendor } from "@/server/auth-context";
import { createVendorPhotoPlaceholder } from "@/server/vendor/create-vendor-photo-placeholder";

// Accepted image MIME types (Phase 20 20b). Extension is derived from the MIME at the writer,
// not from the filename.
const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * Vendor creates a photo attachment. Title required. Optionally carries a real image file
 * (Phase 20 20b) — when present it is uploaded to object storage (put-before-insert); when
 * absent the existing metadata-only placeholder path runs. visibility stays internal_only
 * (capture-then-review, v1 §2.3). Mirrors the createVendorNoteAction shape.
 *
 * Phase 10 batch 10m-construct; Phase 20 20b real-bytes.
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

  // Optional file: validate type + size, then read bytes. Absent / empty → placeholder path.
  let file: { bytes: Buffer; contentType: string; size: number } | undefined;
  const fileRaw = formData.get("file");
  if (fileRaw instanceof File && fileRaw.size > 0) {
    if (!ALLOWED_IMAGE_MIME.has(fileRaw.type)) {
      return { error: "Unsupported file type. Use JPG, PNG, WEBP, or HEIC." };
    }
    if (fileRaw.size > MAX_UPLOAD_BYTES) {
      return { error: "File too large (max 15 MB)." };
    }
    const bytes = Buffer.from(await fileRaw.arrayBuffer());
    file = { bytes, contentType: fileRaw.type, size: fileRaw.size };
  }

  try {
    await createVendorPhotoPlaceholder({
      assignmentId,
      tenantId: ctx.activeTenant.tenantId,
      vendorScope: ctx.vendorScope,
      actor: { kind: "user", userId: ctx.user.id },
      title: titleRaw.trim(),
      file,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "ASSIGNMENT_NOT_FOUND" || message === "VENDOR_SCOPE_MISMATCH") {
      return { error: message };
    }
    if (message === "STORAGE_PUT_FAILED") {
      return { error: "Upload failed, please try again." };
    }
    throw err;
  }
  revalidatePath(`/vendor/jobs/${assignmentId}`);
  return {};
}
