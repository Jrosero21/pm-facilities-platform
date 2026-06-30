import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { commVisibility, dispatchCommsDirection, entityStatus } from "./enums";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { jobVendorAssignments } from "./dispatch-assignments";



// Visibility axis required by D-4.10 — "anything shareable externally carries a
// visibility column from day one", which names dispatch_messages explicitly as a
// forward pointer. Phase 5 only ever sets internal_only; Phase 6 expands the picker
// and the visibility-control workflows. Mirrors job_notes.visibility exactly.


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
export const dispatchMessages = pgTable(
  "dispatch_messages",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    assignmentId: varchar("assignment_id", { length: 36 }).notNull(),
    direction: dispatchCommsDirection("direction")
      .notNull()
      .default("outbound"),
    messageType: varchar("message_type", { length: 64 }).notNull(),
    subject: varchar("subject", { length: 255 }),
    body: text("body").notNull(),
    visibility: commVisibility("visibility")
      .notNull()
      .default("internal_only"),
    sentByUserId: varchar("sent_by_user_id", { length: 36 }),
    status: entityStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
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
