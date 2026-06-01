import {
  boolean,
  decimal,
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
import { clients, clientLocations } from "./clients";
import { trades } from "./trades";
import { priorities } from "./job-reference";
import { jobs } from "./jobs";

// ── Phase 15 batch 15c (migration 0039) — SNOW OPERATIONS · PROGRAM + SITE LAYER ───────
// Snow is the EVENT-triggered batch engine (the PM time-triggered engine's structural twin).
// This 0039 tier lands the program + site substrate ONLY (no event/fan-out — that's 0040;
// no capture/placeholder — that's 0041). The three tables here have FKs pointing solely at
// EXISTING parents (tenants/clients/trades/priorities/users/client_locations) so 0039 can run
// before 0040/0041 exist.
//
// PK CONVENTION: uuidv7 varchar(36), matching jobs.ts/pm.ts and every live FK-target parent.
//
// WP-12.2: every FK is PRE-NAMED via foreignKey() (the long snow_* names would otherwise blow
// past MySQL's 64-char auto-name limit); check-migration-identifiers enforces it. Names use the
// 15b-manifest fk_* identifiers (longest in this tier = fk_sprog_created_by, 19 chars).
//
// DELETE RULES (the pm.ts precedent, §38 of pm.ts):
//   tenant_id → CASCADE everywhere (a snow row has no value without its tenant).
//   snow_programs: client_id/default_primary_trade_id/default_priority_id → RESTRICT (mirror
//     jobs.ts/pm.ts ref-data FKs — don't let a referenced client/trade/priority vanish under a
//     live program); created_by_user_id → SET NULL (preserve the program if its creator is
//     removed — the external_systems / pm_programs precedent).
//   snow_sites.snow_program_id → CASCADE (a site enrollment has no meaning without its program).
//   snow_service_triggers.snow_program_id → CASCADE (a trigger rule dies with its program).
//
// THE F15-B ASYMMETRY (intentional — confirmed): snow_sites is an OVERLAY on client_locations.
//   snow_program_id → CASCADE: deleting the program tears down the snow ENROLLMENT (the overlay).
//   client_location_id → RESTRICT: a snow enrollment must NEVER block-delete a real location;
//   conversely a location with a live snow enrollment cannot be silently removed under it. The
//   overlay is subordinate to the program, never to the canonical location.

// ── snow_programs ── (program-level client/trade/priority + spawn defaults; the pm_programs analog)
export const snowPrograms = mysqlTable(
  "snow_programs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    clientId: varchar("client_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    // createJob REQUIRES problem_description (15b V3); the per-site spawn sources it from here.
    defaultProblemDescription: text("default_problem_description").notNull(),
    // Program-level spawn defaults (nullable — createJob's primaryTradeId/priorityId are optional).
    defaultPrimaryTradeId: varchar("default_primary_trade_id", { length: 36 }),
    defaultPriorityId: varchar("default_priority_id", { length: 36 }),
    // F15-A: STAGE-by-default. false → a declared event STAGES dispatches for operator
    // batch-confirm; true → it auto-dispatches. (Inverse-default of pm_programs.auto_generate,
    // by the locked snow decision: storms still get a human gate unless explicitly opted out.)
    autoDispatch: boolean("auto_dispatch").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "fk_sprog_tenant",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.clientId],
      foreignColumns: [clients.id],
      name: "fk_sprog_client",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.defaultPrimaryTradeId],
      foreignColumns: [trades.id],
      name: "fk_sprog_trade",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.defaultPriorityId],
      foreignColumns: [priorities.id],
      name: "fk_sprog_priority",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.createdByUserId],
      foreignColumns: [users.id],
      name: "fk_sprog_created_by",
    }).onDelete("set null"),
    index("snow_programs_tenant_idx").on(t.tenantId),
    index("snow_programs_tenant_client_idx").on(t.tenantId, t.clientId),
    index("snow_programs_trade_idx").on(t.defaultPrimaryTradeId),
    index("snow_programs_priority_idx").on(t.defaultPriorityId),
    index("snow_programs_created_by_idx").on(t.createdByUserId),
  ],
);

