import {
  numeric,
  foreignKey,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { mysqlEnum } from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";
import { clients } from "./clients";

// ── Phase 7 batch 7b — GENERIC AGENT CONFIG SUBSTRATE ─────────────────────────────────
// DB-stored, versioned prompts (ai_prompt_templates) and per-tenant/per-client policies
// (agent_policies), replacing Phase 6's in-code prompt.ts + the inline requires_review
// literal. These are the generic config layer EVERY agent resolves at runtime (rewriter
// retrofit + scope generator + future agents). Schema only this batch — NO seed rows, NO
// data-layer resolver, NO agent wiring (that is the next batch's staged step 1).
//
// OQ #3 (the multi-tenancy invariant is foundational): tenant-scoped tables keep
// tenant_id NOT NULL; global platform defaults live in SEPARATE sibling tables with NO
// tenant_id column at all (ai_prompt_template_defaults / agent_policy_defaults). The
// runtime resolver falls through tenant → defaults. This keeps every tenant-scoped query
// clean (no `OR tenant_id IS NULL`).
//
// Config lifecycle status = (draft, active, archived), default 'draft' — distinct from
// the operational soft-delete enum (active/inactive/archived). A row resolves only when
// status='active'; seeds promote explicitly.

const configStatusEnum = ["draft", "active", "archived"] as const;

// ai_prompt_templates — tenant-scoped versioned prompts. A behavior-affecting prompt
// change inserts a NEW row (version+1, draft→active) and archives the prior active row;
// agent_runs.prompt_version records the version that ran (real provenance lineage).
//
// SINGLE-ACTIVE INVARIANT (R-7.x, decision B): at most one row per (tenant_id, agent_id,
// variant) may be status='active' at a time. The UNIQUE(tenant_id, agent_id, variant,
// version) below only blocks DUPLICATE VERSIONS — it does NOT enforce single-active
// (MariaDB has no partial unique). Single-active is a WRITE-PATH invariant enforced in the
// data layer (next batch); the read resolver should ORDER BY version DESC LIMIT 1 as a
// non-load-bearing tie-break safety net.
export const aiPromptTemplates = pgTable(
  "ai_prompt_templates",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    agentId: varchar("agent_id", { length: 64 }).notNull(),
    variant: varchar("variant", { length: 64 }).notNull().default("default"),
    version: integer("version").notNull().default(1),
    status: mysqlEnum("status", configStatusEnum).notNull().default("draft"),
    systemPrompt: text("system_prompt").notNull(),
    userPromptTemplate: text("user_prompt_template"),
    modelHint: varchar("model_hint", { length: 64 }),
    temperature: numeric("temperature", { precision: 3, scale: 2 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "apt_tenant_fk" }).onDelete("cascade"),
    uniqueIndex("apt_tenant_agent_variant_version_unique").on(t.tenantId, t.agentId, t.variant, t.version),
    index("apt_lookup_idx").on(t.tenantId, t.agentId, t.variant, t.status),
  ],
);

// ai_prompt_template_defaults — global platform defaults (NO tenant_id). Resolver fall-
// through target for ai_prompt_templates. F1: UNIQUE(agent_id, variant) — this table is
// SINGLE-ROW-PER-KEY (decision A): no retained version history. Updating a platform
// default bumps `version` in place (UPDATE), so the fall-through resolver can never hit
// multiple rows. (Tenant config keeps full history; platform defaults trade history for
// the single-row guarantee F1 needs — discoverable here, carried to 02-decisions.md.)
export const aiPromptTemplateDefaults = pgTable(
  "ai_prompt_template_defaults",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    agentId: varchar("agent_id", { length: 64 }).notNull(),
    variant: varchar("variant", { length: 64 }).notNull().default("default"),
    version: integer("version").notNull().default(1),
    status: mysqlEnum("status", configStatusEnum).notNull().default("draft"),
    systemPrompt: text("system_prompt").notNull(),
    userPromptTemplate: text("user_prompt_template"),
    modelHint: varchar("model_hint", { length: 64 }),
    temperature: numeric("temperature", { precision: 3, scale: 2 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("aptd_agent_variant_unique").on(t.agentId, t.variant),
  ],
);

// agent_policies — tenant-scoped per-agent policy (optionally per-client). Resolution
// ladder (OQ #3): (tenant_id, client_id, agent_id) → (tenant_id, agent_id [client_id
// NULL]) → agent_policy_defaults(agent_id). client_id NULLABLE = tenant-wide for the
// agent. policy json holds the constraint document; Phase 7 exercises only
// {requiresReview:true}. NO-MATCH fails SAFE to requiresReview (resolver concern, not DB).
//
// SINGLE-ACTIVE INVARIANT (R-7.x, decision B): at most one active row per (tenant_id,
// client_id, agent_id). There is NO DB unique here — the nullable client_id plus
// MariaDB's NULL-as-distinct semantics make a unique unreliable (two (tenant, NULL, agent)
// rows would not collide). The invariant is therefore 100% a WRITE-PATH guarantee.
export const agentPolicies = pgTable(
  "agent_policies",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    clientId: varchar("client_id", { length: 36 }),
    agentId: varchar("agent_id", { length: 64 }).notNull(),
    policy: json("policy").notNull(),
    version: integer("version").notNull().default(1),
    status: mysqlEnum("status", configStatusEnum).notNull().default("draft"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "ap_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.clientId], foreignColumns: [clients.id], name: "ap_client_fk" }).onDelete("cascade"),
    index("ap_lookup_idx").on(t.tenantId, t.agentId, t.clientId),
  ],
);

// agent_policy_defaults — global platform policy defaults (NO tenant_id). Resolver fall-
// through target for agent_policies. F1: UNIQUE(agent_id) — SINGLE-ROW-PER-KEY (decision
// A), no retained version history; bump `version` in place on update.
export const agentPolicyDefaults = pgTable(
  "agent_policy_defaults",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    agentId: varchar("agent_id", { length: 64 }).notNull(),
    policy: json("policy").notNull(),
    version: integer("version").notNull().default(1),
    status: mysqlEnum("status", configStatusEnum).notNull().default("draft"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("apd_agent_unique").on(t.agentId),
  ],
);
