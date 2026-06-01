import {
  boolean,
  datetime,
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
import { tenants } from "./tenants";
import { users } from "./auth";
import { clients, clientLocations } from "./clients";
import { trades } from "./trades";
import { priorities } from "./job-reference";

// ── Phase 14 batch 14c (migration 0036) — PREVENTATIVE-MAINTENANCE CORE ────────────────
// PM is a fan-out engine: one program → a recurring schedule → an explicit subset of a
// client's locations → BATCHES of visits → jobs. This batch lands the CORE substrate:
// pm_programs (the program + its program-level template scope/trade/priority, 14b), pm_schedules
// (the INTERVAL recurrence definition, F4), and pm_schedule_locations (the fan-out membership —
// the EXPLICIT subset, e.g. Apple stores "1,5,20,23", NOT all-or-nothing).
//
// PK CONVENTION (deviation note): the 14c spec line said "autoincrement", but the spec's
// overriding instruction is "match jobs.ts EXACTLY; do not invent a new idiom" — and ALL 99
// live tables + every FK-target parent use varchar(36) uuidv7 PKs. An int-autoincrement PK
// would be the invented idiom AND mismatch the FK column types. So PKs are uuidv7 varchar(36),
// matching the rest of the schema. (Flagged for 14c review.)
//
// WP-12.2: every FK is PRE-NAMED via foreignKey() (the long pm_schedule_locations name would
// blow past MySQL's 64-char auto-name limit); the check-migration-identifiers guard enforces it.
// Names use the spec's fk_* identifiers.
//
// DELETE RULES (chosen per precedent — spec gave names, not rules):
//   tenant_id → CASCADE everywhere (a PM row has no value without its tenant).
//   pm_programs: client_id/primary_trade_id/priority_id → RESTRICT (mirrors jobs.ts ref-data
//     FKs — don't let a referenced client/trade/priority vanish under a live program);
//     created_by_user_id → SET NULL (preserve the program if its creator is removed — the
//     external_systems.created_by_user_id D-12c.1 precedent).
//   pm_schedules.pm_program_id → CASCADE (a schedule has no meaning without its program).
//   pm_schedule_locations: pm_schedule_id → CASCADE (membership dies with the schedule);
//     client_location_id → CASCADE (membership dies with the location).

const frequencyEnum = ["day", "week", "month"] as const;

// ── pm_programs ──
export const pmPrograms = mysqlTable(
  "pm_programs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    clientId: varchar("client_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    // Program-level template values (14b "scope/trade placement"): each visit inherits these;
    // each spawned job receives them. Per-location override = schema room left (B-14.3), not built.
    primaryTradeId: varchar("primary_trade_id", { length: 36 }),
    priorityId: varchar("priority_id", { length: 36 }),
    scopeOfWork: text("scope_of_work").notNull(),
    // F1: when true (default), a schedule fire spawns jobs without a gate; when false, it lands
    // DRAFT visits awaiting batch-approval (the §2.5 review path).
    autoGenerate: boolean("auto_generate").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "fk_pm_programs_tenant",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.clientId],
      foreignColumns: [clients.id],
      name: "fk_pm_programs_client",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.primaryTradeId],
      foreignColumns: [trades.id],
      name: "fk_pm_programs_trade",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.priorityId],
      foreignColumns: [priorities.id],
      name: "fk_pm_programs_priority",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.createdByUserId],
      foreignColumns: [users.id],
      name: "fk_pm_programs_created_by",
    }).onDelete("set null"),
    index("pm_programs_tenant_idx").on(t.tenantId),
    index("pm_programs_tenant_client_idx").on(t.tenantId, t.clientId),
    index("pm_programs_trade_idx").on(t.primaryTradeId),
    index("pm_programs_priority_idx").on(t.priorityId),
    index("pm_programs_created_by_idx").on(t.createdByUserId),
  ],
);

// ── pm_schedules (INTERVAL recurrence, F4) ──
// Recurrence columns named to NOT collide with the dispatch ADJECTIVE "scheduled"
// (scheduled_start_at/scheduled_end_at on job_vendor_assignments): frequency / interval_count /
// next_due_at / last_generated_at — none shaped like the dispatch columns (14b naming-care).
export const pmSchedules = mysqlTable(
  "pm_schedules",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    pmProgramId: varchar("pm_program_id", { length: 36 }).notNull(),
    frequency: mysqlEnum("frequency", frequencyEnum).notNull(),
    intervalCount: int("interval_count").notNull().default(1), // every N (quarterly = month + 3)
    nextDueAt: datetime("next_due_at").notNull(),
    lastGeneratedAt: datetime("last_generated_at"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "fk_pm_schedules_tenant",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.pmProgramId],
      foreignColumns: [pmPrograms.id],
      name: "fk_pm_schedules_program",
    }).onDelete("cascade"),
    index("pm_schedules_tenant_idx").on(t.tenantId),
    index("pm_schedules_program_idx").on(t.pmProgramId),
    // The generator scans active schedules whose next_due_at has passed.
    index("pm_schedules_due_idx").on(t.isActive, t.nextDueAt),
  ],
);

// ── pm_schedule_locations (the fan-out membership: explicit subset) ──
export const pmScheduleLocations = mysqlTable(
  "pm_schedule_locations",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    pmScheduleId: varchar("pm_schedule_id", { length: 36 }).notNull(),
    clientLocationId: varchar("client_location_id", { length: 36 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "fk_pmsl_tenant",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.pmScheduleId],
      foreignColumns: [pmSchedules.id],
      name: "fk_pmsl_schedule",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.clientLocationId],
      foreignColumns: [clientLocations.id],
      name: "fk_pmsl_location",
    }).onDelete("cascade"),
    index("pm_schedule_locations_tenant_idx").on(t.tenantId),
    index("pm_schedule_locations_schedule_idx").on(t.pmScheduleId),
    index("pm_schedule_locations_location_idx").on(t.clientLocationId),
  ],
);
