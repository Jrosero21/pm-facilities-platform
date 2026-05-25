import {
  foreignKey,
  index,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { jobVendorAssignments } from "./dispatch-assignments";

const statusEnum = ["active", "inactive", "archived"] as const;

// Visibility axis required by D-4.10 — "anything shareable externally carries a
// visibility column from day one", which names dispatch_messages explicitly as a
// forward pointer. Phase 5 only ever sets internal_only; Phase 6 expands the picker
// and the visibility-control workflows. Mirrors job_notes.visibility exactly.
const visibilityEnum = [
  "internal_only",
  "vendor_visible",
  "client_visible",
  "client_and_vendor_visible",
  "requires_review",
] as const;

// dispatch_messages — log of dispatch communications. Phase 5 captures message
// CONTENT + METADATA only (direction, type, subject, body, visibility); it does
// NOT send (the operator forwards manually outside the system) and has NO recipient
// fields whatsoever. The recipient for an assignment's messages is implicitly the
// assignment's vendor_contact_id. The entire RECIPIENT LAYER (per-message routing,
// CC/BCC, address-book selection, channel-specific addresses) AND the DELIVERY
// LAYER (send/bounce/read tracking) are Phase 6's responsibility — a half-built
// recipient_contact_id here would only leak that concern into Phase 5 (documented
// in 10-known-limitations.md at closeout).
//
// `direction` is added now (NOT speculative — Phase 6 §9 structurally distinguishes
// outbound vs inbound; spares Phase 6 a backfill, same rationale as
// job_notes.visibility). Defaults 'outbound' — every Phase 5 row is operator →
// vendor. `visibility` per D-4.10; `status` is the standard soft-delete axis.
//
// message_type is a varchar(64) with a DOCUMENTED vocabulary, not an enum, so it
// grows without a migration (mirrors job_events.event_type, D-4.5). Phase 5 vocab:
// dispatch_notice, reminder, schedule_request, schedule_confirmation, cancellation,
// general.
export const dispatchMessages = mysqlTable(
  "dispatch_messages",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    assignmentId: varchar("assignment_id", { length: 36 }).notNull(),
    direction: mysqlEnum("direction", ["outbound", "inbound"])
      .notNull()
      .default("outbound"),
    messageType: varchar("message_type", { length: 64 }).notNull(),
    subject: varchar("subject", { length: 255 }),
    body: text("body").notNull(),
    visibility: mysqlEnum("visibility", visibilityEnum)
      .notNull()
      .default("internal_only"),
    sentByUserId: varchar("sent_by_user_id", { length: 36 }),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "dm_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.assignmentId],
      foreignColumns: [jobVendorAssignments.id],
      name: "dm_assignment_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.sentByUserId],
      foreignColumns: [users.id],
      name: "dm_sent_by_fk",
    }).onDelete("set null"),
    index("dm_assignment_created_idx").on(t.assignmentId, t.createdAt),
    index("dm_tenant_assignment_idx").on(t.tenantId, t.assignmentId),
  ],
);
