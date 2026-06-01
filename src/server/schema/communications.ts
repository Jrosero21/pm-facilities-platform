import {
  datetime,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { jobs } from "./jobs";

const statusEnum = ["active", "inactive", "archived"] as const;

// The 5-value visibility vocabulary — app-wide across job_notes (6b),
// dispatch_messages (Phase 5), and communication_logs (here). The values MUST match
// the other declarations (job-details.ts / dispatch-comms.ts); NoteVisibilityBadge
// renders any of them. (R-6.x: reused, never re-declared — centralizing the literal
// into one shared constant is a worthwhile DRY follow-up flagged at 6d; the values are
// identical across all three sites today so there is no drift / the badge works.)
const visibilityEnum = [
  "internal_only",
  "vendor_visible",
  "client_visible",
  "client_and_vendor_visible",
  "requires_review",
] as const;

// Communication channels (roadmap §8 Phase 6). Source-agnostic.
const channelEnum = [
  "internal_note",
  "vendor_portal",
  "client_portal",
  "email",
  "sms",
  "external_portal",
  "phone_call",
] as const;

// Delivery lifecycle. Phase 6 active: draft / sent / delivered / received (+ queued
// from 6f's portal_update_queue). Structural for Phase 13 auto-send: failed / bounced.
// `read` is the read_at timestamp, NOT a status — delivery_status and read are
// independent concerns (R-6.x: a delivered comm can be unread).
const deliveryStatusEnum = [
  "draft",
  "queued",
  "sent",
  "delivered",
  "failed",
  "bounced",
  "received",
] as const;

// The communication's content source (polymorphic discriminator → source_id, R-6.x).
// Full Phase 6 vocabulary locked now to avoid enum ALTERs in 6e/6f: dispatch_message
// (Phase 5 channel), outbound_message + inbound_message (6e channels), job_note (the
// 6e share action), client_update + vendor_update (the 6f update logs, which surface
// as communications per the 6a unifying-log model).
const sourceTypeEnum = [
  "dispatch_message",
  "outbound_message",
  "inbound_message",
  "job_note",
  "client_update",
  "vendor_update",
] as const;

// Polymorphic recipient (R-6.x): vendor_contact / client_contact reference a contact
// row via recipient_id (no FK — spans two contact tables); external = recipient_id
// null + recipient_email/phone; internal = no real recipient (a logged internal comm);
// none = structural, no Phase 6 use case (future log-style entries).
const recipientTypeEnum = [
  "vendor_contact",
  "client_contact",
  "external",
  "internal",
  "none",
] as const;

// communication_logs — the UNIFYING LOG SPINE (6a Option B). SUPERSEDES Phase 5 R-5.15:
// the delivery layer lives HERE, not on dispatch_messages. One row per communication —
// the denormalized log over the channel-detail tables (dispatch_messages /
// outbound_messages / inbound_messages / job_notes / update logs) linked via
// source_type + source_id (polymorphic, no FK). `summary` is an immutable create-time
// excerpt for the timeline + log (the full body lives in the channel-detail row).
// Append-on-create with a MUTABLE delivery tail (sent_at/delivered_at/read_at +
// delivery_status) — distinct from job_events' strict immutability.
export const communicationLogs = mysqlTable(
  "communication_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    channel: mysqlEnum("channel", channelEnum).notNull(),
    direction: mysqlEnum("direction", ["outbound", "inbound", "internal"]).notNull(),
    sourceType: mysqlEnum("source_type", sourceTypeEnum).notNull(),
    sourceId: varchar("source_id", { length: 36 }).notNull(),
    visibility: mysqlEnum("visibility", visibilityEnum).notNull().default("internal_only"),
    summary: varchar("summary", { length: 500 }).notNull(),
    sentByUserId: varchar("sent_by_user_id", { length: 36 }),
    recipientType: mysqlEnum("recipient_type", recipientTypeEnum).notNull().default("none"),
    recipientId: varchar("recipient_id", { length: 36 }),
    recipientEmail: varchar("recipient_email", { length: 255 }),
    recipientPhone: varchar("recipient_phone", { length: 32 }),
    cc: text("cc"),
    bcc: text("bcc"),
    deliveryStatus: mysqlEnum("delivery_status", deliveryStatusEnum)
      .notNull()
      .default("draft"),
    sentAt: datetime("sent_at"),
    deliveredAt: datetime("delivered_at"),
    readAt: datetime("read_at"),
    // Phase 19 (0042) — live-send provider tracking. Additive, nullable/defaulted; the
    // send adapter writes provider_message_id on success and last_error on failure;
    // attempts counts send tries (idempotency/observability). No FK.
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    attempts: int("attempts").notNull().default(0),
    lastError: text("last_error"),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "cl_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.jobId], foreignColumns: [jobs.id], name: "cl_job_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.sentByUserId], foreignColumns: [users.id], name: "cl_sent_by_fk" }).onDelete("set null"),
    index("cl_tenant_job_created_idx").on(t.tenantId, t.jobId, t.createdAt),
    index("cl_source_idx").on(t.sourceType, t.sourceId),
    index("cl_tenant_status_idx").on(t.tenantId, t.deliveryStatus),
    index("cl_tenant_channel_idx").on(t.tenantId, t.channel),
    index("cl_tenant_recipient_idx").on(t.tenantId, t.recipientType, t.recipientId),
  ],
);

