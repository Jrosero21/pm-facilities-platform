"use server";

import { revalidatePath } from "next/cache";
import { resolveMagicLinkToken } from "@/server/magic-links/token-core";
import { getAssignmentDetail } from "@/server/dispatch";
import {
  acceptDispatch,
  declineDispatch,
  confirmEta,
  confirmSchedule,
  markOnSite,
  markWorkComplete,
} from "@/server/vendor/assignment-actions";
import { createVendorNote } from "@/server/vendor/create-vendor-note";
import { createVendorPhotoPlaceholder } from "@/server/vendor/create-vendor-photo-placeholder";
import type { VendorActor } from "@/server/vendor/types";

// ── Phase 21 — LINKLESS SERVER ACTIONS (the security spine) ───────────────────────────
// THE RULE: every action re-resolves the RAW TOKEN server-side and derives tenantId /
// assignmentId / vendorScope / actor FROM the token — NEVER from any client-submitted field.
// A bad/expired/revoked/forged token → one uniform failure (no reason leak), mirroring
// resolveMagicLinkToken's {ok:false}. Invoice is NOT exposed here (only the 8 allowed actions).

export type LinkActionState = { error: string } | null;
const INVALID_LINK = { error: "This link is no longer valid." };

// Accepted image MIME types + size cap (mirrors the Phase-20 vendor photo action).
const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

type LinkContext = {
  tenantId: string;
  assignmentId: string;
  vendorScope: Set<string>;
  actor: VendorActor;
};

/**
 * The trusted-context derivation. Re-resolves the raw token, then reads the assignment to get
 * its vendorId — everything downstream comes from here, nothing from the client. Returns null
 * (→ uniform invalid-link) for any token failure or a missing assignment.
 */
async function resolveLinkContext(rawToken: string): Promise<LinkContext | null> {
  const res = await resolveMagicLinkToken(rawToken);
  if (!res.ok) return null;
  const assignment = await getAssignmentDetail(res.tenantId, res.assignmentId);
  if (!assignment) return null;
  return {
    tenantId: res.tenantId,
    assignmentId: res.assignmentId,
    vendorScope: new Set([assignment.vendorId]),
    actor: { kind: "linkless", tokenId: res.tokenId },
  };
}

/** Map a writer error to a generic operator-safe message (no token-reason leak). */
function mapWriterError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  switch (msg) {
    case "ASSIGNMENT_NOT_IN_REQUIRED_STATUS":
      return "That action isn't available for this work order's current status.";
    case "STORAGE_PUT_FAILED":
      return "Upload failed, please try again.";
    case "ASSIGNMENT_NOT_FOUND":
    case "VENDOR_SCOPE_MISMATCH":
      // Should not happen with a valid token — treat as an invalid link, no detail.
      return INVALID_LINK.error;
    default:
      return "Something went wrong, please try again.";
  }
}

// ── Status transitions (no extra payload) ─────────────────────────────────────────────
async function runStatus(
  rawToken: string,
  fn: (i: { assignmentId: string; tenantId: string; vendorScope: Set<string>; actor: VendorActor }) => Promise<void>,
): Promise<LinkActionState> {
  const ctx = await resolveLinkContext(rawToken);
  if (!ctx) return INVALID_LINK;
  try {
    await fn({ assignmentId: ctx.assignmentId, tenantId: ctx.tenantId, vendorScope: ctx.vendorScope, actor: ctx.actor });
  } catch (err) {
    return { error: mapWriterError(err) };
  }
  revalidatePath(`/link/${rawToken}`);
  return null;
}

export async function acceptLinkAction(rawToken: string, _prev: LinkActionState, _formData: FormData): Promise<LinkActionState> {
  return runStatus(rawToken, acceptDispatch);
}
export async function confirmScheduleLinkAction(rawToken: string, _prev: LinkActionState, _formData: FormData): Promise<LinkActionState> {
  return runStatus(rawToken, confirmSchedule);
}
export async function markOnSiteLinkAction(rawToken: string, _prev: LinkActionState, _formData: FormData): Promise<LinkActionState> {
  return runStatus(rawToken, (i) => markOnSite(i));
}
export async function markWorkCompleteLinkAction(rawToken: string, _prev: LinkActionState, _formData: FormData): Promise<LinkActionState> {
  return runStatus(rawToken, (i) => markWorkComplete(i));
}

