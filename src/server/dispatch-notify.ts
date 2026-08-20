import "server-only";

import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { communicationLogs, jobEvents, outboundMessages } from "@/server/schema";
import { getAssignmentDetail } from "@/server/dispatch";
import { getJobDetail } from "@/server/jobs";
import { getVendor } from "@/server/vendors";
import { getVendorContact } from "@/server/vendor-contacts";
import { sendCommunication } from "@/server/communications";
import { renderWorkOrderPdf } from "@/server/work-order-pdf";
import { writeAuditLog } from "@/server/audit";
import { formatMoney } from "@/lib/money";

// ── Phase dispatch-notify — OUTBOUND VENDOR NOTIFICATION (compose → send, post-commit) ──
// The operator send seam finally TRANSMITS: after sendDispatch flips DRAFT→SENT, this notifies
// the vendor by email, reusing the Phase 19 send seam end-to-end (compose an outbound_message +
// communication_logs pair, then sendCommunication → getSendProvider → Capture/Resend). It is a
// POST-COMMIT side effect only — the dispatch state machine is never touched and NEVER blocked:
// a missing vendor email records the fact and moves on (warn-not-block, mirroring the
// never-block-billing doctrine). Content is the assignment's dispatchScope snapshot — the
// operator-APPROVED scope (proven), never the raw problem description — and carries no vendor
// cost (the builder has no cost input, so leakage is impossible by construction).

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Render a scheduled timestamp as stored (UTC accessors → deterministic). Null → null. */
function formatWhen(d: Date | null): string | null {
  if (!d) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export type DispatchNotificationInput = {
  jobNumber: number;
  clientName: string | null;
  locationName: string | null;
  tradeName: string | null;
  priorityName: string | null;
  scheduledStartAt: Date | null;
  // The ONLY dollar figure permitted in a vendor-facing body: the agreed NTE (deterministic,
  // operator-set — not an AI-derived number and NOT a vendor cost). No other money is an input.
  agreedNteAmount: string | null;
  // The assignment's dispatchScope snapshot = the operator-approved scope. Never the raw problem.
  approvedScope: string | null;
};

export type DispatchNotificationContent = { subject: string; body: string };

/**
 * Pure content builder — the ONLY new "surface" beyond the wiring. Given a dispatch's safe,
 * vendor-facing facts, produce { subject, body }. No DB, no I/O, deterministic. It cannot leak
 * vendor cost because cost is not an input; the only money it echoes is the agreed NTE.
 */
export function buildDispatchNotification(
  input: DispatchNotificationInput,
): DispatchNotificationContent {
  const where = input.locationName ?? input.clientName ?? "the client site";
  const subject = `New work order dispatched — #${input.jobNumber} at ${where}`;

  const lines: string[] = ["You've been dispatched to a new work order.", ""];
  lines.push(`Work order: #${input.jobNumber}`);
  if (input.clientName) lines.push(`Client: ${input.clientName}`);
  if (input.locationName) lines.push(`Location: ${input.locationName}`);
  if (input.tradeName) lines.push(`Trade: ${input.tradeName}`);
  if (input.priorityName) lines.push(`Priority: ${input.priorityName}`);
  const when = formatWhen(input.scheduledStartAt);
  if (when) lines.push(`Scheduled start: ${when}`);
  if (input.agreedNteAmount) lines.push(`Not-to-exceed: ${formatMoney(input.agreedNteAmount)}`);
  lines.push("");
  lines.push("Scope of work:");
  lines.push(input.approvedScope ?? "(scope to be confirmed by the coordinator)");
  lines.push("");
  lines.push("Please confirm receipt and reply with any questions.");

  return { subject, body: lines.join("\n") };
}

export type DispatchNotifyResult = {
  notified: boolean;
  reason?: "no_vendor_email" | "send_failed" | "assignment_not_found";
  commId?: string;
  deliveryStatus?: string;
  recipientEmail?: string;
};

/**
 * Orchestrate the vendor notification for a just-sent dispatch. Resolve the recipient email
 * (assignment vendor-contact email ?? vendor main_email), and:
 *   - no email  → record a "dispatch.notification_skipped" timeline event + audit, return
 *                 { notified:false, reason:"no_vendor_email" }. Never throws for this — warn-not-block.
 *   - email     → compose outbound_message + communication_logs (channel email) and hand to
 *                 sendCommunication (the Phase 19 live-send seam: capture-by-default, Resend when keyed).
 *                 On a successful send, also record a "dispatch.notification_sent" timeline event.
 *
 * Idempotency: this runs ONLY from sendDispatchAction, AFTER sendDispatch's one-shot DRAFT→SENT.
 * A re-trigger re-enters sendDispatch, which throws ASSIGNMENT_NOT_DRAFT before this is reached —
 * so the operator flow cannot notify twice. (sendCommunication additionally guards each comm row
 * via its provider_message_id short-circuit.)
 */
export async function notifyVendorOfDispatch(input: {
  tenantId: string;
  assignmentId: string;
  actorUserId: string | null;
}): Promise<DispatchNotifyResult> {
  const assignment = await getAssignmentDetail(input.tenantId, input.assignmentId);
  if (!assignment) return { notified: false, reason: "assignment_not_found" };

  // Recipient resolution: assignment's vendor-contact email first, vendor main_email as fallback.
  let recipientEmail: string | null = null;
  if (assignment.vendorContactId) {
    const contact = await getVendorContact(input.tenantId, assignment.vendorContactId);
    recipientEmail = contact?.email ?? null;
  }
  if (!recipientEmail) {
    const vendor = await getVendor(input.tenantId, assignment.vendorId);
    recipientEmail = vendor?.mainEmail ?? null;
  }

  // Warn-not-block: no deliverable email → record the gap on the timeline, do NOT fail.
  if (!recipientEmail) {
    await db.insert(jobEvents).values({
      tenantId: input.tenantId,
      jobId: assignment.jobId,
      eventType: "dispatch.notification_skipped",
      actorUserId: input.actorUserId,
      summary: `Dispatched to ${assignment.vendorName} — no vendor email on file; no notification sent.`,
      metadata: { assignmentId: input.assignmentId, vendorId: assignment.vendorId, reason: "no_vendor_email" },
    });
    await writeAuditLog({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "dispatch.notification_skipped",
      targetType: "job_vendor_assignment",
      targetId: input.assignmentId,
      metadata: { jobId: assignment.jobId, vendorId: assignment.vendorId, reason: "no_vendor_email" },
    });
    return { notified: false, reason: "no_vendor_email" };
  }

  // Job context for the body (client + location + priority live on the job, not the assignment).
  const job = await getJobDetail(input.tenantId, assignment.jobId);

  const { subject, body } = buildDispatchNotification({
    jobNumber: assignment.jobNumber,
    clientName: job?.clientName ?? null,
    locationName: job?.locationName ?? null,
    tradeName: assignment.matchedTradeName ?? job?.tradeName ?? null,
    priorityName: job?.priorityName ?? null,
    scheduledStartAt: assignment.scheduledStartAt ?? null,
    agreedNteAmount: assignment.agreedNteAmount ?? null,
    approvedScope: assignment.dispatchScope ?? null,
  });

  // ── vendor-WO batch 4 — RENDER THE WORK ORDER BEFORE COMPOSING ──────────────────────
  // Attached via G1's SendRequest.attachments seam. Rendering happens BEFORE the comm rows exist,
  // mirroring notifyClientOfInvoice: a render that fails must not strand an orphan draft row.
  //
  // ★ WARN-NOT-BLOCK, AND WEAKER THAN THE INVOICE'S RULE ON PURPOSE. notifyClientOfInvoice
  // REFUSES to mail an invoice whose PDF will not render, because a wrong invoice is worse than
  // no invoice. Here the email is the operative act — it is what tells the vendor to show up —
  // and the attachment is a convenience carrying facts already in the body. So a failed render
  // downgrades to "send the email without it and record why", never to "do not dispatch".
  let workOrder: { filename: string; bytes: Uint8Array } | null = null;
  let workOrderSkipReason: string | null = null;
  try {
    const rendered = await renderWorkOrderPdf(input.tenantId, input.assignmentId);
    if (rendered.kind === "ok") {
      workOrder = { filename: rendered.filename, bytes: rendered.bytes };
    } else {
      workOrderSkipReason = rendered.kind;
    }
  } catch (err) {
    // @react-pdf faults must not cost the vendor their dispatch email.
    workOrderSkipReason = "render_error";
    console.error("[dispatch-notify] work order render failed (email still sends):", err);
  }

  // Compose the outbound_message + communication_logs pair inline (mirrors send-link.ts — no helper).
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
    summary: workOrder
      ? `Dispatch notification + work order sent to ${recipientEmail}`
      : `Dispatch notification sent to ${recipientEmail}`,
    recipientType: "vendor_contact",
    recipientId: assignment.vendorContactId ?? null,
    recipientEmail,
    deliveryStatus: "draft",
  });

  const result = await sendCommunication({
    tenantId: input.tenantId,
    commId: clId,
    actorUserId: input.actorUserId ?? "",
    ...(workOrder
      ? {
          attachments: [
            {
              filename: workOrder.filename,
              content: workOrder.bytes,
              contentType: "application/pdf",
            },
          ],
        }
      : {}),
  });

  if (result.deliveryStatus === "sent") {
    await db.insert(jobEvents).values({
      tenantId: input.tenantId,
      jobId: assignment.jobId,
      eventType: "dispatch.notification_sent",
      actorUserId: input.actorUserId,
      summary: workOrder
        ? `Dispatch notification + work order emailed to ${recipientEmail}`
        : `Dispatch notification emailed to ${recipientEmail}`,
      metadata: {
        assignmentId: input.assignmentId,
        vendorId: assignment.vendorId,
        commId: clId,
        // Records WHETHER the work order went and, when it did not, WHY — so an operator asking
        // "did the vendor get the WO?" has an answer on the timeline rather than a guess.
        workOrderAttached: workOrder !== null,
        ...(workOrderSkipReason ? { workOrderSkipped: workOrderSkipReason } : {}),
      },
    });
  }

  return {
    notified: result.deliveryStatus === "sent",
    reason: result.deliveryStatus === "sent" ? undefined : "send_failed",
    commId: clId,
    deliveryStatus: result.deliveryStatus,
    recipientEmail,
  };
}
