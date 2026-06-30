import {
  numeric,
  foreignKey,
  index,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { nteStatus } from "./enums";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { clients, clientLocations } from "./clients";
import { trades } from "./trades";
import { priorities } from "./job-reference";

// ── Phase 8 batch 8b (migration 0017) — CLIENT NTE CONFIGURATION (Surface 23) ────────
// The SOURCE layer for jobs.not_to_exceed_amount: (client × trade × urgency [× location])
// → default NTE, resolved at job creation and SNAPSHOTTED onto the job (config can change
// afterward; the job's NTE does not move — the markup/dispatch snapshot discipline).
// Operator can override at job and dispatch level. The existing two-NTE-level architecture
// (jobs.not_to_exceed_amount + job_vendor_assignments.agreed_nte_amount) becomes a
// three-level snapshot chain: config → job → dispatch.
//
// R-7.1 SINGLE-ACTIVE is a WRITE-PATH invariant, NOT a DB unique: at most one active row
// per (tenant_id, client_id, trade_id, priority_id, client_location_id). There is NO DB
// unique here — the nullable client_location_id + MariaDB's NULL-as-distinct semantics
// make one unreliable (two (.., NULL) rows would not collide). Enforced in the data-layer
// activateClientNteRule (8c) with the NteRuleAlreadyActive F3 error — the agent_policies
// precedent (agents-config.ts).
//
// Resolution ladder (8c resolveClientNteRule): (client,trade,urgency,location) →
// (client,trade,urgency,location=NULL) → (client, HANDYMAN trade, urgency) → operator
// enters manually. NO tenant-default tier (A5) — so there is NO client_nte_rule_defaults
// sibling table (8b-D2), unlike the agent-config substrate.
//
// client_location_id NULL = client-wide; a location-specific row takes precedence.
// Emergency multiplier lives on client_billing_rules.emergency_nte_multiplier (8b-D1).


export const clientNteRules = pgTable(
  "client_nte_rules",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    clientId: varchar("client_id", { length: 36 }).notNull(),
    tradeId: varchar("trade_id", { length: 36 }).notNull(),
    priorityId: varchar("priority_id", { length: 36 }).notNull(),
    // NULL = client-wide rule; a non-NULL row is a location-specific override (A4).
    clientLocationId: varchar("client_location_id", { length: 36 }),
    nteAmount: numeric("nte_amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    status: nteStatus("status").notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "cnr_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.clientId],
      foreignColumns: [clients.id],
      name: "cnr_client_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.tradeId],
      foreignColumns: [trades.id],
      name: "cnr_trade_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.priorityId],
      foreignColumns: [priorities.id],
      name: "cnr_priority_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.clientLocationId],
      foreignColumns: [clientLocations.id],
      name: "cnr_location_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.createdByUserId],
      foreignColumns: [users.id],
      name: "cnr_created_by_fk",
    }).onDelete("set null"),
    // Resolution ladder lookup; NO unique (R-7.1 is data-layer — see header).
    index("cnr_resolve_idx").on(t.tenantId, t.clientId, t.tradeId, t.priorityId),
    index("cnr_tenant_client_idx").on(t.tenantId, t.clientId),
  ],
);
