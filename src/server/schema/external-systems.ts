import {
  timestamp,
  index,
  json,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { credentialStatus, entityStatus } from "./enums";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";

// ── Phase 12 batch 12c (migration 0028) — EXTERNAL INTEGRATION CONNECTION SUBSTRATE ──
// The first slice of the external-portal integration framework: the registered
// integrations (external_systems), their per-system connection identity
// (external_accounts), and the secrets-capable credential store
// (external_credentials). Tenant-scoped; the source-agnostic invariant (§2.1) is
// served by keeping provider a varchar discriminator (12b F3) — adding a new
// provider needs no enum migration, mirroring job_notes.origin (D-11.10).
//
// SECURITY (12b F1): external_credentials ships the full secrets shape but this
// phase writes NO live secret — encrypted_payload stays NULL until the first
// working adapter decides the encryption-at-rest mechanism (D4: env-only today,
// no encryption util exists, so it is new ground). The column is encrypted_payload,
// NEVER plaintext; credentials never enter payload logs (harness-asserted, F10.4).
//
// FK-backing indexes are declared EXPLICITLY (the 6d/6g lesson) — every FK column
// gets its own index; we do not rely on InnoDB auto-backing.



export const externalSystems = pgTable(
  "external_systems",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // F3: app-enforced varchar, NOT an enum — new providers grow without a migration.
    provider: varchar("provider", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    status: entityStatus("status").notNull().default("active"),
    // Non-secret per-system settings (endpoints, toggles). Secrets live in
    // external_credentials, never here.
    config: json("config"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("external_systems_tenant_provider_name_unique").on(
      t.tenantId,
      t.provider,
      t.name,
    ),
    index("external_systems_tenant_status_idx").on(t.tenantId, t.status),
    index("external_systems_tenant_idx").on(t.tenantId),
    index("external_systems_created_by_idx").on(t.createdByUserId),
  ],
);

export const externalAccounts = pgTable(
  "external_accounts",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    externalSystemId: varchar("external_system_id", { length: 36 })
      .notNull()
      .references(() => externalSystems.id, { onDelete: "cascade" }),
    // The provider-side account / organization id.
    externalAccountRef: varchar("external_account_ref", {
      length: 255,
    }).notNull(),
    status: entityStatus("status").notNull().default("active"),
    config: json("config"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("external_accounts_tenant_system_idx").on(
      t.tenantId,
      t.externalSystemId,
    ),
    index("external_accounts_tenant_idx").on(t.tenantId),
    index("external_accounts_system_idx").on(t.externalSystemId),
  ],
);

// F1: full secrets-capable shape; NO live secret written this phase.


export const externalCredentials = pgTable(
  "external_credentials",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    externalSystemId: varchar("external_system_id", { length: 36 })
      .notNull()
      .references(() => externalSystems.id, { onDelete: "cascade" }),
    credentialType: varchar("credential_type", { length: 64 }).notNull(),
    // NEVER plaintext. Stays NULL until the first working adapter sets the
    // encryption-at-rest mechanism (F1 deferred-encryption).
    encryptedPayload: text("encrypted_payload"),
    // Which key / KMS alias encrypted the payload.
    keyRef: varchar("key_ref", { length: 255 }),
    expiresAt: timestamp("expires_at"),
    status: credentialStatus("status")
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("external_credentials_tenant_idx").on(t.tenantId),
    index("external_credentials_system_idx").on(t.externalSystemId),
  ],
);
