"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { createDispatch } from "@/server/dispatch";
import { prepareRedispatchSuggestion, type RedispatchSuggestionResult } from "@/server/redispatch-suggestion";

export type CreateDispatchState = { error: string } | null;

function parseDateTime(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createDispatchAction(
  jobId: string,
  _prev: CreateDispatchState,
  formData: FormData,
): Promise<CreateDispatchState> {
  const ctx = await requireTenant();

  const vendorId = String(formData.get("vendorId") ?? "").trim();
  const vendorLocationId = String(formData.get("vendorLocationId") ?? "").trim() || null;
  const vendorContactId = String(formData.get("vendorContactId") ?? "").trim() || null;
  const agreedNteAmount = String(formData.get("agreedNteAmount") ?? "").trim() || null;
  const scheduledStartAt = parseDateTime(String(formData.get("scheduledStartAt") ?? ""));
  const scheduledEndAt = parseDateTime(String(formData.get("scheduledEndAt") ?? ""));
  const dispatchScope = String(formData.get("dispatchScope") ?? "").trim() || null;

  // The vendor is the only required field — everything else is optional/pre-filled.
  if (!vendorId) return { error: "Select a vendor to dispatch." };

  let newId: string;
  try {
    const assignment = await createDispatch({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      vendorId,
      vendorLocationId,
      vendorContactId,
      agreedNteAmount,
      scheduledStartAt,
      scheduledEndAt,
      dispatchScope,
      createdByUserId: ctx.user.id,
    });
    newId = assignment.id;
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "JOB_NOT_FOUND":
          return { error: "Job not found in this tenant." };
        case "JOB_NOT_DISPATCHABLE":
          return { error: "Assign a trade to this job before dispatching." };
        case "VENDOR_NOT_FOUND":
          return { error: "That vendor was not found in this tenant." };
        case "VENDOR_LOCATION_NOT_FOUND":
        case "VENDOR_LOCATION_VENDOR_MISMATCH":
          return { error: "The selected branch is not valid for that vendor." };
        case "VENDOR_CONTACT_NOT_FOUND":
        case "VENDOR_CONTACT_VENDOR_MISMATCH":
          return { error: "The selected contact is not valid for that vendor." };
        case "VENDOR_NO_LONGER_CANDIDATE":
          return {
            error:
              "That vendor is no longer a match for this job — the candidate list refreshed. Pick from the current candidates.",
          };
        case "STATUS_NOT_FOUND":
          return {
            error: "No DRAFT dispatch status is configured — run the dispatch-reference seed.",
          };
      }
    }
    throw err;
  }

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}/dispatch/${newId}`);
}

export type PrepareRedispatchState =
  | { error: string }
  | { ok: true; result: RedispatchSuggestionResult };

/**
 * Phase 28: prepare a re-dispatch suggestion DRAFT for a stuck assignment (operator-gated;
 * nothing is sent here — the operator approves later via the Send control). Idempotent.
 */
export async function prepareRedispatchSuggestionAction(
  jobId: string,
  stuckAssignmentId: string,
): Promise<PrepareRedispatchState> {
  const ctx = await requireTenant();

  let result: RedispatchSuggestionResult;
  try {
    result = await prepareRedispatchSuggestion({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      stuckAssignmentId,
      createdByUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "STUCK_ASSIGNMENT_NOT_ON_JOB":
          return { error: "That assignment is not on this job." };
        case "VENDOR_NO_LONGER_CANDIDATE":
          return {
            error:
              "The suggested vendor is no longer a match for this job — the candidate list refreshed. Re-run the suggestion.",
          };
        case "JOB_NOT_FOUND":
          return { error: "Job not found in this tenant." };
        case "JOB_NOT_DISPATCHABLE":
          return { error: "Assign a trade to this job before dispatching." };
        case "STATUS_NOT_FOUND":
          return { error: "No DRAFT dispatch status is configured — run the dispatch-reference seed." };
      }
    }
    throw err;
  }

  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, result };
}
