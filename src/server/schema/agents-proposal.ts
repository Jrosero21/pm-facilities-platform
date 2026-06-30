import {
  timestamp,
  foreignKey,
  index,
  json,
  pgTable,
  text,
  varchar,
} from "drizzle-orm/pg-core";
import { agentDraftStatus, agentReviewDecision } from "./enums";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";
import { users } from "./auth";
import { jobs } from "./jobs";
import { agentRuns } from "./agents-substrate";
import { proposals } from "./proposals";

// ── Phase 27 batch 1 — PROPOSAL-CREATOR I/O ───────────────────────────────────────────
// The proposal_creator_v1 draft→review substrate. SPECIALIZED, not shared — the generic
// cross-agent layer is the agent substrate (agent_runs/_tool_calls/_decisions, reused via
// the agent_run_id FK below). This file is the proposal equivalent of agents-invoice.ts;
// its enum / FK / index shapes deliberately MIRROR invoice_drafts / invoice_reviews 1:1.
//
// The agent reads job context and drafts an INTERNAL (operator-only) priced proposal. AI
// writes the line-item PHRASING (description + scope phrasing) ONLY; every dollar figure is
// joined in downstream / authored by the operator at the review gate — NEVER the LLM.
//
// Draft = JSON working memory; published = the canonical relational record (proposals row at
// kind='internal'). The agent writes ONLY proposal_drafts at pending_review; the sole writer
// of proposals / proposal_line_items on this path is the human-gated publish action.

// proposal_drafts.status MIRRORS invoice_drafts.status 1:1.



// proposal_drafts — one row per generation attempt. proposed_proposal is the AI's structured
// draft (JSON, IMMUTABLE — the "what the AI produced" audit; parse at read). Shape:
// { lineItems: [{ category, description, scopePhrasing }], notes? } — NUMBER-FREE BY
// CONSTRUCTION: no quantity / unit_price / markup / total field exists in the type, so the
// model is structurally unable to emit a dollar figure (the invoice-creator D1 discipline).
// published_at is implicit via status='published'; published_proposal_id is the provenance
// link to the canonical proposals row on publish (the idempotency-guard target).
// Index set mirrors invd_* minus the vendor-invoice lookup (no AP source here):
// tenant_job / tenant_status / run.
export const proposalDrafts = pgTable(
  "proposal_drafts",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    agentRunId: varchar("agent_run_id", { length: 36 }).notNull(),
    proposedProposal: json("proposed_proposal").notNull(),
    status: agentDraftStatus("status").notNull().default("pending_review"),
    publishedProposalId: varchar("published_proposal_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "prpd_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.jobId], foreignColumns: [jobs.id], name: "prpd_job_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.agentRunId], foreignColumns: [agentRuns.id], name: "prpd_run_fk" }).onDelete("cascade"),
    // published_proposal_id is SET NULL (matches invoice_drafts.published_client_invoice_id):
    // the provenance link clears if the published proposal is ever deleted, the draft survives.
    foreignKey({ columns: [t.publishedProposalId], foreignColumns: [proposals.id], name: "prpd_pub_proposal_fk" }).onDelete("set null"),
    index("prpd_tenant_job_idx").on(t.tenantId, t.jobId),
    index("prpd_tenant_status_idx").on(t.tenantId, t.status),
    index("prpd_run_idx").on(t.agentRunId),
  ],
);

// proposal_reviews — the operator's review of a draft (mirrors invoice_reviews).
// edited_content (JSON, NULL when unchanged — carries "the operator changed something",
// INCLUDING the operator-authored NUMBERS, since the draft is number-free). proposed_proposal
// on the draft stays immutable. Effective published proposal = edited_content ?? proposed_proposal.
// NULL edited_content = approved-as-is. Append-only (created_at is the canonical latest-review
// ordering, + reviewed_at).
export const proposalReviews = pgTable(
  "proposal_reviews",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    proposalDraftId: varchar("proposal_draft_id", { length: 36 }).notNull(),
    reviewerUserId: varchar("reviewer_user_id", { length: 36 }),
    decision: agentReviewDecision("decision").notNull(),
    editedContent: json("edited_content"),
    reviewNotes: text("review_notes"),
    reviewedAt: timestamp("reviewed_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "prpr_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.proposalDraftId], foreignColumns: [proposalDrafts.id], name: "prpr_draft_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.reviewerUserId], foreignColumns: [users.id], name: "prpr_reviewer_fk" }).onDelete("set null"),
    index("prpr_draft_idx").on(t.proposalDraftId),
  ],
);
