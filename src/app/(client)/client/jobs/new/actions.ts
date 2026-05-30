"use server";

import { redirect } from "next/navigation";
import { requireClient } from "@/server/auth-context";
import { createClientJob } from "@/server/client/create-client-job";

// ── Phase 11 batch 11f — CLIENT JOB SUBMISSION ACTION ───────────────────────
// Thin 'use server' wrapper mirroring createVendorNoteAction's useActionState
// shape (_prev, formData → { error }). All identity comes from requireClient()'s
// ctx — tenantId, clientScope, createdByUserId — NEVER from the form. The form's
// clientId is only a SELECTION, re-validated ∈ clientScope inside createClientJob
// (I1). Known domain errors map to { error }; anything else re-throws.

export type ClientJobActionResult = { error?: string };

const KNOWN_ERRORS = new Set([
  "CLIENT_SCOPE_MISMATCH",
  "LOCATION_CLIENT_MISMATCH",
  "LOCATION_NOT_FOUND",
  "CLIENT_NOT_FOUND",
  "PRIORITY_NOT_FOUND",
  "STATUS_NOT_FOUND",
]);

function toResult(err: unknown): ClientJobActionResult {
  const message = err instanceof Error ? err.message : String(err);
  if (KNOWN_ERRORS.has(message)) return { error: message };
  throw err;
}

export async function createClientJobAction(
  _prev: ClientJobActionResult | null,
  formData: FormData,
): Promise<ClientJobActionResult> {
  const ctx = await requireClient();

  // Identity from ctx (I1/I5) — never trusted from the form.
  const tenantId = ctx.activeTenant.tenantId;
  const clientScope = ctx.clientScope;
  const createdByUserId = ctx.user.id;

  // clientId resolution: at size 1, pin the sole scope member and IGNORE any form
  // value; at size > 1, take the form selection (re-validated ∈ scope by the
  // wrapper). Belt: even when a single-member scope, prefer the scope member.
  let clientId: string;
  if (clientScope.size === 1) {
    clientId = [...clientScope][0];
  } else {
    const raw = formData.get("clientId");
    if (typeof raw !== "string" || raw.length === 0) {
      return { error: "Please choose a client." };
    }
    clientId = raw;
  }

  const locationRaw = formData.get("clientLocationId");
  if (typeof locationRaw !== "string" || locationRaw.length === 0) {
    return { error: "Please choose a location." };
  }
  const descRaw = formData.get("problemDescription");
  if (typeof descRaw !== "string" || descRaw.trim().length === 0) {
    return { error: "Please describe the problem." };
  }

  let job;
  try {
    job = await createClientJob({
      tenantId,
      clientId,
      clientScope,
      clientLocationId: locationRaw,
      problemDescription: descRaw.trim(),
      createdByUserId,
      // priorityId omitted (F5a) → wrapper passes null
    });
  } catch (err) {
    return toResult(err);
  }

  // Success — redirect outside the try (Next's redirect throws by design).
  redirect(`/client/jobs/${job.id}`);
}