// ── snow_sites ── (OVERLAY on client_locations — F15-B; the pm_schedule_locations analog)
export const snowSites = mysqlTable(
  "snow_sites",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    snowProgramId: varchar("snow_program_id", { length: 36 }).notNull(),
    // The overlay FK: client_locations.id is varchar(36) (15b V4). RESTRICT — see asymmetry note.
    clientLocationId: varchar("client_location_id", { length: 36 }).notNull(),
    // Snow-specific attrs (the overlay payload). plow_priority = site service order within a storm.
    plowPriority: int("plow_priority"),
    siteNotes: text("site_notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "fk_ssite_tenant",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.snowProgramId],
      foreignColumns: [snowPrograms.id],
      name: "fk_ssite_program",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.clientLocationId],
      foreignColumns: [clientLocations.id],
      name: "fk_ssite_location",
    }).onDelete("restrict"),
    index("snow_sites_tenant_idx").on(t.tenantId),
    index("snow_sites_program_idx").on(t.snowProgramId),
    index("snow_sites_location_idx").on(t.clientLocationId),
  ],
);

// ── snow_service_triggers ── (manual rule-shape — F15-D; weather eval DEFERS, B-15.2)
// 'manual' is the only live trigger_type this phase. 'weather_threshold' is a future value;
// threshold_value/threshold_unit are PLACEHOLDER columns (schema room) — no runtime reads them
// in Phase 15.
export const snowServiceTriggers = mysqlTable(
  "snow_service_triggers",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    snowProgramId: varchar("snow_program_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    // Rule-shape, not an enum (future values land without a schema change). 'manual' only this phase.
    triggerType: varchar("trigger_type", { length: 32 }).notNull().default("manual"),
    // Placeholders for the deferred weather feed (B-15.2): unused at runtime this phase.
    thresholdValue: decimal("threshold_value", { precision: 6, scale: 2 }),
    thresholdUnit: varchar("threshold_unit", { length: 16 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "fk_strig_tenant",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.snowProgramId],
      foreignColumns: [snowPrograms.id],
      name: "fk_strig_program",
    }).onDelete("cascade"),
    index("snow_service_triggers_tenant_idx").on(t.tenantId),
    index("snow_service_triggers_program_idx").on(t.snowProgramId),
  ],
);

// ── Phase 15 batch 15c (migration 0040) — SNOW OPERATIONS · EVENT + FAN-OUT LAYER ──────
// The event-triggered batch fan-out (the PM generate-visits structural twin at event scale):
//   snow_events       — the BATCH-RUN HEADER (one storm; the pm_generation_runs analog, F15-G).
//   snow_event_sites  — the MEMBERSHIP fan-out (which enrolled sites this storm hits; pm_visits
//                       analog as the per-site batch artifact).
//   snow_dispatches   — the per-site SPAWN/OUTCOME record (nullable job_id + skip_reason; F15-C).
//                       NOT a parallel vendor-assignment table — the spawned job reuses the
//                       existing Phase-5 dispatch workflow.
//
// FKs point only at 0039 tables + existing jobs (all on prod before 0040 runs). Hand-named
// (WP-12.2). DELETE RULES (pm.ts precedent): tenant → CASCADE; parent-refs (program/event/site/
// event_site) → CASCADE (the membership/outcome has no meaning without its parent);
// declared_by_user_id → SET NULL (preserve the event if its declarer is removed).
//
// snow_dispatches.job_id → SET NULL: MATCHES pm_visits.job_id (live fk_pm_visits_job = SET NULL,
// 15c Stage 0) — the spawn-record-to-job link behaves identically across PM and Snow. The
// dispatch outcome row (incl. its skip_reason) survives a job deletion as historical record.

