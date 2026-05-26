import {
  foreignKey,
  datetime,
  index,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";
import { users } from "./auth";
import { jobs } from "./jobs";
import { agentRuns } from "./agents-substrate";
import { communicationLogs } from "./communications";

// ── Phase 6 batch 6g.a — REWRITER-SPECIALIZED I/O ────────────────────────────────────
// The update rewriter's specific tables (one agent's specifics; the substrate stays
// generic). Specialized, not a shared agent_drafts table — agent_drafts unification is
// OPEN, deferred to Phase 7 (decided with the scope generator as a 2nd data point).

// update_rewrite_drafts — the rewriter's output. POLYMORPHIC input source (R-6.x): Phase
// 6 registers only `job_note`; Phase 10+ adds `vendor_update` via the same
// source_type+source_id contract (no FK — spans tables) with no rewriter redesign. The
// agent writes drafts ONLY at status='pending_review' and has NO path to operational
// state — `publishRewriteDraft` (the human-gated publish action) is the only draft→comm
// path. status machine: pending_review → approved → published (terminal); pending_review
// → rejected (formal review row exists, terminal); pending_review → discarded (silent
// dismissal, no review row, terminal). draft_content is IMMUTABLE — operator edits live
// on the review row (audit: what the rewriter produced vs what the operator approved).
export const updateRewriteDrafts = mysqlTable(
  "update_rewrite_drafts",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    agentRunId: varchar("agent_run_id", { length: 36 }).notNull(),
    sourceType: mysqlEnum("source_type", ["job_note", "vendor_update"]).notNull().default("job_note"),
    sourceId: varchar("source_id", { length: 36 }).notNull(),
    draftContent: text("draft_content").notNull(),
    status: mysqlEnum("status", [
      "pending_review",
      "approved",
      "rejected",
      "discarded",
      "published",
    ])
      .notNull()
      .default("pending_review"),
    publishedCommunicationId: varchar("published_communication_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "urd_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.jobId], foreignColumns: [jobs.id], name: "urd_job_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.agentRunId], foreignColumns: [agentRuns.id], name: "urd_run_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.publishedCommunicationId], foreignColumns: [communicationLogs.id], name: "urd_pub_comm_fk" }).onDelete("set null"),
    index("urd_tenant_job_idx").on(t.tenantId, t.jobId),
    index("urd_tenant_status_idx").on(t.tenantId, t.status),
    index("urd_run_idx").on(t.agentRunId),
    index("urd_source_idx").on(t.sourceType, t.sourceId),
  ],
);

// update_rewrite_reviews — the human review of a draft (acceptance #9: EDIT and approve).
// `edited_content` (nullable) is the operator's edit; the draft's draft_content stays
// immutable, so the audit trail preserves "what the rewriter produced" vs "what the
// operator approved". On publish, effective content = edited_content ?? draft_content.
// 'reject' has a formal review row (operator reason); 'discard' has none (silent).
export const updateRewriteReviews = mysqlTable(
  "update_rewrite_reviews",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    draftId: varchar("draft_id", { length: 36 }).notNull(),
    reviewerUserId: varchar("reviewer_user_id", { length: 36 }),
    decision: mysqlEnum("decision", ["approve", "reject"]).notNull(),
    editedContent: text("edited_content"),
    reviewNotes: text("review_notes"),
    reviewedAt: datetime("reviewed_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "urr_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.draftId], foreignColumns: [updateRewriteDrafts.id], name: "urr_draft_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.reviewerUserId], foreignColumns: [users.id], name: "urr_reviewer_fk" }).onDelete("set null"),
    index("urr_draft_idx").on(t.draftId),
  ],
);
