"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { parseZonedDateTime } from "@/lib/datetime";
import { getJobSiteTimeZone } from "@/server/site-timezone";
import { logContact } from "@/server/contact-log";
import type { ContactDirection, ContactParty } from "@/server/contact-log-content";

export type LogContactState = { error: string } | null;

/**
 * G2 — operator records an off-system contact (a phone call) against a job.
 *
 * Bound with jobId; useActionState supplies (prev, formData). No role gate beyond requireTenant:
 * recording that a call happened is ordinary coordination work, the same tier as writing a job
 * note — not a financial action. The row is internal_only and carries no money.
 */
export async function logContactAction(
  jobId: string,
  _prev: LogContactState,
  formData: FormData,
): Promise<LogContactState> {
  const ctx = await requireTenant();

  const direction = formData.get("direction") === "inbound" ? "inbound" : "outbound";
  const party = formData.get("party") === "vendor" ? "vendor" : "client";
  const contactIdRaw = formData.get("contactId");
  const contactId =
    typeof contactIdRaw === "string" && contactIdRaw.trim() !== "" ? contactIdRaw.trim() : null;
  const notes = typeof formData.get("notes") === "string" ? String(formData.get("notes")) : "";

  // datetime-local yields "YYYY-MM-DDTHH:mm" with no zone. It is read as the SITE's wall clock —
  // the zone the form renders and labels — rather than the runtime's, so a logged call time does
  // not depend on where the server runs. Blank ⇒ now, so the common case (logging a call right
  // after hanging up) needs no typing.
  const siteTimeZone = await getJobSiteTimeZone(ctx.activeTenant.tenantId, jobId);
  const occurredRaw = formData.get("occurredAt");
  const occurredAt =
    typeof occurredRaw === "string" && occurredRaw.trim() !== ""
      ? parseZonedDateTime(occurredRaw, siteTimeZone) ?? new Date()
      : new Date();

  try {
    await logContact({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      direction: direction as ContactDirection,
      party: party as ContactParty,
      contactId,
      notes,
      occurredAt,
      actorUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "CONTACT_NOTES_REQUIRED":
          return { error: "Add a short note about what was discussed." };
        case "CONTACT_NOTES_TOO_LONG":
          return { error: "That note is too long — keep it under 5000 characters." };
        case "CONTACT_OCCURRED_AT_INVALID":
          return { error: "That date and time couldn't be read." };
        case "CONTACT_OCCURRED_AT_FUTURE":
          return { error: "A logged call can't be in the future." };
        case "JOB_NOT_FOUND":
          return { error: "Job not found in this tenant." };
        case "CONTACT_NOT_IN_PARTY":
          return { error: "That contact doesn't belong to the selected party." };
      }
    }
    throw err;
  }

  revalidatePath(`/jobs/${jobId}`);
  return null;
}
