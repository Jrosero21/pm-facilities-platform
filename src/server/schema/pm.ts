import {
  boolean,
  timestamp,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  varchar,
} from "drizzle-orm/pg-core";
import { frequency, generationStatus, result } from "./enums";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";
import { users } from "./auth";
import { clients, clientLocations } from "./clients";
import { trades } from "./trades";
import { priorities } from "./job-reference";
import { jobs } from "./jobs";

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



// ── pm_programs ──
export const pmPrograms = pgTable(
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
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
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
export const pmSchedules = pgTable(
  "pm_schedules",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    pmProgramId: varchar("pm_program_id", { length: 36 }).notNull(),
    frequency: frequency("frequency").notNull(),
    intervalCount: integer("interval_count").notNull().default(1), // every N (quarterly = month + 3)
    nextDueAt: timestamp("next_due_at").notNull(),
    lastGeneratedAt: timestamp("last_generated_at"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
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
export const pmScheduleLocations = pgTable(
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

// ── Phase 14 batch 14c (migration 0037) — PM OCCURRENCE substrate ──────────────────────
// The fan-out output: pm_generation_runs (the F2 batch-event record with requested/generated/
// skipped counts), pm_visits (one scheduled occurrence per location — F5: SPAWNS a job, linked
// via job_id nullable-until-spawned), and pm_assets (a LIGHTWEIGHT reference only — B-14.5, NOT
// EAM lifecycle). pm_generation_runs is declared BEFORE pm_visits so pm_visits' FK target exists.
//
// PKs = uuidv7 varchar(36) (the locked 0036 convention, matches all live tables). FKs pre-named
// (WP-12.2). DELETE RULES (per the 0036 precedent):
//   tenant_id → CASCADE everywhere.
//   pm_generation_runs.pm_schedule_id → CASCADE (a run has no value without its schedule);
//     created_by_user_id → SET NULL (SYSTEM user for auto runs; preserve the run if the user is removed).
//   pm_visits.pm_schedule_id → CASCADE; client_location_id → CASCADE (membership-bound);
//     pm_generation_run_id → SET NULL (preserve the visit if a run record is purged — audit-survive);
//     job_id → SET NULL (F5: the spawned job is independent; deleting it must not delete the visit
//     occurrence — the email_work_order_drafts.created_job_id SET-NULL precedent exactly).
//   pm_assets: client_location_id → CASCADE (an asset has no meaning without its location).



// ── pm_generation_runs (the F2 batch-event record) — declared before pm_visits (FK target) ──
export const pmGenerationRuns = pgTable(
  "pm_generation_runs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    pmScheduleId: varchar("pm_schedule_id", { length: 36 }).notNull(),
    requestedCount: integer("requested_count").notNull().default(0), // locations the fan-out attempted
    generatedCount: integer("generated_count").notNull().default(0), // visits/jobs created
    skippedCount: integer("skipped_count").notNull().default(0), // skip-and-flag failures (F2)
    runAt: timestamp("run_at").notNull(),
    createdByUserId: varchar("created_by_user_id", { length: 36 }), // SYSTEM for auto runs
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "fk_pm_gen_runs_tenant",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.pmScheduleId],
      foreignColumns: [pmSchedules.id],
      name: "fk_pm_gen_runs_schedule",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.createdByUserId],
      foreignColumns: [users.id],
      name: "fk_pm_gen_runs_created_by",
    }).onDelete("set null"),
    index("pm_generation_runs_tenant_idx").on(t.tenantId),
    index("pm_generation_runs_schedule_idx").on(t.pmScheduleId),
    index("pm_generation_runs_created_by_idx").on(t.createdByUserId),
  ],
);

