import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { mysqlEnum } from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";

// ── Phase 28 / CF-23.1 (K1) — TENANT-SUPPLIED LLM API KEYS (encrypted at rest) ─────────
// A tenant's own provider key, stored as the secret-crypto v1:iv:tag:ct blob (CF-12.4). When
// that tenant's agents run, their key is used instead of the platform env key (each tenant pays
// for their own AI usage); a tenant with no active key falls back to the platform key (today's
// behavior, unchanged). NEVER plaintext — encrypted_key is always a secret-crypto token.
//
// GRAIN: one ACTIVE key per (tenant, provider). NOT a DB unique (a revoked row must coexist with
// a new active one) — the setter enforces single-active (revoke-then-insert), mirroring how
// agent_policies handles single-active without a DB unique.

const llmKeyProviderEnum = ["anthropic", "openai"] as const;
const llmKeyStatusEnum = ["active", "revoked"] as const;

export const tenantLlmKeys = pgTable(
  "tenant_llm_keys",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    provider: mysqlEnum("provider", llmKeyProviderEnum).notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    keyRef: varchar("key_ref", { length: 255 }).notNull(),
    status: mysqlEnum("status", llmKeyStatusEnum).notNull().default("active"),
    label: varchar("label", { length: 255 }),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "tlk_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.createdByUserId], foreignColumns: [users.id], name: "tlk_created_by_fk" }).onDelete("set null"),
    index("tlk_tenant_provider_status_idx").on(t.tenantId, t.provider, t.status),
  ],
);
