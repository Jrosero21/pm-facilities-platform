import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { entityStatus } from "./enums";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";
import { trades } from "./trades";

// ── Phase 7 batch 7b — SCOPE TEMPLATE LIBRARY (EMPTY-SCHEMA FORWARD-DECLS) ─────────────
// scope_templates + scope_template_steps are roadmap §9 core tables, shipped this batch as
// SCHEMA ONLY (OQ #2 / AC-11). No authoring UI, NO seed data, no LLM template-grounding,
// no apply-template path, and NO code path reads or writes them in Phase 7. They exist so
// the FK target is present for future seed/grounding work, evaluated empirically after
// Phase 7 ships. This is the D-6.17 precedent (vendor_update_logs / portal_update_queue
// shipped as forward-decls in their own migration) — isolating them in migration 0014
// makes their "shipped but untouched" status self-documenting in the migration history.
//
// Shape mirrors job_scope_steps so a future template explodes 1:1 into job_scope_steps and
// a future few-shot example is structurally identical to the output. tenant_id NOT NULL
// (OQ #3); a platform-shared library, if ever wanted, follows the defaults-table pattern.



export const scopeTemplates = pgTable(
  "scope_templates",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    tradeId: varchar("trade_id", { length: 36 }),
    description: text("description"),
    status: entityStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "st_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.tradeId], foreignColumns: [trades.id], name: "st_trade_fk" }).onDelete("set null"),
    index("st_tenant_idx").on(t.tenantId),
  ],
);

// scope_template_steps — the template's ordered steps (pure child; no own soft-delete
// status — cascade-deleted with the template).
export const scopeTemplateSteps = pgTable(
  "scope_template_steps",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    templateId: varchar("template_id", { length: 36 }).notNull(),
    stepOrder: integer("step_order").notNull(),
    instruction: text("instruction").notNull(),
    category: varchar("category", { length: 32 }),
    expectsPhoto: boolean("expects_photo").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "sts_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.templateId], foreignColumns: [scopeTemplates.id], name: "sts_template_fk" }).onDelete("cascade"),
    index("sts_template_order_idx").on(t.templateId, t.stepOrder),
  ],
);