const eventStatusEnum = ["declared", "dispatching", "complete", "cancelled"] as const;
const dispatchStatusEnum = ["staged", "spawned", "skipped", "cancelled"] as const;

// ── Phase 15 batch 15c (migration 0041) — SNOW OPERATIONS · CAPTURE + WEATHER PLACEHOLDER ──
// snow_weather_observations — a PLACEHOLDER the manual event references (live weather feed
//   defers, B-15.2). snow_service_logs — per-dispatch PROOF-OF-SERVICE capture (schema lands;
//   the runtime that fills it defers, B-15.1 / CF-14.1 analog).
//
// ORDERING NOTE: snow_weather_observations is DEFINED HERE (before snow_events) — not appended
// at the end — because snow_events.fk_sevent_weather (added below, decision A) references it.
// drizzle evaluates the foreignKey() callback eagerly at module load, so the target table const
// must exist first (the repo's parent-before-child convention). The MIGRATION is still additive
// 0041 (this is purely TS declaration order; the generated SQL CREATEs the table then ALTERs
// snow_events). snow_service_logs (references snow_dispatches, defined above) is appended at end.

// ── snow_weather_observations ── (PLACEHOLDER — manual event references it; live feed defers, B-15.2)
export const snowWeatherObservations = mysqlTable(
  "snow_weather_observations",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    snowProgramId: varchar("snow_program_id", { length: 36 }), // optional program scoping
    observedAt: timestamp("observed_at").notNull().defaultNow(),
    // Placeholder; 'manual' is the only live source this phase (the weather feed defers).
    source: varchar("source", { length: 64 }).notNull().default("manual"),
    snowDepth: decimal("snow_depth", { precision: 6, scale: 2 }), // placeholder metric; unused at runtime
    temperature: decimal("temperature", { precision: 6, scale: 2 }), // placeholder metric; unused at runtime
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "fk_swobs_tenant",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.snowProgramId],
      foreignColumns: [snowPrograms.id],
      name: "fk_swobs_program",
    }).onDelete("cascade"),
    index("snow_weather_observations_tenant_idx").on(t.tenantId),
    index("snow_weather_observations_program_idx").on(t.snowProgramId),
  ],
);

// ── snow_events ── (BATCH-RUN HEADER — the storm; pm_generation_runs analog, F15-G)
export const snowEvents = mysqlTable(
  "snow_events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    snowProgramId: varchar("snow_program_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(), // storm label, e.g. "Jan 12 Nor'easter"
    eventStatus: mysqlEnum("event_status", eventStatusEnum)
      .notNull()
      .default("declared"),
    declaredAt: timestamp("declared_at").notNull().defaultNow(),
    declaredByUserId: varchar("declared_by_user_id", { length: 36 }),
    // Column landed soft in 0040 (target table didn't exist yet). 0041 completes it with the real
    // FK fk_sevent_weather (decision A) → snow_weather_observations.id, ON DELETE SET NULL (an
    // event survives deletion of the observation it referenced).
    snowWeatherObservationId: varchar("snow_weather_observation_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "fk_sevent_tenant",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.snowProgramId],
      foreignColumns: [snowPrograms.id],
      name: "fk_sevent_program",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.declaredByUserId],
      foreignColumns: [users.id],
      name: "fk_sevent_declared_by",
    }).onDelete("set null"),
    // 0041 decision A: complete the 0040 soft ref. SET NULL — an event outlives its observation.
    foreignKey({
      columns: [t.snowWeatherObservationId],
      foreignColumns: [snowWeatherObservations.id],
      name: "fk_sevent_weather",
    }).onDelete("set null"),
    index("snow_events_tenant_idx").on(t.tenantId),
    index("snow_events_program_idx").on(t.snowProgramId),
    index("snow_events_status_idx").on(t.eventStatus),
    index("snow_events_declared_by_idx").on(t.declaredByUserId),
  ],
);

