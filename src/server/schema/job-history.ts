import {
  index,
  json,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { trades } from "./trades";
import { priorities, jobStatuses } from "./job-reference";
import { jobs } from "./jobs";

// Append-only history + event tables for jobs. The three per-attribute history
// tables are the authoritative typed transition log (from → to) for that field;
// job_events is the unified timeline stream. A meaningful change dual-writes both
// (plus audit_logs) in one transaction (D-4.6, 06-business-rules.md).
//
// History convention: the first row of each table records from_*_id = null →
// to_*_id (the initial value), with changed_by_user_id set to the creating user —
// so "who set this job's current X?" is queryable uniformly for every row (D-4.8).
// All three share an identical shape (only the reference FK target differs).

export const jobStatusHistory = pgTable(
  "job_status_history",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: varchar("job_id", { length: 36 })
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    fromStatusId: varchar("from_status_id", { length: 36 }).references(
      () => jobStatuses.id,
      { onDelete: "restrict" },
    ),
    toStatusId: varchar("to_status_id", { length: 36 })
      .notNull()
      .references(() => jobStatuses.id, { onDelete: "restrict" }),
    changedByUserId: varchar("changed_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("job_status_history_tenant_job_idx").on(t.tenantId, t.jobId)],
);

export const jobPriorityHistory = pgTable(
  "job_priority_history",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: varchar("job_id", { length: 36 })
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    fromPriorityId: varchar("from_priority_id", { length: 36 }).references(
      () => priorities.id,
      { onDelete: "restrict" },
    ),
    toPriorityId: varchar("to_priority_id", { length: 36 })
      .notNull()
      .references(() => priorities.id, { onDelete: "restrict" }),
    changedByUserId: varchar("changed_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("job_priority_history_tenant_job_idx").on(t.tenantId, t.jobId)],
);

export const jobTradeHistory = pgTable(
  "job_trade_history",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: varchar("job_id", { length: 36 })
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    fromTradeId: varchar("from_trade_id", { length: 36 }).references(
      () => trades.id,
      { onDelete: "restrict" },
    ),
    toTradeId: varchar("to_trade_id", { length: 36 })
      .notNull()
      .references(() => trades.id, { onDelete: "restrict" }),
    changedByUserId: varchar("changed_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("job_trade_history_tenant_job_idx").on(t.tenantId, t.jobId)],
);

// Unified append-only timeline. event_type is a varchar with a documented
// vocabulary (06-business-rules.md / 07-chatbot-knowledge.md), not an enum — the
// vocabulary grows every phase without a migration (D-4.5/event-type). Phase 4
// vocab: job.created, job.status_changed, job.priority_changed, job.trade_changed,
// job.note_added, job.contact_added. actor_user_id is nullable (system/external
// events). metadata is event-specific JSON (treat defensively — Phase 2 L-2.13).
export const jobEvents = pgTable(
  "job_events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: varchar("job_id", { length: 36 })
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    actorUserId: varchar("actor_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    summary: varchar("summary", { length: 500 }).notNull(),
    metadata: json("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // Detail-page timeline renders a job's events in time order.
    index("job_events_job_created_idx").on(t.jobId, t.createdAt),
    index("job_events_tenant_job_idx").on(t.tenantId, t.jobId),
  ],
);
