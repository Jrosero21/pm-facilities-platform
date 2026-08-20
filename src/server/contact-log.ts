import "server-only";

import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import {
  communicationLogs,
  inboundMessages,
  jobEvents,
  outboundMessages,
} from "@/server/schema";
import { getJob } from "@/server/jobs";
import { listClientContacts } from "@/server/client-contacts";
import { writeAuditLog } from "@/server/audit";
import {
  CONTACT_LOG_CHANNEL,
  CONTACT_LOG_VISIBILITY,
  contactLogDeliveryStatus,
  contactLogSourceType,
  contactSummaryExcerpt,
  validateContactLog,
  type ContactDirection,
  type ContactParty,
} from "@/server/contact-log-content";

// ── G2 — LOG A CALL (record an off-system contact) ────────────────────────────────────
// The channel enum has carried 'phone_call' since Phase 6 with NO writer: the vocabulary existed
// and the path did not, so a call an operator made or took was invisible to the platform. This is
// that writer.
//
// ★ IT RECORDS, IT DOES NOT SEND. No sendCommunication, no provider, no getSendProvider — nothing
// here can reach the network. The contact ALREADY HAPPENED off-system; the row is history, not an
// instruction. The delivery status reflects that (see contactLogDeliveryStatus: both values are
// TERMINAL, so the provider path can never pick a logged call up and transmit it).
//
// ★ TWO SCHEMA CONSTRAINTS SHAPED THIS, both pre-existing and neither worth a migration for G2:
//   1. source_type + source_id are NOT NULL, so a spine row cannot exist without a content row.
//      The notes therefore land in the channel-detail table the direction implies —
//      outbound_messages for a call placed, inbound_messages for a call received. inbound_messages
//      was built for exactly this ("an operator manually logs an inbound message") and its
//      received_at column IS the occurredAt this feature needs.
//   2. communication_logs.job_id is NOT NULL with an FK to jobs, so a logged call is JOB-SCOPED.
//      A general "called the client about nothing in particular" has nowhere to live today. That
//      is a real limit of this build, recorded rather than worked around: making job_id nullable
//      would touch every reader of the spine and is not a G2-sized change.

export type LogContactInput = {
  tenantId: string;
  jobId: string;
  direction: ContactDirection;
  party: ContactParty;
  /** The specific person contacted, when known. Optional — a call to a main line has no contact row. */
  contactId?: string | null;
  /** Free-text record of what was discussed. Required — a log with no content records nothing. */
  notes: string;
  /** When the contact actually happened (NOT when it was typed up). */
  occurredAt: Date;
  actorUserId: string;
  /** Injected for determinism in tests; defaults to now. */
  now?: Date;
};

export type LoggedContact = { commId: string; sourceId: string };

/**
 * Record an off-system contact against a job.
 *
 * Throws: JOB_NOT_FOUND, CONTACT_NOT_IN_PARTY, plus the validation codes from
 * validateContactLog (CONTACT_NOTES_REQUIRED, CONTACT_NOTES_TOO_LONG,
 * CONTACT_OCCURRED_AT_INVALID, CONTACT_OCCURRED_AT_FUTURE).
 */
