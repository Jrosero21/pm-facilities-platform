import {
  foreignKey,
  index,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";
import { trades } from "./trades";
import { jobStatuses, priorities } from "./job-reference";
import { externalSystems } from "./external-systems";

// ── Phase 12 batch 12d (migration 0029) — EXTERNAL CODE-MAPPING SUBSTRATE ─────────────
// Translate a provider's vocabulary into our reference data. Each row maps an external
// code (per external_system) to one of our ids, in a given direction (12b F4: every
// mapping carries direction enum, inbound populated for MVP).
//
// TARGET-SCOPING (12b F5): status + trade mappings target GLOBAL reference tables
// (job_statuses / trades) → NO tenant dimension (the 2-D external_system × ref matrix).
// priority mapping targets the TENANT-SCOPED priorities table → it carries tenant_id
// directly AND in its unique key (a priority code is only unique within a tenant).
//
// DELETE RULE: every FK is ON DELETE CASCADE — a mapping row has no independent value
// once its system or target ref is gone (no audit-preservation case, unlike
// external_systems.created_by_user_id at D-12c.1). FK-backing indexes are explicit
// (the 6d/6g lesson).

const directionEnum = ["inbound", "outbound", "both"] as const;

export const externalStatusMappings = mysqlTable(
  "external_status_mappings",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    // Explicit short FK name: the auto-generated
    // external_status_mappings_external_system_id_external_systems_id_fk is 66 chars (>64).
    externalSystemId: varchar("external_system_id", { length: 36 }).notNull(),
    externalCode: varchar("external_code", { length: 128 }).notNull(),
    jobStatusId: varchar("job_status_id", { length: 36 })
      .notNull()
      .references(() => jobStatuses.id, { onDelete: "cascade" }),
    direction: mysqlEnum("direction", directionEnum).notNull().default("inbound"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.externalSystemId],
      foreignColumns: [externalSystems.id],
      name: "esm_system_fk",
    }).onDelete("cascade"),
    uniqueIndex("external_status_mappings_system_code_dir_unique").on(
      t.externalSystemId,
      t.externalCode,
      t.direction,
    ),
    index("external_status_mappings_system_idx").on(t.externalSystemId),
    index("external_status_mappings_status_idx").on(t.jobStatusId),
  ],
);

export const externalTradeMappings = mysqlTable(
  "external_trade_mappings",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    // Explicit short FK name (auto name = 65 chars >64).
    externalSystemId: varchar("external_system_id", { length: 36 }).notNull(),
    externalCode: varchar("external_code", { length: 128 }).notNull(),
    tradeId: varchar("trade_id", { length: 36 })
      .notNull()
      .references(() => trades.id, { onDelete: "cascade" }),
    direction: mysqlEnum("direction", directionEnum).notNull().default("inbound"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.externalSystemId],
      foreignColumns: [externalSystems.id],
      name: "etm_system_fk",
    }).onDelete("cascade"),
    uniqueIndex("external_trade_mappings_system_code_dir_unique").on(
      t.externalSystemId,
      t.externalCode,
      t.direction,
    ),
    index("external_trade_mappings_system_idx").on(t.externalSystemId),
    index("external_trade_mappings_trade_idx").on(t.tradeId),
  ],
);

export const externalPriorityMappings = mysqlTable(
  "external_priority_mappings",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    // F5: priorities are tenant-scoped, so the mapping carries tenant_id directly
    // (a priority code is only unique within a tenant).
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Explicit short FK name (auto name = 68 chars >64).
    externalSystemId: varchar("external_system_id", { length: 36 }).notNull(),
    externalCode: varchar("external_code", { length: 128 }).notNull(),
    priorityId: varchar("priority_id", { length: 36 })
      .notNull()
      .references(() => priorities.id, { onDelete: "cascade" }),
    direction: mysqlEnum("direction", directionEnum).notNull().default("inbound"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.externalSystemId],
      foreignColumns: [externalSystems.id],
      name: "epm_system_fk",
    }).onDelete("cascade"),
    // F5: tenant_id in the unique key.
    uniqueIndex("external_priority_mappings_tenant_system_code_dir_unique").on(
      t.tenantId,
      t.externalSystemId,
      t.externalCode,
      t.direction,
    ),
    index("external_priority_mappings_tenant_idx").on(t.tenantId),
    index("external_priority_mappings_system_idx").on(t.externalSystemId),
    index("external_priority_mappings_priority_idx").on(t.priorityId),
  ],
);
