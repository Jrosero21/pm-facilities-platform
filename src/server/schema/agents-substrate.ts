import {
  timestamp,
  foreignKey,
  index,
  integer,
  json,
  pgTable,
  text,
  varchar,
} from "drizzle-orm/pg-core";
import { mysqlEnum } from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";
import { users } from "./auth";
import { jobs } from "./jobs";

// ── Phase 6 batch 6g.a — GENERIC AGENT SUBSTRATE ─────────────────────────────────────
// The three tables every AI agent writes to (§2.9). Introduced Phase 6 for the update
// rewriter; generic — inherited by Phase 7 (scope generator), 8 (NTE negotiator), 13
// (email parser), 16 (chatbot). Each future agent adds its OWN file (agents-<name>.ts);
// this substrate file stays clean.
//
// These are IMMUTABLE AUDIT records (same family as job_events / audit_logs) — they
// OMIT the soft-delete `status` enum. `agent_runs.status` is the run lifecycle
// (running/succeeded/failed), NOT a soft-delete toggle (R-6.x).

// agent_runs — one row per agent invocation (§2.9). `input_summary`/`output_summary` are
// denormalized human-readable excerpts for at-a-glance log display, NOT the source of
// truth (complete I/O is reconstructable from agent_tool_calls + agent_decisions; R-6.x).
// `prompt_version` is implicitly scoped to `agent_id` — the lookup key is the
// (agent_id, prompt_version) pair (R-6.x; Phase 7+ may add prompt_id with
// ai_prompt_templates). `job_id` is NULLABLE — non-job agents (chatbot) come later.
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    agentId: varchar("agent_id", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["running", "succeeded", "failed"]).notNull().default("running"),
    triggerSource: varchar("trigger_source", { length: 32 }).notNull().default("operator_manual"),
    triggeredByUserId: varchar("triggered_by_user_id", { length: 36 }),
    jobId: varchar("job_id", { length: 36 }),
    inputSummary: varchar("input_summary", { length: 500 }),
    outputSummary: varchar("output_summary", { length: 500 }),
    model: varchar("model", { length: 64 }),
    promptVersion: varchar("prompt_version", { length: 64 }),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at").notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "ar_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.triggeredByUserId], foreignColumns: [users.id], name: "ar_triggered_by_fk" }).onDelete("set null"),
    foreignKey({ columns: [t.jobId], foreignColumns: [jobs.id], name: "ar_job_fk" }).onDelete("cascade"),
    index("ar_tenant_agent_created_idx").on(t.tenantId, t.agentId, t.createdAt),
    index("ar_tenant_status_idx").on(t.tenantId, t.status),
    index("ar_job_idx").on(t.jobId),
  ],
);

// agent_tool_calls — every read/write tool the agent used, in `sequence` order (§2.9).
// Denormalized tenant_id (project convention; reachable via agent_run_id but kept direct
// for tenant-filtered analytics). Immutable — created_at only, no updated_at.
export const agentToolCalls = pgTable(
  "agent_tool_calls",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    agentRunId: varchar("agent_run_id", { length: 36 }).notNull(),
    sequence: integer("sequence").notNull(),
    toolName: varchar("tool_name", { length: 128 }).notNull(),
    toolKind: mysqlEnum("tool_kind", ["read", "write"]).notNull(),
    toolInput: json("tool_input"),
    toolOutput: json("tool_output"),
    status: mysqlEnum("status", ["ok", "error"]).notNull().default("ok"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "atc_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.agentRunId], foreignColumns: [agentRuns.id], name: "atc_run_fk" }).onDelete("cascade"),
    index("atc_run_seq_idx").on(t.agentRunId, t.sequence),
  ],
);

// agent_decisions — proposed action + reasoning + confidence + disposition (§2.9). The
// policy-check seam: `disposition='policy_blocked'` is structurally available for Phase 7+
// per-client policies that REFUSE a proposal without queuing it; Phase 6's hardcoded
// "always require review" only ever emits 'queued_for_review' (R-6.x). 'policy_blocked'
// (not 'rejected') disambiguates the POLICY refusing a proposal from the OPERATOR
// rejecting a queued draft (update_rewrite_drafts.status='rejected'). Immutable.
export const agentDecisions = pgTable(
  "agent_decisions",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    agentRunId: varchar("agent_run_id", { length: 36 }).notNull(),
    decisionType: varchar("decision_type", { length: 64 }).notNull(),
    proposedAction: varchar("proposed_action", { length: 500 }),
    reasoning: text("reasoning"),
    confidence: mysqlEnum("confidence", ["high", "medium", "low"]),
    policyCheck: varchar("policy_check", { length: 128 }),
    disposition: mysqlEnum("disposition", [
      "queued_for_review",
      "auto_executed",
      "policy_blocked",
    ]).notNull(),
    metadata: json("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "ad_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.agentRunId], foreignColumns: [agentRuns.id], name: "ad_run_fk" }).onDelete("cascade"),
    index("ad_run_idx").on(t.agentRunId),
  ],
);
