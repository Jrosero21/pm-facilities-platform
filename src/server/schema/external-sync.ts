import {
  timestamp,
  foreignKey,
  index,
  json,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { ioDirection, linkStatus, outcome, runStatus } from "./enums";
import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";
import { jobs } from "./jobs";
import { externalSystems } from "./external-systems";

// ── Phase 12 batch 12e (migration 0030) — EXTERNAL LINK + SYNC/LOG SUBSTRATE ─────────
// The keystone of the source-agnostic invariant + the sync/audit layer (12b F6/F7):
//
//  external_work_order_links — the JOIN that keeps us source-agnostic: an external WO
//    (external_system_id + external_wo_id) ↔ our jobs.id. UNIQUE(external_system_id,
//    external_wo_id) is the duplicate-detection the jobs.ts comment deferred to "Phase
//    12's linking table". job_id is ON DELETE SET NULL (audit-preservation, cf D-12c.1:
//    keep the link record if the job is purged); tenant/system FKs CASCADE.
//
//  external_sync_runs — orchestration with a mutable status tail (running→terminal),
//    mirroring communication_logs' append-on-create + mutable-tail shape.
//
//  external_sync_events / external_payload_logs — per-item events + raw payload audit.
//    Their external_wo_id / job_id links are POLYMORPHIC plain indexed columns with NO
//    hard FK (the communication_logs.source_id precedent) — an event/payload may
//    reference a WO/job that isn't (yet) linked. payload_logs.sync_run_id is SET NULL
//    (preserve the payload if its run is purged); sync_events.sync_run_id is CASCADE
//    (an event has no meaning without its run).
//
//  SECURITY (F1/F10.4): external_payload_logs.payload holds the RAW provider body and
//    must NEVER contain a credential value (harness-asserted). JSON-at-read gotcha applies.
//
// WP-12.2: EVERY FK is pre-named with a short prefix (ewol_/esr_/ese_/epl_) — the long
// table names would otherwise blow past MySQL's 64-char auto-name limit. FK-backing
// indexes are explicit (6d/6g).






export const externalWorkOrderLinks = pgTable(
  "external_work_order_links",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    externalSystemId: varchar("external_system_id", { length: 36 }).notNull(),
    // The provider's WO id (cf. jobs.source_external_id).
    externalWoId: varchar("external_wo_id", { length: 255 }).notNull(),
    // SET NULL: preserve the link record if the job is purged (audit, cf D-12c.1).
    jobId: varchar("job_id", { length: 36 }),
    linkStatus: linkStatus("link_status")
      .notNull()
      .default("active"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "ewol_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.externalSystemId],
      foreignColumns: [externalSystems.id],
      name: "ewol_system_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.jobId],
      foreignColumns: [jobs.id],
      name: "ewol_job_fk",
    }).onDelete("set null"),
    // THE DEFERRED DEDUP: one link per (system, external WO).
    uniqueIndex("external_work_order_links_system_wo_unique").on(
      t.externalSystemId,
      t.externalWoId,
    ),
    index("external_work_order_links_tenant_idx").on(t.tenantId),
    index("external_work_order_links_system_idx").on(t.externalSystemId),
    index("external_work_order_links_job_idx").on(t.jobId),
  ],
);

export const externalSyncRuns = pgTable(
  "external_sync_runs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    externalSystemId: varchar("external_system_id", { length: 36 }).notNull(),
    runType: varchar("run_type", { length: 64 }).notNull(),
    status: runStatus("status").notNull().default("running"),
    startedAt: timestamp("started_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    finishedAt: timestamp("finished_at"),
    counts: json("counts"),
    errorSummary: text("error_summary"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "esr_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.externalSystemId],
      foreignColumns: [externalSystems.id],
      name: "esr_system_fk",
    }).onDelete("cascade"),
    index("external_sync_runs_tenant_idx").on(t.tenantId),
    index("external_sync_runs_system_idx").on(t.externalSystemId),
    index("external_sync_runs_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export const externalSyncEvents = pgTable(
  "external_sync_events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    syncRunId: varchar("sync_run_id", { length: 36 }).notNull(),
    // Polymorphic links — plain indexed columns, NO hard FK (communication_logs.source_id
    // precedent): an event may reference a WO/job not (yet) linked.
    externalWoId: varchar("external_wo_id", { length: 255 }),
    jobId: varchar("job_id", { length: 36 }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    outcome: outcome("outcome").notNull(),
    message: text("message"),
    metadata: json("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "ese_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.syncRunId],
      foreignColumns: [externalSyncRuns.id],
      name: "ese_run_fk",
    }).onDelete("cascade"),
    index("external_sync_events_tenant_idx").on(t.tenantId),
    index("external_sync_events_run_idx").on(t.syncRunId),
    index("external_sync_events_wo_idx").on(t.externalWoId),
    index("external_sync_events_job_idx").on(t.jobId),
  ],
);

export const externalPayloadLogs = pgTable(
  "external_payload_logs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    externalSystemId: varchar("external_system_id", { length: 36 }).notNull(),
    // SET NULL: preserve the payload audit if its run is purged.
    syncRunId: varchar("sync_run_id", { length: 36 }),
    direction: ioDirection("direction").notNull(),
    // Polymorphic link — plain column, NO hard FK.
    externalWoId: varchar("external_wo_id", { length: 255 }),
    // Raw provider body. NEVER a credential (F1/F10.4). JSON-at-read gotcha applies.
    payload: json("payload"),
    receivedAt: timestamp("received_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "epl_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.externalSystemId],
      foreignColumns: [externalSystems.id],
      name: "epl_system_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.syncRunId],
      foreignColumns: [externalSyncRuns.id],
      name: "epl_run_fk",
    }).onDelete("set null"),
    index("external_payload_logs_tenant_idx").on(t.tenantId),
    index("external_payload_logs_system_idx").on(t.externalSystemId),
    index("external_payload_logs_run_idx").on(t.syncRunId),
    index("external_payload_logs_wo_idx").on(t.externalWoId),
  ],
);