export async function logContact(input: LogContactInput): Promise<LoggedContact> {
  const invalid = validateContactLog(
    { notes: input.notes, occurredAt: input.occurredAt },
    input.now ?? new Date(),
  );
  if (invalid) throw new Error(invalid);

  // Tenant scoping: the job must be in THIS tenant. Everything else hangs off the job.
  const job = await getJob(input.tenantId, input.jobId);
  if (!job) throw new Error("JOB_NOT_FOUND");

  // Resolve the contact's name/phone when one was named — and prove it belongs to the party we
  // claim. A client contact id passed as a vendor contact would otherwise write a row asserting a
  // relationship that does not exist.
  let recipientId: string | null = null;
  let recipientPhone: string | null = null;
  let contactName: string | null = null;
  if (input.contactId) {
    if (input.party === "client") {
      const contacts = await listClientContacts(input.tenantId, job.clientId);
      const hit = contacts.find((c) => c.id === input.contactId);
      if (!hit) throw new Error("CONTACT_NOT_IN_PARTY");
      recipientId = hit.id;
      recipientPhone = hit.phone ?? null;
      contactName = hit.name;
    } else {
      // Vendor contacts are not reachable from the job alone (a job can carry several
      // assignments), so the caller names the contact and we verify it via its own vendor.
      const contacts = await listVendorContactsForId(input.tenantId, input.contactId);
      if (!contacts) throw new Error("CONTACT_NOT_IN_PARTY");
      recipientId = contacts.id;
      recipientPhone = contacts.phone ?? null;
      contactName = contacts.name;
    }
  }

  const notes = input.notes.trim();
  const summary = contactSummaryExcerpt(
    contactName ? `Call with ${contactName}: ${notes}` : notes,
  );
  const sourceType = contactLogSourceType(input.direction);
  const sourceId = uuidv7();
  const commId = uuidv7();

  await db.transaction(async (tx) => {
    // 1. the channel-detail row (the content the spine points at).
    if (sourceType === "inbound_message") {
      await tx.insert(inboundMessages).values({
        id: sourceId,
        tenantId: input.tenantId,
        externalSender: contactName,
        subject: `Phone call (${input.party})`,
        rawBody: notes,
        receivedAt: input.occurredAt,
        parseStatus: "unparsed",
        createdByUserId: input.actorUserId,
      });
    } else {
      await tx.insert(outboundMessages).values({
        id: sourceId,
        tenantId: input.tenantId,
        subject: `Phone call (${input.party})`,
        body: notes,
        createdByUserId: input.actorUserId,
      });
    }

    // 2. the communication spine row.
    await tx.insert(communicationLogs).values({
      id: commId,
      tenantId: input.tenantId,
      jobId: input.jobId,
      channel: CONTACT_LOG_CHANNEL,
      direction: input.direction,
      sourceType,
      sourceId,
      visibility: CONTACT_LOG_VISIBILITY,
      summary,
      sentByUserId: input.actorUserId,
      recipientType: input.party === "client" ? "client_contact" : "vendor_contact",
      recipientId,
      recipientPhone,
      deliveryStatus: contactLogDeliveryStatus(input.direction),
      // The call happened at occurredAt — record it on the timestamp that matches the direction,
      // so the spine's own tail tells the truth rather than defaulting to "when it was typed".
      ...(input.direction === "inbound"
        ? { deliveredAt: input.occurredAt }
        : { sentAt: input.occurredAt, deliveredAt: input.occurredAt }),
    });

    // 3. the job timeline. A call is an operator action on the job, so it belongs on the
    //    timeline for the same reason a dispatch notification does.
    await tx.insert(jobEvents).values({
      tenantId: input.tenantId,
      jobId: input.jobId,
      eventType: "contact.logged",
      actorUserId: input.actorUserId,
      summary: `${input.direction === "inbound" ? "Call received from" : "Call placed to"} ${
        contactName ?? (input.party === "client" ? "the client" : "the vendor")
      }`,
      metadata: {
        commId,
        party: input.party,
        direction: input.direction,
        contactId: recipientId,
        occurredAt: input.occurredAt.toISOString(),
      },
    });
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.actorUserId,
    action: "contact.logged",
    targetType: "communication_log",
    targetId: commId,
    metadata: {
      jobId: input.jobId,
      party: input.party,
      direction: input.direction,
      channel: CONTACT_LOG_CHANNEL,
      contactId: recipientId,
    },
  });

  return { commId, sourceId };
}

/** Find one vendor contact by id within the tenant, across that contact's own vendor. */
async function listVendorContactsForId(
  tenantId: string,
  contactId: string,
): Promise<{ id: string; name: string; phone: string | null } | null> {
  const { db: database } = await import("@/server/db");
  const { and, eq } = await import("drizzle-orm");
  const { vendorContacts } = await import("@/server/schema");
  const rows = await database
    .select({ id: vendorContacts.id, name: vendorContacts.name, phone: vendorContacts.phone })
    .from(vendorContacts)
    .where(and(eq(vendorContacts.tenantId, tenantId), eq(vendorContacts.id, contactId)))
    .limit(1);
  return rows[0] ?? null;
}