// ── snow_event_sites ── (MEMBERSHIP fan-out — which enrolled sites this storm hits; pm_visits analog)
export const snowEventSites = mysqlTable(
  "snow_event_sites",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    snowEventId: varchar("snow_event_id", { length: 36 }).notNull(),
    snowSiteId: varchar("snow_site_id", { length: 36 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "fk_ses_tenant",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.snowEventId],
      foreignColumns: [snowEvents.id],
      name: "fk_ses_event",
    }).onDelete("cascade"), // membership dies with the event
    foreignKey({
      columns: [t.snowSiteId],
      foreignColumns: [snowSites.id],
      name: "fk_ses_site",
    }).onDelete("cascade"), // membership dies with the site enrollment
    index("snow_event_sites_tenant_idx").on(t.tenantId),
    index("snow_event_sites_event_idx").on(t.snowEventId),
    index("snow_event_sites_site_idx").on(t.snowSiteId),
  ],
);

// ── snow_dispatches ── (per-site SPAWN/OUTCOME record — F15-C; the spawned job reuses Phase-5 dispatch)
export const snowDispatches = mysqlTable(
  "snow_dispatches",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    snowEventSiteId: varchar("snow_event_site_id", { length: 36 }).notNull(),
    // Nullable: null until the per-site createJob succeeds (F15-C). SET NULL on job delete —
    // matches pm_visits.job_id (Stage 0); the outcome row + skip_reason survive as history.
    jobId: varchar("job_id", { length: 36 }),
    dispatchStatus: mysqlEnum("dispatch_status", dispatchStatusEnum)
      .notNull()
      .default("staged"), // F15-A: stage-by-default
    skipReason: text("skip_reason"), // set when status='skipped' (createJob err.message — skip-and-flag)
    spawnedAt: timestamp("spawned_at"), // set when createJob succeeds
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "fk_disp_tenant",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.snowEventSiteId],
      foreignColumns: [snowEventSites.id],
      name: "fk_disp_event_site",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.jobId],
      foreignColumns: [jobs.id],
      name: "fk_disp_job",
    }).onDelete("set null"), // MATCHES pm_visits.job_id (Stage 0)
    index("snow_dispatches_tenant_idx").on(t.tenantId),
    index("snow_dispatches_event_site_idx").on(t.snowEventSiteId),
    index("snow_dispatches_job_idx").on(t.jobId),
    index("snow_dispatches_status_idx").on(t.dispatchStatus),
  ],
);

// ── snow_service_logs ── (per-dispatch PROOF-OF-SERVICE capture; schema only — runtime defers, B-15.1)
// References snow_dispatches (defined above — backward ref). The capture runtime (mobile/field
// fill of serviced_at/photo_refs/gps/notes) is DEFERRED this phase; only the schema lands now.
export const snowServiceLogs = mysqlTable(
  "snow_service_logs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    snowDispatchId: varchar("snow_dispatch_id", { length: 36 }).notNull(),
    servicedAt: timestamp("serviced_at"), // when service performed; nullable — capture runtime fills later
    // MariaDB: json → longtext + json_valid CHECK. Parse at the read boundary (the repo json idiom).
    photoRefs: json("photo_refs"),
    gpsLat: decimal("gps_lat", { precision: 10, scale: 7 }),
    gpsLng: decimal("gps_lng", { precision: 10, scale: 7 }),
    notes: text("notes"),
    loggedByUserId: varchar("logged_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "fk_slog_tenant",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.snowDispatchId],
      foreignColumns: [snowDispatches.id],
      name: "fk_slog_dispatch",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.loggedByUserId],
      foreignColumns: [users.id],
      name: "fk_slog_logged_by",
    }).onDelete("set null"),
    index("snow_service_logs_tenant_idx").on(t.tenantId),
    index("snow_service_logs_dispatch_idx").on(t.snowDispatchId),
    index("snow_service_logs_logged_by_idx").on(t.loggedByUserId),
  ],
);
