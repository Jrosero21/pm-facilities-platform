"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { promoteNoteVisibility } from "@/server/job-notes";
import { isNoteVisibility } from "@/components/note-visibility-badge";
import type { RewriterActionState } from "@/app/(app)/jobs/rewriter-actions";

// FB-10l.2 — operator promotes a vendor note's visibility to a client-facing value.
// Operator-gated via requireTenant (the (app) layout already gates non-operators out).
// Bound (jobId, noteId); toVisibility comes from formData. Flip + audit only — the
// writer performs NO outbound (Fork 1; Phase 19 owns send). Mirrors the rewriter-actions
// (jobId, …, _prev, formData) useActionState shape.
export async function promoteNoteVisibilityAction(
  jobId: string,
  noteId: string,
  _prev: RewriterActionState,
  formData: FormData,
): Promise<RewriterActionState> {
  const ctx = await requireTenant();
  const toVisibility = ((formData.get("toVisibility") as string | null) ?? "").trim();
  if (!isNoteVisibility(toVisibility)) {
    return { error: "Select a visibility to promote to." };
  }
  try {
    await promoteNoteVisibility({
      tenantId: ctx.activeTenant.tenantId,
      noteId,
      toVisibility,
      actorUserId: ctx.user.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "NOTE_NOT_FOUND") return { error: "Note not found in this tenant." };
    if (msg === "INVALID_PROMOTION_TARGET") {
      return { error: "Notes can only be promoted to client-visible or client + vendor." };
    }
    throw err;
  }
  revalidatePath("/review");
  revalidatePath(`/jobs/${jobId}`);
  return null;
}
