import {
  foreignKey,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { mysqlEnum } from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";
import { trades } from "./trades";
import { jobStatuses, priorities } from "./job-reference";
import { clients, clientLocations } from "./clients";
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

export const externalStatusMappings = pgTable(
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
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
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

export const externalTradeMappings = pgTable(
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
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
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

export const externalPriorityMappings = pgTable(
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
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
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

// ── Phase 12 batch 12h.0 (migration 0031) — EXTERNAL LOCATION MAPPING (IF-2) ──────────
// Targets the TENANT-SCOPED client_locations (locations belong to clients belong to
// tenants) — so this carries tenant_id directly, like external_priority_mappings (F5).
// Resolves a provider's store/location ref → an internal client_location_id (the ingest
// gap IF-2: createJob needs an internal location id, the NormalizedWorkOrder has only a
// string ref). external_code is varchar(255) (provider location ids can be longer/
// alphanumeric than the 128-char code mappings). direction defaults 'both' — a location
// ref is used inbound (resolve on ingest) AND outbound (reference on push). All FKs
// CASCADE; pre-named (elm_ prefix, WP-12.2); explicit FK-backing indexes (6d/6g).
export const externalLocationMappings = pgTable(
  "external_location_mappings",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    externalSystemId: varchar("external_system_id", { length: 36 }).notNull(),
    externalCode: varchar("external_code", { length: 255 }).notNull(),
    // 12h.0b / D-12h.2: StoreId is per-CLIENT (multi-client platforms), so the
    // mapping carries client_id and the unique key includes it. NOT NULL — safe
    // because the table is empty in prod (added the same phase the table was created).
    clientId: varchar("client_id", { length: 36 }).notNull(),
    clientLocationId: varchar("client_location_id", { length: 36 }).notNull(),
    direction: mysqlEnum("direction", directionEnum).notNull().default("both"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "elm_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.externalSystemId],
      foreignColumns: [externalSystems.id],
      name: "elm_system_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.clientId],
      foreignColumns: [clients.id],
      name: "elm_client_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.clientLocationId],
      foreignColumns: [clientLocations.id],
      name: "elm_location_fk",
    }).onDelete("cascade"),
    // D-12h.2: one external store per CLIENT = one mapping (StoreId is per-client).
    uniqueIndex("external_location_mappings_system_client_code_unique").on(
      t.externalSystemId,
      t.clientId,
      t.externalCode,
    ),
    index("external_location_mappings_tenant_idx").on(t.tenantId),
    index("external_location_mappings_system_idx").on(t.externalSystemId),
    index("external_location_mappings_client_idx").on(t.clientId),
    index("external_location_mappings_location_idx").on(t.clientLocationId),
  ],
);

// ── Phase 12 batch 12h.0b (migration 0032) — EXTERNAL CLIENT MAPPING (D-12h.1) ─────────
// Multi-client platforms (ServiceChannel/Corrigo) carry many clients on one connection.
// Maps a platform client id (SC SubscriberId) → our internal client_id, per external_system,
// tenant-scoped. This is the FIRST resolution step at ingest (12h-A.2 order): an unmapped
// client parks the WO (IF-7). All FKs CASCADE; pre-named (ecm_ prefix, WP-12.2); explicit
// FK-backing indexes (6d/6g).
export const externalClientMappings = pgTable(
  "external_client_mappings",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    externalSystemId: varchar("external_system_id", { length: 36 }).notNull(),
    externalCode: varchar("external_code", { length: 255 }).notNull(),
    clientId: varchar("client_id", { length: 36 }).notNull(),
    direction: mysqlEnum("direction", directionEnum).notNull().default("both"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "ecm_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.externalSystemId],
      foreignColumns: [externalSystems.id],
      name: "ecm_system_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.clientId],
      foreignColumns: [clients.id],
      name: "ecm_client_fk",
    }).onDelete("cascade"),
    // One platform-client = one mapping (per system).
    uniqueIndex("external_client_mappings_system_code_unique").on(
      t.externalSystemId,
      t.externalCode,
    ),
    index("external_client_mappings_tenant_idx").on(t.tenantId),
    index("external_client_mappings_system_idx").on(t.externalSystemId),
    index("external_client_mappings_client_idx").on(t.clientId),
  ],
);
