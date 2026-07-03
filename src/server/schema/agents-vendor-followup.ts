import {
  foreignKey,
  timestamp,
  index,
  pgTable,
  text,
  varchar,
} from "drizzle-orm/pg-core";
import { agentDraftStatus } from "./enums";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";
import { jobVendorAssignments } from "./dispatch-assignments";
import { agentRuns } from "./agents-substrate";
import { dispatchMessages } from "./dispatch-comms";

// ── vendor_followup_v1 draft lane — the SOFT rung-0 chase (before redispatch) ──────────
// A SEPARATE review lane from the client-facing rewriter (update_rewrite_drafts): a chase is
// VENDOR-facing, so it must not share the client lane (vendor≠client invariant). Mirrors
// update_rewrite_drafts' column/nullability/index shape but keyed on the ASSIGNMENT (a chase
// is about one dispatch, not a job note). The agent writes ONLY here @ pending_review; it NEVER
// sends (no dispatch_messages write) — the operator approves and send is a separate host-gated
// step (sent_dispatch_message_id links the resulting outbound row, like published_communication_id).
export const vendorFollowupDrafts = pgTable(
  "vendor_followup_drafts",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    assignmentId: varchar("assignment_id", { length: 36 }).notNull(),
    agentRunId: varchar("agent_run_id", { length: 36 }).notNull(),
    draftContent: text("draft_content").notNull(),
    status: agentDraftStatus("status").notNull().default("pending_review"),
    // Set only when the operator approves + sends the chase (the resulting outbound dispatch_messages row).
    sentDispatchMessageId: varchar("sent_dispatch_message_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "vfd_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.assignmentId], foreignColumns: [jobVendorAssignments.id], name: "vfd_assignment_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.agentRunId], foreignColumns: [agentRuns.id], name: "vfd_run_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.sentDispatchMessageId], foreignColumns: [dispatchMessages.id], name: "vfd_sent_msg_fk" }).onDelete("set null"),
    index("vfd_tenant_assignment_idx").on(t.tenantId, t.assignmentId),
    index("vfd_tenant_status_idx").on(t.tenantId, t.status),
    index("vfd_run_idx").on(t.agentRunId),
  ],
);
