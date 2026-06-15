import {
  boolean,
  datetime,
  decimal,
  index,
  int,
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
import { clients, clientLocations } from "./clients";
import { trades } from "./trades";
import { priorities, jobStatuses } from "./job-reference";

// The central job / work order object — the operational anchor every later phase
// (dispatch, communication, scope, billing, analytics) hangs off.
//
// Source-agnostic from day one (§2.1): source_type is an 8-value enum, default
// manual; source_external_id holds the originating system's WO id. ServiceChannel
// is NOT a source_type — it maps to external_client_portal, with the specific
// system recorded later via Phase 12's external_systems / external_work_order_links
// (D-4.9). No uniqueness on source_external_id in Phase 4 — duplicate detection is
// Phase 12's linking-table concern.
//
// is_archived is the record-lifecycle soft-delete flag, DISTINCT from the workflow
// current_status_id (R-3.11 two-axis principle, D-4.3). Business timestamps
// (scheduled/due/completed/closed) are `datetime` to dodge the 2038 ceiling and
// TZ-conversion semantics; created_at/updated_at stay DB-managed `timestamp` (D-4.4).
// scope_generation_status is varchar (Phase 4 vocab = 'not_started' only; Phase 7
// owns the rest — D-4.6). primary_trade_id / priority_id are nullable for non-manual
// intake; the manual form requires them (D-4.7).
export const jobs = mysqlTable(
  "jobs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Human-facing per-tenant sequence; allocated in the createJob transaction
    // via tenant_job_sequences (D-4.5). Unique per tenant.
    jobNumber: int("job_number", { unsigned: true }).notNull(),
    clientId: varchar("client_id", { length: 36 })
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    clientLocationId: varchar("client_location_id", { length: 36 })
      .notNull()
      .references(() => clientLocations.id, { onDelete: "restrict" }),
    primaryTradeId: varchar("primary_trade_id", { length: 36 }).references(
      () => trades.id,
      { onDelete: "restrict" },
    ),
    priorityId: varchar("priority_id", { length: 36 }).references(
      () => priorities.id,
      { onDelete: "restrict" },
    ),
    currentStatusId: varchar("current_status_id", { length: 36 })
      .notNull()
      .references(() => jobStatuses.id, { onDelete: "restrict" }),
    sourceType: mysqlEnum("source_type", [
      "manual",
      "internal_client_portal",
      "external_client_portal",
      "email_ingestion",
      "forwarded_email",
      "api",
      "preventative_maintenance",
      "snow_event",
    ])
      .notNull()
      .default("manual"),
    sourceExternalId: varchar("source_external_id", { length: 255 }),
    problemDescription: text("problem_description").notNull(),
    scopeOfWork: text("scope_of_work"),
    generatedScopeOfWork: text("generated_scope_of_work"),
    approvedScopeOfWork: text("approved_scope_of_work"),
    scopeGenerationStatus: varchar("scope_generation_status", { length: 32 })
      .notNull()
      .default("not_started"),
    notToExceedAmount: decimal("not_to_exceed_amount", {
      precision: 12,
      scale: 2,
    }),
    // Phase (ii) billing-from-rates (0050) — per-job OVERRIDE of the client's billing
    // model. NULLABLE, no default: null means "inherit clients.billing_model" (the v1
    // resolution rule is job.billing_model ?? client.billing_model). Same enum as
    // clients.billing_model. The operator's "one method per job" — a job pins its method
    // only when it must deviate from the client default.
    billingModel: mysqlEnum("billing_model", ["rate_sheet", "cost_plus", "flat"]),
    scheduledStartAt: datetime("scheduled_start_at"),
    scheduledEndAt: datetime("scheduled_end_at"),
    dueAt: datetime("due_at"),
    // Phase 19 follow-up — the operator's "next action" reminder on a job. NULLABLE: a job has
    // no follow-up until one is set. follow_up_category is required-by-form only when a date is
    // set (the form enforces the pairing; the column stays nullable so neither blocks a
    // migration). The exception reader surfaces a follow_up_overdue kind once follow_up_at has
    // passed. Distinct from due_at (the SLA seam) — this is a categorized operator reminder.
    followUpAt: datetime("follow_up_at"),
    followUpCategory: mysqlEnum("follow_up_category", [
      "vendor_followup",
      "confirm_onsite",
      "proposal_followup",
      "general",
    ]),
    completedAt: datetime("completed_at"),
    closedAt: datetime("closed_at"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("jobs_tenant_number_unique").on(t.tenantId, t.jobNumber),
    index("jobs_tenant_status_idx").on(t.tenantId, t.currentStatusId),
    index("jobs_tenant_client_idx").on(t.tenantId, t.clientId),
    index("jobs_tenant_location_idx").on(t.tenantId, t.clientLocationId),
    index("jobs_tenant_trade_idx").on(t.tenantId, t.primaryTradeId),
    index("jobs_tenant_priority_idx").on(t.tenantId, t.priorityId),
    index("jobs_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("jobs_tenant_due_idx").on(t.tenantId, t.dueAt),
    index("jobs_tenant_followup_idx").on(t.tenantId, t.followUpAt),
    index("jobs_tenant_source_idx").on(t.tenantId, t.sourceType),
  ],
);

// Per-tenant monotonic counter for job_number. One row per tenant; the row is
// locked SELECT ... FOR UPDATE inside the createJob transaction so allocation is
// gapless and concurrency-safe (D-4.5, 06-business-rules.md). Seeded with one row
// for the Demo Aggregator; the per-tenant "create on tenant creation" hook is a
// Phase 1 carry-forward.
export const tenantJobSequences = mysqlTable("tenant_job_sequences", {
  tenantId: varchar("tenant_id", { length: 36 })
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  nextNumber: int("next_number", { unsigned: true }).notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});
