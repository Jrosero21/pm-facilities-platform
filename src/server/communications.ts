import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { clientUpdateLogs, communicationLogs, outboundMessages, users } from "@/server/schema";
import { getJob } from "@/server/jobs";
import { getSendProvider } from "@/lib/integrations/send";
import { getJobNote } from "@/server/job-notes";
import { listClientContacts } from "@/server/client-contacts";
import { listVendorContacts } from "@/server/vendor-contacts";
import { listAssignmentsForJob } from "@/server/dispatch";
import {
  isLegalDeliveryTransition,
  type DeliveryStatus,
} from "@/components/delivery-status-badge";

export type CommunicationRow = typeof communicationLogs.$inferSelect;
export type ShareAudience = "client" | "vendor";

/** One communication by id, tenant-scoped. Lean — for guards/reload. */
export async function getCommunication(
  tenantId: string,
  id: string,
): Promise<CommunicationRow | null> {
  const rows = await db
    .select()
    .from(communicationLogs)
    .where(and(eq(communicationLogs.tenantId, tenantId), eq(communicationLogs.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

/** Communications for a job, newest first, with the sender name joined (display). */
export async function listCommunicationsForJob(tenantId: string, jobId: string) {
  return db
    .select({
      id: communicationLogs.id,
      channel: communicationLogs.channel,
      direction: communicationLogs.direction,
      visibility: communicationLogs.visibility,
      summary: communicationLogs.summary,
      deliveryStatus: communicationLogs.deliveryStatus,
      sourceType: communicationLogs.sourceType,
      sourceId: communicationLogs.sourceId,
      recipientType: communicationLogs.recipientType,
      recipientEmail: communicationLogs.recipientEmail,
      sentAt: communicationLogs.sentAt,
      deliveredAt: communicationLogs.deliveredAt,
      createdAt: communicationLogs.createdAt,
      sentByName: users.name,
    })
    .from(communicationLogs)
    .leftJoin(users, eq(communicationLogs.sentByUserId, users.id))
    .where(and(eq(communicationLogs.tenantId, tenantId), eq(communicationLogs.jobId, jobId)))
    .orderBy(desc(communicationLogs.createdAt));
}

export type CommunicationListItem = Awaited<
  ReturnType<typeof listCommunicationsForJob>
>[number];

/**
 * SHARE a note as a communication (the 6b deferred deliverable). SHARE-EXISTING mode:
 * the note IS the content — NO new channel-detail row; one communication_logs spine
 * row points at the note (source_type='job_note'). Single-row write → writeAuditLog
 * OUTSIDE the txn (R-4.5; the distinguisher is row-count, not the action verb).
 *
 * Visibility-gated: client share needs note.visibility ∈ {client_visible,
 * client_and_vendor_visible}; vendor share needs ∈ {vendor_visible,
 * client_and_vendor_visible}. The COMMUNICATION's visibility is audience-derived
 * (client→client_visible, vendor→vendor_visible) — a comm goes to ONE audience, so a
 * client_and_vendor_visible note shared with the vendor yields a vendor_visible comm.
 * Re-share is allowed (no uniqueness). delivery_status starts at 'draft' (Share ≠ Send).
 *
 * Throws: NOTE_NOT_FOUND, NOTE_NOT_SHAREABLE, JOB_NOT_FOUND.
 */
export async function shareNote(args: {
  tenantId: string;
  noteId: string;
  audience: ShareAudience;
  sentByUserId: string;
}): Promise<CommunicationRow> {
  const note = await getJobNote(args.tenantId, args.noteId);
  if (!note) throw new Error("NOTE_NOT_FOUND");

  const v = note.visibility;
  const shareable =
    args.audience === "client"
      ? v === "client_visible" || v === "client_and_vendor_visible"
      : v === "vendor_visible" || v === "client_and_vendor_visible";
  if (!shareable) throw new Error("NOTE_NOT_SHAREABLE");

  const job = await getJob(args.tenantId, note.jobId);
  if (!job) throw new Error("JOB_NOT_FOUND");

  // Recipient resolution (best-effort, pre-fill). Client = the job's client primary
  // contact (unambiguous). Vendor = the job's single assignment vendor's primary
  // contact, if exactly one (else left unresolved — multi/zero-vendor not auto-picked).
  let recipientType: "client_contact" | "vendor_contact";
  let recipientId: string | null = null;
  let recipientEmail: string | null = null;
  if (args.audience === "client") {
    recipientType = "client_contact";
    const contacts = await listClientContacts(args.tenantId, job.clientId);
    const primary = contacts.find((c) => c.isPrimary) ?? contacts[0];
    if (primary) {
      recipientId = primary.id;
      recipientEmail = primary.email ?? null;
    }
  } else {
    recipientType = "vendor_contact";
    const assignments = await listAssignmentsForJob(args.tenantId, note.jobId);
    const vendorIds = [...new Set(assignments.map((a) => a.vendorId))];
    if (vendorIds.length === 1) {
      const vc = await listVendorContacts(args.tenantId, vendorIds[0]);
      const primary = vc.find((c) => c.isPrimary) ?? vc[0];
      if (primary) {
        recipientId = primary.id;
        recipientEmail = primary.email ?? null;
      }
    }
  }

  const channel = args.audience === "client" ? "client_portal" : "vendor_portal";
  const visibility = args.audience === "client" ? "client_visible" : "vendor_visible";
  const summary = note.body.length > 200 ? `${note.body.slice(0, 197)}…` : note.body;
  const id = uuidv7();

  await db.insert(communicationLogs).values({
    id,
    tenantId: args.tenantId,
    jobId: note.jobId,
    channel,
    direction: "outbound",
    sourceType: "job_note",
    sourceId: note.id,
    visibility,
    summary,
    sentByUserId: args.sentByUserId,
    recipientType,
    recipientId,
    recipientEmail,
    deliveryStatus: "draft",
  });

  await writeAuditLog({
    tenantId: args.tenantId,
    userId: args.sentByUserId,
    action: "communication.created",
    targetType: "communication_log",
    targetId: id,
    metadata: { jobId: note.jobId, sourceType: "job_note", sourceId: note.id, audience: args.audience, channel },
  });

  const row = await getCommunication(args.tenantId, id);
  if (!row) throw new Error("Communication insert succeeded but row could not be reloaded.");
  return row;
}

/**
 * Advance a communication's delivery_status (the state machine — R-6.x). Single-row
 * update → writeAuditLog OUTSIDE (R-4.5). Validates the transition is legal; sets the
 * matching timestamp (sent→sent_at, delivered→delivered_at). Domain verb
 * communication.<status> (R-5.6).
 *
 * Throws: COMMUNICATION_NOT_FOUND, INVALID_DELIVERY_TRANSITION.
 */
export async function updateCommunicationDeliveryStatus(args: {
  tenantId: string;
  commId: string;
  toStatus: DeliveryStatus;
  actorUserId: string;
}): Promise<CommunicationRow> {
  const comm = await getCommunication(args.tenantId, args.commId);
  if (!comm) throw new Error("COMMUNICATION_NOT_FOUND");
  if (!isLegalDeliveryTransition(comm.deliveryStatus, args.toStatus))
    throw new Error("INVALID_DELIVERY_TRANSITION");

  const set: Partial<typeof communicationLogs.$inferInsert> = {
    deliveryStatus: args.toStatus,
  };
  if (args.toStatus === "sent") set.sentAt = sql`now()` as never;
  if (args.toStatus === "delivered") set.deliveredAt = sql`now()` as never;

  await db.update(communicationLogs).set(set).where(eq(communicationLogs.id, args.commId));

  await writeAuditLog({
    tenantId: args.tenantId,
    userId: args.actorUserId,
    action: `communication.${args.toStatus}`,
    targetType: "communication_log",
    targetId: args.commId,
    metadata: { from: comm.deliveryStatus, to: args.toStatus, jobId: comm.jobId },
  });

  const row = await getCommunication(args.tenantId, args.commId);
  if (!row) throw new Error("Communication update succeeded but row could not be reloaded.");
  return row;
}

/**
 * Resolve the real subject + body for an outbound send. communication_logs carries only a
 * short `summary` (an excerpt) — the FULL content lives in the polymorphic source row, keyed
 * by source_type/source_id (Phase 19c-A finding). We resolve the source content, never the
 * summary. Every read is tenant-scoped. Fails LOUD on an unsupported source — we never fall
 * back to sending a truncated summary.
 *
 * Throws: UNRESOLVABLE_SEND_SOURCE (unsupported source_type or missing source row).
 */
async function resolveSendContent(
  tenantId: string,
  comm: CommunicationRow,
): Promise<{ subject: string; body: string }> {
  if (comm.sourceType === "client_update") {
    const rows = await db
      .select({ content: clientUpdateLogs.content })
      .from(clientUpdateLogs)
      .where(and(eq(clientUpdateLogs.tenantId, tenantId), eq(clientUpdateLogs.id, comm.sourceId)))
      .limit(1);
    if (!rows[0]) throw new Error("UNRESOLVABLE_SEND_SOURCE");
    // client_update_logs has no subject column — derive one from the job context.
    const job = await getJob(tenantId, comm.jobId);
    const subject = job ? `Update on work order #${job.jobNumber}` : "Work order update";
    return { subject, body: rows[0].content };
  }
  if (comm.sourceType === "outbound_message") {
    const rows = await db
      .select({ subject: outboundMessages.subject, body: outboundMessages.body })
      .from(outboundMessages)
      .where(and(eq(outboundMessages.tenantId, tenantId), eq(outboundMessages.id, comm.sourceId)))
      .limit(1);
    if (!rows[0]) throw new Error("UNRESOLVABLE_SEND_SOURCE");
    return { subject: rows[0].subject ?? "Message from PM Facilities", body: rows[0].body };
  }
  throw new Error("UNRESOLVABLE_SEND_SOURCE");
}

/**
 * Send a communication for real via the configured provider, then flip its delivery_status.
 * The live-send path that wraps the pure flip (updateCommunicationDeliveryStatus stays for
 * non-send transitions like delivered/bounced). Phase 19 — OPERATOR-triggered only (autonomous
 * sending is Phase 23). Provider is capture-by-default (getSendProvider; ResendProvider only
 * when RESEND_API_KEY is present and SEND_CAPTURE!=1).
 *
 * Idempotency (§2.6), two layers:
 *   (a) provider_message_id-present / already-sent short-circuit — returns early, NO provider call;
 *   (b) the legal-transition guard — only draft/queued/failed → sent is allowed.
 *
 * Throws: COMMUNICATION_NOT_FOUND, INVALID_DELIVERY_TRANSITION, MISSING_RECIPIENT,
 *         UNRESOLVABLE_SEND_SOURCE.
 */
export async function sendCommunication(args: {
  tenantId: string;
  commId: string;
  actorUserId: string;
}): Promise<CommunicationRow> {
  const row = await getCommunication(args.tenantId, args.commId);
  if (!row) throw new Error("COMMUNICATION_NOT_FOUND");

  // (a) durable idempotency: already handed to a provider (or already sent) → do NOT re-send.
  if (row.deliveryStatus === "sent" || row.providerMessageId != null) {
    return row;
  }
  // (b) transition legality: draft/queued/failed → sent; delivered/bounced/received are not.
  if (!isLegalDeliveryTransition(row.deliveryStatus, "sent")) {
    throw new Error("INVALID_DELIVERY_TRANSITION");
  }
  if (!row.recipientEmail) throw new Error("MISSING_RECIPIENT");

  const { subject, body } = await resolveSendContent(args.tenantId, row);

  const provider = getSendProvider();
  const result = await provider.send({ to: row.recipientEmail, subject, body, commId: row.id });

  if (result.status === "sent") {
    await db
      .update(communicationLogs)
      .set({
        deliveryStatus: "sent",
        sentAt: sql`now()` as never,
        providerMessageId: result.providerMessageId,
        attempts: row.attempts + 1,
      })
      .where(eq(communicationLogs.id, row.id));
    await writeAuditLog({
      tenantId: args.tenantId,
      userId: args.actorUserId,
      action: "communication.sent",
      targetType: "communication_log",
      targetId: row.id,
      metadata: { from: row.deliveryStatus, to: "sent", jobId: row.jobId, provider: provider.name },
    });
  } else {
    await db
      .update(communicationLogs)
      .set({
        deliveryStatus: "failed",
        attempts: row.attempts + 1,
        lastError: result.error,
      })
      .where(eq(communicationLogs.id, row.id));
    await writeAuditLog({
      tenantId: args.tenantId,
      userId: args.actorUserId,
      action: "communication.failed",
      targetType: "communication_log",
      targetId: row.id,
      metadata: { from: row.deliveryStatus, to: "failed", jobId: row.jobId, provider: provider.name, error: result.error },
    });
  }

  const reloaded = await getCommunication(args.tenantId, args.commId);
  if (!reloaded) throw new Error("Communication send succeeded but row could not be reloaded.");
  return reloaded;
}
