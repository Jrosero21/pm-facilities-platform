"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { createJob } from "@/server/jobs";

export type CreateJobState = { error: string } | null;

// 8c.4 / 9b: canonicalize an operator-entered NTE to a "d.dd" decimal(12,2) string, or null if
// invalid. Validates shape, strips leading zeros, pads decimals, requires > 0 and ≤10 integer
// digits. createJob then compares this canonical form === the resolver's canonical amount (no
// money lib in the data layer — 9a), so canonicalization MUST happen here at the boundary.
// Exported (v2.11.0) so updateJobAction (batch 2) reuses the SAME rule — never a second copy.
export function canonicalizeNte(raw: string): string | null {
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const [intRaw, decRaw = ""] = raw.split(".");
  const intPart = intRaw.replace(/^0+(?=\d)/, "");
  if (intPart.length > 10) return null; // decimal(12,2) overflow
  const canonical = `${intPart}.${(decRaw + "00").slice(0, 2)}`;
  return parseFloat(canonical) > 0 ? canonical : null;
}

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