export async function declineLinkAction(rawToken: string, _prev: LinkActionState, formData: FormData): Promise<LinkActionState> {
  const reason = ((formData.get("reason") as string | null) ?? "").trim() || null;
  const ctx = await resolveLinkContext(rawToken);
  if (!ctx) return INVALID_LINK;
  try {
    await declineDispatch({ assignmentId: ctx.assignmentId, tenantId: ctx.tenantId, vendorScope: ctx.vendorScope, actor: ctx.actor, reason });
  } catch (err) {
    return { error: mapWriterError(err) };
  }
  revalidatePath(`/link/${rawToken}`);
  return null;
}

export async function confirmEtaLinkAction(rawToken: string, _prev: LinkActionState, formData: FormData): Promise<LinkActionState> {
  const raw = (formData.get("etaStartAt") as string | null) ?? "";
  const etaStartAt = new Date(raw);
  if (!raw || Number.isNaN(etaStartAt.getTime())) {
    return { error: "Enter a valid ETA date/time." };
  }
  const ctx = await resolveLinkContext(rawToken);
  if (!ctx) return INVALID_LINK;
  try {
    await confirmEta({ assignmentId: ctx.assignmentId, tenantId: ctx.tenantId, vendorScope: ctx.vendorScope, actor: ctx.actor, etaStartAt });
  } catch (err) {
    return { error: mapWriterError(err) };
  }
  revalidatePath(`/link/${rawToken}`);
  return null;
}

// ── Note ──────────────────────────────────────────────────────────────────────────────
export async function addNoteLinkAction(rawToken: string, _prev: LinkActionState, formData: FormData): Promise<LinkActionState> {
  const body = ((formData.get("body") as string | null) ?? "").trim();
  if (!body) return { error: "Note cannot be empty." };
  const ctx = await resolveLinkContext(rawToken);
  if (!ctx) return INVALID_LINK;
  try {
    await createVendorNote({ assignmentId: ctx.assignmentId, tenantId: ctx.tenantId, vendorScope: ctx.vendorScope, actor: ctx.actor, body });
  } catch (err) {
    return { error: mapWriterError(err) };
  }
  revalidatePath(`/link/${rawToken}`);
  return null;
}

// ── Photo upload ────────────────────────────────────────────────────────────────────
export async function uploadPhotoLinkAction(rawToken: string, _prev: LinkActionState, formData: FormData): Promise<LinkActionState> {
  const title = ((formData.get("title") as string | null) ?? "").trim();
  if (!title) return { error: "Photo title cannot be empty." };
  if (title.length > 255) return { error: "Photo title is too long (max 255 chars)." };

  let file: { bytes: Buffer; contentType: string; size: number } | undefined;
  const fileRaw = formData.get("file");
  if (fileRaw instanceof File && fileRaw.size > 0) {
    if (!ALLOWED_IMAGE_MIME.has(fileRaw.type)) {
      return { error: "Unsupported file type. Use JPG, PNG, WEBP, or HEIC." };
    }
    if (fileRaw.size > MAX_UPLOAD_BYTES) {
      return { error: "File too large (max 15 MB)." };
    }
    file = { bytes: Buffer.from(await fileRaw.arrayBuffer()), contentType: fileRaw.type, size: fileRaw.size };
  }

  const ctx = await resolveLinkContext(rawToken);
  if (!ctx) return INVALID_LINK;
  try {
    await createVendorPhotoPlaceholder({ assignmentId: ctx.assignmentId, tenantId: ctx.tenantId, vendorScope: ctx.vendorScope, actor: ctx.actor, title, file });
  } catch (err) {
    return { error: mapWriterError(err) };
  }
  revalidatePath(`/link/${rawToken}`);
  return null;
}
