"use server";

import { revalidatePath } from "next/cache";
import { requireVendor } from "@/server/auth-context";
import {
  acceptDispatch,
  declineDispatch,
  confirmEta,
  confirmSchedule,
  markOnSite,
  markWorkComplete,
} from "@/server/vendor/assignment-actions";

// ── Phase 10 batch 10k-actions — VENDOR ASSIGNMENT ACTION WRAPPERS ──────────
// Six 'use server' wrappers mirroring sendDispatchAction: requireVendor() gate
// (resolves tenant + vendor scope), delegate to the server-only transition fn,
// map known domain errors to a typed { error } return (unexpected errors
// re-throw), then revalidatePath('/vendor/jobs') on success. 10k-ui binds these
// into client buttons via useActionState; the vendor job-detail path is added to
// the revalidation set when 10k-ui lands it.

export type VendorActionResult = { error?: string };

const KNOWN_ERRORS = new Set([
  "ASSIGNMENT_NOT_FOUND",
  "ASSIGNMENT_NOT_IN_REQUIRED_STATUS",
  "VENDOR_SCOPE_MISMATCH",
  "STATUS_NOT_FOUND",
]);

// Maps a known domain error to a { error } result; re-throws anything else.
function toResult(err: unknown): VendorActionResult {
  const message = err instanceof Error ? err.message : String(err);
  if (KNOWN_ERRORS.has(message)) return { error: message };
  throw err;
}

export async function acceptDispatchAction(
  assignmentId: string,
): Promise<VendorActionResult> {
  const ctx = await requireVendor();
  try {
    await acceptDispatch({
      assignmentId,
      tenantId: ctx.activeTenant.tenantId,
      vendorScope: ctx.vendorScope,
      actor: { kind: "user", userId: ctx.user.id },
    });
  } catch (err) {
    return toResult(err);
  }
  revalidatePath("/vendor/jobs");
  return {};
}

export async function declineDispatchAction(
  assignmentId: string,
  reason?: string | null,
): Promise<VendorActionResult> {
  const ctx = await requireVendor();
  try {
    await declineDispatch({
      assignmentId,
      tenantId: ctx.activeTenant.tenantId,
      vendorScope: ctx.vendorScope,
      actor: { kind: "user", userId: ctx.user.id },
      reason: reason ?? null,
    });
  } catch (err) {
    return toResult(err);
  }
  revalidatePath("/vendor/jobs");
  return {};
}

export async function confirmEtaAction(
  assignmentId: string,
  etaStartAt: string,
  etaEndAt?: string | null,
  note?: string | null,
): Promise<VendorActionResult> {
  const ctx = await requireVendor();
  const start = new Date(etaStartAt);
  if (Number.isNaN(start.getTime())) return { error: "INVALID_ETA_START" };
  const end =
    etaEndAt != null && etaEndAt !== "" ? new Date(etaEndAt) : null;
  if (end !== null && Number.isNaN(end.getTime()))
    return { error: "INVALID_ETA_END" };
  try {
    await confirmEta({
      assignmentId,
      tenantId: ctx.activeTenant.tenantId,
      vendorScope: ctx.vendorScope,
      actor: { kind: "user", userId: ctx.user.id },
      etaStartAt: start,
      etaEndAt: end,
      note: note ?? null,
    });
  } catch (err) {
    return toResult(err);
  }
  revalidatePath("/vendor/jobs");
  return {};
}

export async function confirmScheduleAction(
  assignmentId: string,
): Promise<VendorActionResult> {
  const ctx = await requireVendor();
  try {
    await confirmSchedule({
      assignmentId,
      tenantId: ctx.activeTenant.tenantId,
      vendorScope: ctx.vendorScope,
      actor: { kind: "user", userId: ctx.user.id },
    });
  } catch (err) {
    return toResult(err);
  }
  revalidatePath("/vendor/jobs");
  return {};
}

export async function markOnSiteAction(
  assignmentId: string,
  note?: string | null,
): Promise<VendorActionResult> {
  const ctx = await requireVendor();
  try {
    await markOnSite({
      assignmentId,
      tenantId: ctx.activeTenant.tenantId,
      vendorScope: ctx.vendorScope,
      actor: { kind: "user", userId: ctx.user.id },
      note: note ?? null,
    });
  } catch (err) {
    return toResult(err);
  }
  revalidatePath("/vendor/jobs");
  return {};
}

export async function markWorkCompleteAction(
  assignmentId: string,
  note?: string | null,
): Promise<VendorActionResult> {
  const ctx = await requireVendor();
  try {
    await markWorkComplete({
      assignmentId,
      tenantId: ctx.activeTenant.tenantId,
      vendorScope: ctx.vendorScope,
      actor: { kind: "user", userId: ctx.user.id },
      note: note ?? null,
    });
  } catch (err) {
    return toResult(err);
  }
  revalidatePath("/vendor/jobs");
  return {};
}
