"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { createJob } from "@/server/jobs";

export type CreateJobState = { error: string } | null;

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

  // Manual create requires client/location/trade/priority/problem at the form
  // level even though trade_id/priority_id are nullable columns (D-4.7). source_type
  // is implicitly 'manual' — the manual form exposes no source picker.
  if (!clientId) return { error: "Select a client." };
  if (!clientLocationId) return { error: "Select a location." };
  if (!primaryTradeId) return { error: "Select a trade." };
  if (!priorityId) return { error: "Select a priority." };
  if (!problemDescription) return { error: "Problem description is required." };

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
