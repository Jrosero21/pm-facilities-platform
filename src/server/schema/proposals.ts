import {
  datetime,
  decimal,
  foreignKey,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { jobs } from "./jobs";
import { arMarkupColumns, baseLineItemColumns } from "./billing-shared";

// ── Phase 8 batch 8b (migration 0018) — PROPOSALS (#8/#9/#10/#11) ─────────────────────
// Client-facing priced commercial documents, job-attached (job_id NN, OQ-12 — quote-first
// deferred). A proposal carries its OWN scope snapshot (scope_snapshot, free-text/JSON,
// OQ-10), INDEPENDENT of jobs.approved_scope_of_work — accepting a proposal NEVER writes
// the operational scope (#9, preserves R-7.2/D-7.3). Revisions are a superseded-by chain
// (#10): a revision is a NEW row with parent/supersedes self-FKs + revision_number; sent =
// immutable (only draft is editable in place). Single-live-revision per chain is a
// data-layer write-path invariant (createProposalRevision, 8c) — no DB unique.
// Totals (subtotal/markup_total/tax_total/total) are owned by recalculateProposalTotals
// (8c, R-7.2); the default 0s are insert safety nets. `viewed`/portal-accept are
// forward-declared (Phase 11). valid_until expiry is computed-on-read (no cron, OQ-8).

const proposalStatusEnum = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
  "superseded",
  "withdrawn",
] as const;

export const proposals = mysqlTable(
  "proposals",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    // Revision chain (#10): parent = chain root; supersedes = the prior revision.
    parentProposalId: varchar("parent_proposal_id", { length: 36 }),
    supersedesProposalId: varchar("supersedes_proposal_id", { length: 36 }),
    revisionNumber: int("revision_number").notNull().default(1),
    status: mysqlEnum("status", proposalStatusEnum).notNull().default("draft"),
    title: varchar("title", { length: 255 }),
    scopeSnapshot: text("scope_snapshot"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    markupTotal: decimal("markup_total", { precision: 12, scale: 2 }).notNull().default("0"),
    taxTotal: decimal("tax_total", { precision: 14, scale: 2 }).notNull().default("0"),
    total: decimal("total", { precision: 12, scale: 2 }).notNull().default("0"),
    validUntil: datetime("valid_until"),
    notes: text("notes"),
    sentAt: datetime("sent_at"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "prop_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.jobId], foreignColumns: [jobs.id], name: "prop_job_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.parentProposalId], foreignColumns: [t.id], name: "prop_parent_fk" }).onDelete("set null"),
    foreignKey({ columns: [t.supersedesProposalId], foreignColumns: [t.id], name: "prop_supersedes_fk" }).onDelete("set null"),
    foreignKey({ columns: [t.createdByUserId], foreignColumns: [users.id], name: "prop_created_by_fk" }).onDelete("set null"),
    index("prop_tenant_job_idx").on(t.tenantId, t.jobId),
    index("prop_tenant_status_idx").on(t.tenantId, t.status),
    index("prop_parent_idx").on(t.parentProposalId),
  ],
);

// Base + AR-markup (8b-D4). extended_amount/markup_amount writer-owned (recalculateProposalTotals).
export const proposalLineItems = mysqlTable(
  "proposal_line_items",
  {
    ...baseLineItemColumns(),
    ...arMarkupColumns(),
    proposalId: varchar("proposal_id", { length: 36 }).notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "pli_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.proposalId], foreignColumns: [proposals.id], name: "pli_proposal_fk" }).onDelete("cascade"),
    index("pli_tenant_proposal_idx").on(t.tenantId, t.proposalId),
  ],
);

// Revision-specific approval record (#10). approver_name = the client contact who accepted
// offline (OQ-8); approver_user_id = the operator who recorded it. signature_ref is a
// placeholder (no upload wiring). Append-only (no updated_at).
const approvalDecisionEnum = ["accepted", "declined"] as const;

export const proposalApprovals = mysqlTable(
  "proposal_approvals",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    proposalId: varchar("proposal_id", { length: 36 }).notNull(),
    decision: mysqlEnum("decision", approvalDecisionEnum).notNull(),
    approverUserId: varchar("approver_user_id", { length: 36 }),
    approverName: varchar("approver_name", { length: 255 }),
    decidedAt: datetime("decided_at").notNull(),
    notes: text("notes"),
    signatureRef: varchar("signature_ref", { length: 1024 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "papp_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.proposalId], foreignColumns: [proposals.id], name: "papp_proposal_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.approverUserId], foreignColumns: [users.id], name: "papp_user_fk" }).onDelete("set null"),
    index("papp_tenant_proposal_idx").on(t.tenantId, t.proposalId),
  ],
);
