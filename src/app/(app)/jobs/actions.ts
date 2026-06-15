"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { createJob, updateJob, type JobPatch } from "@/server/jobs";
// canonicalizeNte lives in the pure money util (NOT here) — every export of a "use server" module
// must be an async function, so a sync helper cannot be exported from this file (v2.11.0 fix).
import { canonicalizeNte } from "@/server/billing/money";
import { parseDateTime } from "@/lib/datetime";
import { isFollowUpCategory } from "@/lib/follow-up";

export type CreateJobState = { error: string } | null;
// v2.11.0 — same shape as CreateJobState; named separately for the edit form's clarity.
export type UpdateJobState = { error: string } | null;

export async function createJobAction(
  _prev: CreateJobState,
  formData: FormData,
): Promise<CreateJobState> {
  const ctx = await requireTenant();

  const clientId = String(formData.get("clientId") ?? "").trim();
  const clientLocationId = String(formData.get("clientLocationId") ?? "").trim();
  const primaryTradeId = String(formData.get("primaryTradeId") ?? "").trim();
  const priorityId = String(formData.get("priorityId") ?? "").trim();
  const problemDescription = String(formData.get("problemDescription") ?? "").trim();
  const scopeOfWork = String(formData.get("scopeOfWork") ?? "").trim() || null;
  const notToExceedRaw = String(formData.get("notToExceedAmount") ?? "").trim();

  // Manual create requires client/location/trade/priority/problem at the form
  // level even though trade_id/priority_id are nullable columns (D-4.7). source_type
  // is implicitly 'manual' — the manual form exposes no source picker.
  if (!clientId) return { error: "Select a client." };
  if (!clientLocationId) return { error: "Select a location." };
  if (!primaryTradeId) return { error: "Select a trade." };
  if (!priorityId) return { error: "Select a priority." };
  if (!problemDescription) return { error: "Problem description is required." };

  // 8c.4: optional operator NTE. If present, canonicalize + validate here (the boundary);
  // createJob resolves the client NTE rule and treats this as an OVERRIDE iff it differs from
  // the resolved value (Case C, 9c). Absent ⇒ resolver value snapshots (Case A) or NULL (E).
  // The form does not send this field yet — 8c.11e adds the input + pre-fill (9g, forward-compat).
  let notToExceedAmount: string | undefined;
  if (notToExceedRaw) {
    const canonical = canonicalizeNte(notToExceedRaw);
    if (canonical === null) {
      return { error: "Not-to-exceed must be a positive dollar amount with at most 2 decimals." };
    }
    notToExceedAmount = canonical;
  }

  let newId: string;
  try {
    const job = await createJob({
      tenantId: ctx.activeTenant.tenantId,
      clientId,
      clientLocationId,
      primaryTradeId,
      priorityId,
      problemDescription,
      scopeOfWork,
      notToExceedAmount,
      createdByUserId: ctx.user.id,
    });
    newId = job.id;
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "CLIENT_NOT_FOUND":
          return { error: "Client not found in this tenant." };
        case "LOCATION_NOT_FOUND":
          return { error: "Location not found in this tenant." };
        case "LOCATION_CLIENT_MISMATCH":
          return { error: "That location does not belong to the selected client." };
        case "TRADE_NOT_FOUND":
          return { error: "That trade no longer exists." };
        case "PRIORITY_NOT_FOUND":
          return { error: "That priority is not valid for this tenant." };
        case "STATUS_NOT_FOUND":
          return {
            error: "No initial job status is configured — run the job-reference seed.",
          };
      }
    }
    throw err;
  }

  revalidatePath("/jobs");
  redirect(`/jobs/${newId}`);
}

