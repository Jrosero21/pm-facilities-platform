import "server-only";

import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { communicationLogs, jobEvents, outboundMessages } from "@/server/schema";
import { getClientInvoice } from "@/server/billing/client-invoices";
import { renderClientInvoicePdf } from "@/server/billing/invoice-pdf";
import { getJobDetail } from "@/server/jobs";
import { getClient } from "@/server/clients";
import { listClientContacts } from "@/server/client-contacts";
import { getTenantCompanyProfile } from "@/server/tenant-settings";
import { sendCommunication } from "@/server/communications";
import { writeAuditLog } from "@/server/audit";
import { buildInvoiceNotification } from "@/server/billing/invoice-notify-content";

// The pure subject/body builder lives in ./invoice-notify-content (no "server-only") so it is
// unit-testable; re-exported here so callers have one import site for the notification surface.
export {
  buildInvoiceNotification,
  type InvoiceNotificationContent,
  type InvoiceNotificationInput,
} from "@/server/billing/invoice-notify-content";

// ── G1 batch 2 — OUTBOUND CLIENT INVOICE NOTIFICATION (render → compose → send, post-commit) ──
// Closes the G1 gap: sendClientInvoice was a PURE STATUS FLIP, so "sent" meant issued-in-the-system
// and the client learned of it only by logging into the portal. This is the same shape dispatch-notify
// used to close the identical gap on dispatch — deliberately, so the platform has ONE outbound
// pattern rather than two.
//
// POST-COMMIT SIDE EFFECT ONLY. The AR state machine is never touched and NEVER blocked: a missing
// client email, or a PDF the renderer refuses, records the fact and returns — mirroring the
// never-block-billing doctrine. An invoice that issued stays issued even if nothing could be mailed.
//
// ★ THE PDF IS ATTACHED, NOT LINKED. The download route is requireTenant-gated, so a link would send
// a client contact — who has no session — to a login redirect. Attaching is the only delivery that
// works today; a tokenised link is the magic-link shape and is NOT built here.
//
// IDEMPOTENCY (verified, not assumed). client_invoices.status has exactly two writers, both in
// client-invoices.ts: draft→sent (:348) and sent→void (:370). totals.ts and payments.ts update the
// row but touch only money/payment_status, never status. There is NO un-void and NO reopen-to-draft
// path anywhere in the codebase, so sendClientInvoice's `status !== "draft"` guard
// (ClientInvoiceNotSendable) is a genuine one-shot — the operator flow cannot notify twice. This
// matches dispatch's ASSIGNMENT_NOT_DRAFT protection. sendCommunication additionally guards each
// comm row via its provider_message_id short-circuit.

export type InvoiceNotifyResult = {
  notified: boolean;
  reason?:
    | "invoice_not_found"
    | "no_client_email"
    | "pdf_not_renderable"
    | "send_failed";
  commId?: string;
  deliveryStatus?: string;
  recipientEmail?: string;
};

/**
 * Resolve the invoice recipient: the client's PRIMARY contact email, else the first non-archived
 * contact that HAS an email. listClientContacts already orders primary-first then by name, so this
 * walks that order and takes the first deliverable address — a primary contact with a null email
 * does not block a secondary contact who has one.
 */
async function resolveClientRecipient(
  tenantId: string,
  clientId: string,
): Promise<{ email: string; contactId: string } | null> {
  const contacts = await listClientContacts(tenantId, clientId);
  const withEmail = contacts.find((c) => c.email !== null && c.email.trim() !== "");
  if (!withEmail || !withEmail.email) return null;
  return { email: withEmail.email, contactId: withEmail.id };
}

/** Record a skip on the job timeline + audit, and return the result. Never throws. */
async function recordSkip(args: {
  tenantId: string;
  jobId: string;
  clientInvoiceId: string;
  actorUserId: string | null;
  reason: NonNullable<InvoiceNotifyResult["reason"]>;
  summary: string;
  metadata?: Record<string, unknown>;
}): Promise<InvoiceNotifyResult> {
  await db.insert(jobEvents).values({
    tenantId: args.tenantId,
    jobId: args.jobId,
    eventType: "client_invoice.notification_skipped",
    actorUserId: args.actorUserId,
    summary: args.summary,
    metadata: { clientInvoiceId: args.clientInvoiceId, reason: args.reason, ...args.metadata },
  });
  await writeAuditLog({
    tenantId: args.tenantId,
    userId: args.actorUserId,
    action: "client_invoice.notification_skipped",
    targetType: "client_invoice",
    targetId: args.clientInvoiceId,
    metadata: { jobId: args.jobId, reason: args.reason, ...args.metadata },
  });
  return { notified: false, reason: args.reason };
}