// email_templates — canned message bodies with {{mustache}} placeholders. Phase 6
// ships the table + (6e) a management UI ONLY; the substitution/rendering + send
// pipeline is Phase 13. applicable_channels JSON validity is application-layer (the DB
// only enforces json_valid). Declared before outbound_messages (FK target).
export const emailTemplates = mysqlTable(
  "email_templates",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    subjectTemplate: varchar("subject_template", { length: 500 }),
    bodyTemplate: text("body_template").notNull(),
    applicableChannels: json("applicable_channels").notNull(),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "et_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.createdByUserId], foreignColumns: [users.id], name: "et_created_by_fk" }).onDelete("set null"),
    uniqueIndex("et_tenant_name_unique").on(t.tenantId, t.name),
  ],
);

// outbound_messages — channel-detail (Model X) for ad-hoc composed outbound
// communications (operator-authored, not a dispatch message and not a shared note).
// Common fields (channel/direction/recipient/delivery/visibility/job) live on the
// communication_logs spine; this carries the full content + optional template link.
export const outboundMessages = mysqlTable(
  "outbound_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    subject: varchar("subject", { length: 255 }),
    body: text("body").notNull(),
    templateId: varchar("template_id", { length: 36 }),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "om_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.templateId], foreignColumns: [emailTemplates.id], name: "om_template_fk" }).onDelete("set null"),
    foreignKey({ columns: [t.createdByUserId], foreignColumns: [users.id], name: "om_created_by_fk" }).onDelete("set null"),
    index("om_tenant_idx").on(t.tenantId),
  ],
);

// inbound_messages — channel-detail (Model X) for inbound communications. Phase 6: an
// operator manually logs an inbound message (pastes raw_body); Phase 13's email parser
// auto-populates + advances parse_status. external_sender is the outside party (not a
// user). Common fields live on the spine.
export const inboundMessages = mysqlTable(
  "inbound_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    externalSender: varchar("external_sender", { length: 255 }),
    subject: varchar("subject", { length: 255 }),
    rawBody: text("raw_body").notNull(),
    receivedAt: datetime("received_at").notNull(),
    parseStatus: varchar("parse_status", { length: 32 }).notNull().default("unparsed"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "im_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.createdByUserId], foreignColumns: [users.id], name: "im_created_by_fk" }).onDelete("set null"),
    index("im_tenant_parse_idx").on(t.tenantId, t.parseStatus),
  ],
);