// ── v2.11.0 — edit an existing job (wraps the committed updateJob writer) ──────────────
// Builds a JobPatch from only the fields the form submits (updateJob no-ops unchanged ones), reuses
// the SAME canonicalizeNte, and maps the writer's guard errors to friendly messages. The form omits
// a locked problem_description (not submitted); the server PROBLEM_DESCRIPTION_LOCKED guard is the
// backstop. Empty NTE field = LEAVE UNCHANGED (omitted) — clearing the NTE to null is not offered
// here (a distinct intent). client_id is never in the form (immutable); priority/trade are required
// selects (no clear-to-null). Redirect-on-success mirrors createJobAction.
export async function updateJobAction(
  jobId: string,
  _prev: UpdateJobState,
  formData: FormData,
): Promise<UpdateJobState> {
  const ctx = await requireTenant();

  const priorityId = String(formData.get("priorityId") ?? "").trim();
  const primaryTradeId = String(formData.get("primaryTradeId") ?? "").trim();
  const clientLocationId = String(formData.get("clientLocationId") ?? "").trim();
  const scopeRaw = formData.get("scopeOfWork"); // present (editable); "" clears the optional scope
  const descRaw = formData.get("problemDescription"); // null when locked (disabled → not submitted)
  const notToExceedRaw = String(formData.get("notToExceedAmount") ?? "").trim();

  const patch: JobPatch = {};
  if (priorityId) patch.priorityId = priorityId;
  if (primaryTradeId) patch.primaryTradeId = primaryTradeId;
  if (clientLocationId) patch.clientLocationId = clientLocationId;
  if (scopeRaw !== null) patch.scopeOfWork = String(scopeRaw).trim() || null; // "" → null (scope is nullable)
  if (descRaw !== null) {
    const pd = String(descRaw).trim();
    if (!pd) return { error: "Problem description is required." };
    patch.problemDescription = pd;
  }
  if (notToExceedRaw) {
    const canonical = canonicalizeNte(notToExceedRaw);
    if (canonical === null) {
      return { error: "Not-to-exceed must be a positive dollar amount with at most 2 decimals." };
    }
    patch.notToExceedAmount = canonical;
  } // empty NTE → omit (leave unchanged)

  // follow-up (next action). The form ALWAYS submits followUpAt, so a present-but-blank value is an
  // explicit CLEAR (→ null both fields); an absent key leaves it unchanged. A set date requires one
  // of the four categories (the pairing rule from the schema). A cleared date drops any posted
  // category, and the writer re-forces category null on a date-clear regardless.
  if (formData.has("followUpAt")) {
    const followUpAt = parseDateTime(String(formData.get("followUpAt") ?? ""));
    if (followUpAt === null) {
      patch.followUpAt = null;
      patch.followUpCategory = null; // clearing the date clears the type
    } else {
      const category = String(formData.get("followUpCategory") ?? "").trim();
      if (!isFollowUpCategory(category)) {
        return { error: "Pick a follow-up type when setting a follow-up date." };
      }
      patch.followUpAt = followUpAt;
      patch.followUpCategory = category;
    }
  }

  try {
    await updateJob({ tenantId: ctx.activeTenant.tenantId, jobId, actorUserId: ctx.user.id, patch });
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "PROBLEM_DESCRIPTION_LOCKED":
          return { error: "This job's problem description came from the client and can't be edited." };
        case "LOCATION_CLIENT_MISMATCH":
          return { error: "That location belongs to a different client." };
        case "LOCATION_NOT_FOUND":
          return { error: "Location not found in this tenant." };
        case "PRIORITY_REQUIRED":
          return { error: "Priority is required." };
        case "TRADE_REQUIRED":
          return { error: "Trade is required." };
        case "PRIORITY_NOT_FOUND":
          return { error: "That priority is not valid for this tenant." };
        case "TRADE_NOT_FOUND":
          return { error: "That trade no longer exists." };
        case "PROBLEM_DESCRIPTION_REQUIRED":
          return { error: "Problem description is required." };
        case "JOB_NOT_FOUND":
          return { error: "Job not found in this tenant." };
      }
    }
    throw err;
  }

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}