/**
 * Notify the client of a just-issued invoice, with the invoice PDF attached.
 *
 * Runs ONLY from sendClientInvoiceAction, AFTER sendClientInvoice's one-shot draft→sent commits.
 * Warn-not-block at every failure point:
 *   - invoice gone           → { notified:false, reason:"invoice_not_found" } (no event; nothing to attach it to)
 *   - no deliverable email   → timeline event + audit, reason "no_client_email"
 *   - PDF refused/absent     → timeline event + audit, reason "pdf_not_renderable". The cost-plus
 *                              guard lands here: an invoice whose PDF would not add up is issued but
 *                              NOT mailed, which is the correct outcome — never mail a wrong document.
 *   - provider failure       → the comm row records 'failed' (sendCommunication owns that write)
 */
export async function notifyClientOfInvoice(input: {
  tenantId: string;
  clientInvoiceId: string;
  actorUserId: string | null;
}): Promise<InvoiceNotifyResult> {
  const inv = await getClientInvoice(input.tenantId, input.clientInvoiceId);
  if (!inv) return { notified: false, reason: "invoice_not_found" };

  const [job, client, company] = await Promise.all([
    getJobDetail(input.tenantId, inv.jobId),
    getClient(input.tenantId, inv.clientId),
    // Same identity the PDF letterhead prints, from the same accessor — so the email the client
    // reads and the document attached to it name the SAME company. tenants.name is NOT NULL, so
    // there is always a sender name even before the company profile is populated.
    getTenantCompanyProfile(input.tenantId),
  ]);

  const recipient = await resolveClientRecipient(input.tenantId, inv.clientId);
  if (!recipient) {
    return recordSkip({
      tenantId: input.tenantId,
      jobId: inv.jobId,
      clientInvoiceId: input.clientInvoiceId,
      actorUserId: input.actorUserId,
      reason: "no_client_email",
      summary: `Invoice ${inv.invoiceNumber ?? input.clientInvoiceId} issued — no client contact email on file; no notification sent.`,
      metadata: { clientId: inv.clientId },
    });
  }

  // Render BEFORE composing: a refused PDF must not leave an orphan draft comm row behind.
  const pdf = await renderClientInvoicePdf(input.tenantId, input.clientInvoiceId);
  if (pdf.kind !== "ok") {
    return recordSkip({
      tenantId: input.tenantId,
      jobId: inv.jobId,
      clientInvoiceId: input.clientInvoiceId,
      actorUserId: input.actorUserId,
      reason: "pdf_not_renderable",
      summary: `Invoice ${inv.invoiceNumber ?? input.clientInvoiceId} issued — invoice PDF could not be produced; no notification sent.`,
      metadata: { clientId: inv.clientId, pdfOutcome: pdf.kind },
    });
  }

  const invoiceLabel = inv.invoiceNumber ?? `#${inv.sequenceNumber ?? ""}`.trim();
  const { subject, body } = buildInvoiceNotification({
    invoiceLabel,
    jobNumber: job?.jobNumber ?? null,
    clientName: client?.name ?? job?.clientName ?? null,
    locationName: job?.locationName ?? null,
    total: inv.total,
    currency: inv.currency,
    dueAt: inv.dueAt ?? null,
    paymentTermsDays: inv.paymentTermsDays ?? null,
    fromName: company?.legalName ?? company?.name ?? "your service coordinator",
  });

  // Compose the outbound_message + communication_logs pair inline (mirrors dispatch-notify).
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
    jobId: inv.jobId,
    channel: "email",
    direction: "outbound",
    sourceType: "outbound_message",
    sourceId: omId,
    summary: `Invoice ${invoiceLabel} emailed to ${recipient.email}`,
    recipientType: "client_contact",
    recipientId: recipient.contactId,
    recipientEmail: recipient.email,
    deliveryStatus: "draft",
  });

  const result = await sendCommunication({
    tenantId: input.tenantId,
    commId: clId,
    actorUserId: input.actorUserId ?? "",
    attachments: [
      { filename: pdf.filename, content: pdf.bytes, contentType: "application/pdf" },
    ],
  });

  if (result.deliveryStatus === "sent") {
    await db.insert(jobEvents).values({
      tenantId: input.tenantId,
      jobId: inv.jobId,
      eventType: "client_invoice.notification_sent",
      actorUserId: input.actorUserId,
      summary: `Invoice ${invoiceLabel} emailed to ${recipient.email}`,
      metadata: {
        clientInvoiceId: input.clientInvoiceId,
        clientId: inv.clientId,
        commId: clId,
        attachment: pdf.filename,
      },
    });
  }

  return {
    notified: result.deliveryStatus === "sent",
    reason: result.deliveryStatus === "sent" ? undefined : "send_failed",
    commId: clId,
    deliveryStatus: result.deliveryStatus,
    recipientEmail: recipient.email,
  };
}