// ── pm_visits (one scheduled occurrence per location; F5 spawns a job) ──
export const pmVisits = pgTable(
  "pm_visits",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    pmScheduleId: varchar("pm_schedule_id", { length: 36 }).notNull(),
    clientLocationId: varchar("client_location_id", { length: 36 }).notNull(),
    pmGenerationRunId: varchar("pm_generation_run_id", { length: 36 }), // which batch produced it
    dueAt: timestamp("due_at").notNull(),
    generationStatus: generationStatus("generation_status").notNull(),
    skipReason: varchar("skip_reason", { length: 512 }), // F2 skip-and-flag detail; null unless skipped
    jobId: varchar("job_id", { length: 36 }), // F5 spawn link; null until spawned
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "fk_pm_visits_tenant",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.pmScheduleId],
      foreignColumns: [pmSchedules.id],
      name: "fk_pm_visits_schedule",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.clientLocationId],
      foreignColumns: [clientLocations.id],
      name: "fk_pm_visits_location",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.pmGenerationRunId],
      foreignColumns: [pmGenerationRuns.id],
      name: "fk_pm_visits_run",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.jobId],
      foreignColumns: [jobs.id],
      name: "fk_pm_visits_job",
    }).onDelete("set null"),
    index("pm_visits_tenant_idx").on(t.tenantId),
    index("pm_visits_schedule_idx").on(t.pmScheduleId),
    index("pm_visits_location_idx").on(t.clientLocationId),
    index("pm_visits_run_idx").on(t.pmGenerationRunId),
    index("pm_visits_job_idx").on(t.jobId),
    index("pm_visits_tenant_status_idx").on(t.tenantId, t.generationStatus),
  ],
);

// ── pm_assets (LIGHTWEIGHT reference only — B-14.5, NOT EAM lifecycle) ──
export const pmAssets = pgTable(
  "pm_assets",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    clientLocationId: varchar("client_location_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    assetType: varchar("asset_type", { length: 128 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "fk_pm_assets_tenant",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.clientLocationId],
      foreignColumns: [clientLocations.id],
      name: "fk_pm_assets_location",
    }).onDelete("cascade"),
    index("pm_assets_tenant_idx").on(t.tenantId),
    index("pm_assets_location_idx").on(t.clientLocationId),
  ],
);

// ── Phase 14 batch 14c (migration 0038) — PM CHECKLIST (template / instance, F6) ───────
// pm_visit_checklists = the TEMPLATE (a checklist line defined at the PROGRAM level);
// pm_visit_results = the INSTANCE (a per-visit filled answer for one template item). Mirrors
// scope_templates → job_scope_steps (Phase 7). PKs = uuidv7 varchar(36); FKs pre-named (WP-12.2).
// DELETE RULES: tenant_id → CASCADE; pm_program_id → CASCADE (template dies with its program);
// pm_visit_id → CASCADE (results die with their visit); pm_visit_checklist_id → CASCADE (a result
// has no meaning without the template item it answers).



// ── pm_visit_checklists (TEMPLATE — program-level definition) ──
export const pmVisitChecklists = pgTable(
  "pm_visit_checklists",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    pmProgramId: varchar("pm_program_id", { length: 36 }).notNull(), // the template lives on the program
    itemText: varchar("item_text", { length: 512 }).notNull(), // e.g. "Replace HVAC filter"
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "fk_pm_checklists_tenant",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.pmProgramId],
      foreignColumns: [pmPrograms.id],
      name: "fk_pm_checklists_program",
    }).onDelete("cascade"),
    index("pm_visit_checklists_tenant_idx").on(t.tenantId),
    index("pm_visit_checklists_program_idx").on(t.pmProgramId),
  ],
);

// ── pm_visit_results (INSTANCE — per-visit filled answer for one template item) ──
export const pmVisitResults = pgTable(
  "pm_visit_results",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    pmVisitId: varchar("pm_visit_id", { length: 36 }).notNull(),
    pmVisitChecklistId: varchar("pm_visit_checklist_id", { length: 36 }).notNull(), // which template item
    result: result("result"), // null = not yet recorded
    notes: text("notes"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "fk_pm_results_tenant",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.pmVisitId],
      foreignColumns: [pmVisits.id],
      name: "fk_pm_results_visit",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.pmVisitChecklistId],
      foreignColumns: [pmVisitChecklists.id],
      name: "fk_pm_results_checklist",
    }).onDelete("cascade"),
    index("pm_visit_results_tenant_idx").on(t.tenantId),
    index("pm_visit_results_visit_idx").on(t.pmVisitId),
    index("pm_visit_results_checklist_idx").on(t.pmVisitChecklistId),
  ],
);
