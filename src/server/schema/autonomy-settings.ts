import {
  boolean,
  decimal,
  foreignKey,
  int,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";

// ── Phase 23 batch 23b — TENANT AUTONOMY SETTINGS (the §2.4 non-overridable layer) ────
// ONE row per tenant. This is the guardrail home that sits ABOVE the policy resolver:
// agent_policies/agent_policy_defaults choose the per-agent disposition, but NOTHING an
// agent or policy resolves may EXCEED the tenant's own ceilings here, and the kill switch
// reverts ALL autonomy to gated regardless of any active policy.
//
// SCHEMA ONLY this batch. NO resolver wiring, NO enforcement, NO seed — the dispatch_router
// default seed + the resolver short-circuit land in a later 23 batch. The semantics below
// are documented as intent, not yet enforced anywhere in code.
//
// Semantics (intent — enforcement is a later batch):
//   • kill_switch=true → the resolver returns gated (requiresReview) for ALL agents, above
//     all policy. One control reverts every autonomous path to operator-reviewed.
//   • The committed-$ / token ceilings are TENANT-SET and freely chosen. "Non-overridable"
//     means no agent or policy may set a value that EXCEEDS the tenant's ceiling — it does
//     NOT mean the platform dictates the number. The tenant owns its own caps.
//   • A NULL ceiling = NO cap (the tenant has not set one) — distinct from 0 (which would
//     forbid any committed spend / token use).
//   • LLM usage is metered in TOKENS this phase (max_llm_tokens_*), not dollars — there is
//     no LLM dollar-cost column anywhere yet (agent_runs tracks input/output token counts).
export const tenantAutonomySettings = mysqlTable(
  "tenant_autonomy_settings",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    // One control reverts all autonomy to gated, above all policy.
    killSwitch: boolean("kill_switch").notNull().default(false),
    // Committed-$ ceilings (NTE/DNE the autonomy engine may commit). NULL = no cap.
    maxCommittedPerJob: decimal("max_committed_per_job", { precision: 12, scale: 2 }),
    maxCommittedPerDay: decimal("max_committed_per_day", { precision: 12, scale: 2 }),
    maxCommittedPerTenant: decimal("max_committed_per_tenant", { precision: 12, scale: 2 }),
    // LLM ceilings metered in TOKENS this phase (not dollars). NULL = no cap.
    maxLlmTokensPerDay: int("max_llm_tokens_per_day"),
    maxLlmTokensPerTenant: int("max_llm_tokens_per_tenant"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "tas_tenant_fk" }).onDelete("cascade"),
    // One row per tenant — the §2.4 layer is tenant-singular.
    uniqueIndex("tas_tenant_unique").on(t.tenantId),
  ],
);
