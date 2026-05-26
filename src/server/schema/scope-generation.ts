import {
  boolean,
  datetime,
  foreignKey,
  index,
  int,
  json,
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

// ── Phase 7 batch 7b — SCOPE GENERATION I/O ───────────────────────────────────────────
// The scope_generator_v1 draft→review→publish substrate. SPECIALIZED, not shared (Surface
// #1, settling D-6.16): the generic cross-agent layer is the agent substrate
// (agent_runs/_tool_calls/_decisions, reused via the agent_run_id FK below — NOT
// duplicated). This file is the scope equivalent of agents-rewriter.ts; its index/FK
// shapes deliberately MIRROR update_rewrite_drafts / update_rewrite_reviews.
//
// Draft = JSON working memory; published = relational canonical record (OQ #5). The agent
// writes ONLY job_scope_drafts at pending_review (§2.9 / R-6.15); the only writer of
// job_scope_steps is the human-gated publishScopeDraft action (next batch). Schema only
// this batch — no data layer, no agent, no UI. No jobs column changes (generated_/
// approved_scope_of_work + scope_generation_status already exist from Phase 4).

// job_scope_drafts.status MIRRORS update_rewrite_drafts.status 1:1 (OQ #4).
const draftStatusEnum = ["pending_review", "approved", "rejected", "discarded", "published"] as const;
const reviewDecisionEnum = ["approve", "reject"] as const;
// Per-step provenance (NOT NULL, no default — publishScopeDraft sets it per step).
const stepSourceEnum = ["ai_generated", "template", "manual", "edited"] as const;
// Operational soft-delete on the published step rows.
const stepStatusEnum = ["active", "inactive", "archived"] as const;

// job_scope_drafts — one row per generation attempt. proposed_steps is the AI's ordered
// steps (JSON, IMMUTABLE — the "what the AI produced" audit; parse at read per R-6.19).
// published_at is set on publish (NOT a single child FK — publish fans out to N
// job_scope_steps). Index set mirrors urd_* (tenant_job / tenant_status / run); the
// rewriter's urd_source_idx does NOT translate — a scope draft has no polymorphic source
// (its source is the job itself, via job_id + the agent_run provenance).
export const jobScopeDrafts = mysqlTable(
  "job_scope_drafts",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    agentRunId: varchar("agent_run_id", { length: 36 }).notNull(),
    proposedSteps: json("proposed_steps").notNull(),
    status: mysqlEnum("status", draftStatusEnum).notNull().default("pending_review"),
    publishedAt: datetime("published_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "jsd_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.jobId], foreignColumns: [jobs.id], name: "jsd_job_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.agentRunId], foreignColumns: [agentRuns.id], name: "jsd_run_fk" }).onDelete("cascade"),
    index("jsd_tenant_job_idx").on(t.tenantId, t.jobId),
    index("jsd_tenant_status_idx").on(t.tenantId, t.status),
    index("jsd_run_idx").on(t.agentRunId),
  ],
);

// job_scope_reviews — the operator's review of a draft (mirrors update_rewrite_reviews).
// edited_steps (JSON, NULL when unchanged — carries "the operator changed something");
// proposed_steps on the draft stays immutable. Effective published steps = edited_steps
// ?? proposed_steps. Append-only (created_at + reviewed_at; no updated_at).
export const jobScopeReviews = mysqlTable(
  "job_scope_reviews",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    draftId: varchar("draft_id", { length: 36 }).notNull(),
    reviewerUserId: varchar("reviewer_user_id", { length: 36 }),
    decision: mysqlEnum("decision", reviewDecisionEnum).notNull(),
    editedSteps: json("edited_steps"),
    reviewNotes: text("review_notes"),
    reviewedAt: datetime("reviewed_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "jsr_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.draftId], foreignColumns: [jobScopeDrafts.id], name: "jsr_draft_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.reviewerUserId], foreignColumns: [users.id], name: "jsr_reviewer_fk" }).onDelete("set null"),
    index("jsr_draft_idx").on(t.draftId),
  ],
);

// job_scope_steps — the CANONICAL published scope (relational child of jobs). Written ONLY
// by publishScopeDraft (the agent has no path here — §2.9). `source` is per-step
// provenance; `source_draft_id` is the provenance link back to the generation, SET NULL on
// draft delete (a published step outlives its draft). Operational → carries the soft-delete
// status enum. Ordering index (tenant_id, job_id, step_order) is NON-unique: soft-deleted
// rows may retain stale orders and reorder passes through transient collisions; active-step
// order uniqueness is an app invariant.
export const jobScopeSteps = mysqlTable(
  "job_scope_steps",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    stepOrder: int("step_order").notNull(),
    instruction: text("instruction").notNull(),
    category: varchar("category", { length: 32 }),
    expectsPhoto: boolean("expects_photo").notNull().default(false),
    source: mysqlEnum("source", stepSourceEnum).notNull(),
    sourceDraftId: varchar("source_draft_id", { length: 36 }),
    status: mysqlEnum("status", stepStatusEnum).notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "jss_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.jobId], foreignColumns: [jobs.id], name: "jss_job_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.sourceDraftId], foreignColumns: [jobScopeDrafts.id], name: "jss_source_draft_fk" }).onDelete("set null"),
    index("jss_tenant_job_order_idx").on(t.tenantId, t.jobId, t.stepOrder),
  ],
);
