import "server-only";

import { and, desc, eq, gte } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { communicationLogs, jobEvents, outboundMessages } from "@/server/schema";
import { getAssignmentDetail } from "@/server/dispatch";
import { getVendor } from "@/server/vendors";
import { getVendorContact } from "@/server/vendor-contacts";
import { sendCommunication } from "@/server/communications";
import { renderWorkOrderPdf } from "@/server/work-order-pdf";
import { writeAuditLog } from "@/server/audit";

// ── vendor-WO batch 4 — RESEND THE WORK ORDER ─────────────────────────────────────────
// The "vendor lost it" / "scope or NTE changed, send a fresh one" case. Re-renders the work order
// from CURRENT state and emails it again.
//
// ★ THIS IS DELIBERATELY NOT IDEMPOTENT, and that is the difference from every other send in the
// platform. notifyClientOfInvoice and notifyVendorOfDispatch are one-shots protected by a state
// transition (draft→sent, DRAFT→SENT): sending twice would be a bug. A resend is an operator
// asking for it AGAIN, usually because something changed — refusing the second one would break
// the feature. So the guard here is against the ACCIDENT (a double-click, a double-submit), not
// against the intent.
//
// ★ THE GUARD IS A SHORT COOLDOWN, not a confirm dialog. A confirm lives in the browser and does
// nothing about a duplicated form post, a retried action, or two operators clicking at once; a
// server-side window catches all three. RESEND_COOLDOWN_SECONDS is deliberately short — long
// enough that no human meant two sends that fast, short enough that a genuine "fix the NTE and
// resend" round trip is never blocked.
//
// ★ IT RE-RENDERS, IT DOES NOT REPLAY. The point of a resend is that the document reflects the
// CURRENT scope, NTE and dispatch instructions. Re-attaching stored bytes would send the vendor a
// stale document precisely when the operator resent it because something changed.

const RESEND_COOLDOWN_SECONDS = 60;

/** The marker the cooldown lookup matches on. Only resendWorkOrder writes this prefix. */
const RESEND_SUMMARY_PREFIX = "Work order re-sent to ";

export type ResendWorkOrderResult = {
  sent: boolean;
  reason?:
    | "assignment_not_found"
    | "no_vendor_email"
    | "work_order_not_renderable"
    | "cooldown"
    | "send_failed";
  commId?: string;
  recipientEmail?: string;
};

/**
 * Re-render and re-send the work order for one assignment.
 *
 * Every failure is a recorded fact rather than an exception — the caller is an operator action
 * that should report, not crash.
 *
 * ★ UNLIKE THE DISPATCH EMAIL, A FAILED RENDER ABORTS. There is no email to fall back to here:
 * the whole purpose of this action is to deliver the document. Sending a "here is your work
 * order" message with nothing attached would be worse than telling the operator it failed.
 */
export async function resendWorkOrder(input: {
  tenantId: string;
  assignmentId: string;
  actorUserId: string | null;
  now?: Date;
}): Promise<ResendWorkOrderResult> {
  const now = input.now ?? new Date();

  const assignment = await getAssignmentDetail(input.tenantId, input.assignmentId);
  if (!assignment) return { sent: false, reason: "assignment_not_found" };

  // ── Accidental double-fire guard: did we already resend this assignment moments ago? ──
  // Matched on our own summary marker rather than a new column: the resend is the only writer of
  // that prefix, and the window is seconds wide. One query, newest first.
  const cutoff = new Date(now.getTime() - RESEND_COOLDOWN_SECONDS * 1000);
  const recent = await db
    .select({ summary: communicationLogs.summary })
    .from(communicationLogs)
    .where(
      and(
        eq(communicationLogs.tenantId, input.tenantId),
        eq(communicationLogs.jobId, assignment.jobId),
        eq(communicationLogs.channel, "email"),
        gte(communicationLogs.createdAt, cutoff),
      ),
    )
    .orderBy(desc(communicationLogs.createdAt));
  if (recent.some((r) => r.summary.startsWith(RESEND_SUMMARY_PREFIX))) {
    return { sent: false, reason: "cooldown" };
  }

  // Recipient: the assignment's vendor contact, else the vendor's main email — the SAME chain
  // dispatch-notify uses, so a resend reaches whoever the dispatch reached.
  let recipientEmail: string | null = null;
  if (assignment.vendorContactId) {
    const contact = await getVendorContact(input.tenantId, assignment.vendorContactId);
    recipientEmail = contact?.email ?? null;
  }
  if (!recipientEmail) {
    const vendor = await getVendor(input.tenantId, assignment.vendorId);
    recipientEmail = vendor?.mainEmail ?? null;
  }
  if (!recipientEmail) return { sent: false, reason: "no_vendor_email" };

  // Re-render from CURRENT state.
  const rendered = await renderWorkOrderPdf(input.tenantId, input.assignmentId);
  if (rendered.kind !== "ok") {
    return { sent: false, reason: "work_order_not_renderable" };
  }

  const subject = `Work order ${assignment.jobNumber !== null ? `#${assignment.jobNumber}` : ""} — ${assignment.vendorName}`.trim();
  const body = [
    "A copy of the work order for this job is attached.",
    "",
    assignment.jobNumber !== null ? `Work order: #${assignment.jobNumber}` : null,
    "",
    "This is the current version — it supersedes any earlier copy.",
    "Please confirm receipt and reply with any questions.",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  const omId = uuidv7();
  await db.insert(outboundMessages).values({
    id: omId,
    tenantId: input.tenantId,
    subject,
    body,
    createdByUserId: input.actorUserId,
  });

  const clId = uuidv7();
  await db.insert(communicationLogs).values({
    id: clId,
    tenantId: input.tenantId,
    jobId: assignment.jobId,
    channel: "email",
    direction: "outbound",
    sourceType: "outbound_message",
    sourceId: omId,
    summary: `${RESEND_SUMMARY_PREFIX}${recipientEmail}`,
    recipientType: "vendor_contact",
    recipientId: assignment.vendorContactId ?? null,
    recipientEmail,
    deliveryStatus: "draft",
  });

  const result = await sendCommunication({
    tenantId: input.tenantId,
    commId: clId,
    actorUserId: input.actorUserId ?? "",
    attachments: [
      { filename: rendered.filename, content: rendered.bytes, contentType: "application/pdf" },
    ],
  });

  if (result.deliveryStatus === "sent") {
    await db.insert(jobEvents).values({
      tenantId: input.tenantId,
      jobId: assignment.jobId,
      eventType: "dispatch.work_order_resent",
      actorUserId: input.actorUserId,
      summary: `Work order re-sent to ${recipientEmail}`,
      metadata: {
        assignmentId: input.assignmentId,
        vendorId: assignment.vendorId,
        commId: clId,
        attachment: rendered.filename,
      },
    });
    await writeAuditLog({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "dispatch.work_order_resent",
      targetType: "job_vendor_assignment",
      targetId: input.assignmentId,
      metadata: { jobId: assignment.jobId, vendorId: assignment.vendorId, commId: clId },
    });
    return { sent: true, commId: clId, recipientEmail };
  }

  return { sent: false, reason: "send_failed", commId: clId, recipientEmail };
}
