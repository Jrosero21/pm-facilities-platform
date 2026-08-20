import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { membershipStatus, tenantStatus, tenantsType } from "./enums";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";

export const tenants = pgTable("tenants", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  type: tenantsType("type")
    .notNull()
    .default("aggregator"),
  status: tenantStatus("status")
    .notNull()
    .default("active"),
  // Client-priority weighting — the per-tenant ON/OFF switch. OFF by default (behavior-preserving:
  // no client-priority bump enters the exceptions triage until a tenant opts in). Governs whether
  // clients.is_priority has any effect.
  priorityClientWeightingEnabled: boolean("priority_client_weighting_enabled").notNull().default(false),
  // ── invoice-pdf batch 1 — MINIMAL COMPANY PROFILE (the invoice letterhead) ──────────────
  // The aggregator's own identity, for rendering on client-facing documents (invoice PDF first).
  // Before this, `name` was the ONLY brandable value on a tenant — there was no address, no legal
  // name, no remit-to anywhere in the schema. Columns (not a side table): one row per tenant, read
  // once per render, always needed together — a join would buy nothing. `legalName` mirrors the
  // naming precedent already set by vendors.legal_name (vendors.ts:32).
  // ALL NULLABLE + additive ⇒ zero-downtime; every existing row stays valid, and the renderer
  // degrades to `name` alone when the profile is unset.
  // ★ NO LOGO — deferred (D1 in the bank): a logo needs file-upload + R2 storage, which is a
  //   different build. Do not add a logo URL column here as a placeholder.
  legalName: varchar("legal_name", { length: 255 }),
  addressLine1: varchar("address_line1", { length: 255 }),
  addressLine2: varchar("address_line2", { length: 255 }),
  city: varchar("city", { length: 128 }),
  stateProvince: varchar("state_province", { length: 128 }),
  postalCode: varchar("postal_code", { length: 32 }),
  country: varchar("country", { length: 2 }),
  // Free text: payment-remittance instructions ("Remit to: … / ACH …"). Multi-line ⇒ text.
  remitTo: text("remit_to"),
  phone: varchar("phone", { length: 64 }),
  email: varchar("email", { length: 255 }),
  // ── vendor-WO batch 1 — DEFAULT DISPATCH INSTRUCTIONS (the system fallback) ──────────
  // The aggregator's own standing boilerplate, used for any client that has not set its own.
  // Same raw-template shape as clients.dispatch_instructions (free text with @tokens,
  // substituted in batch 2) — this is the FALLBACK, not a wrapper: resolution picks ONE of the
  // two, it never concatenates them.
  //
  // Why a tenant default exists at all: most clients will never need bespoke instructions, and
  // without this the common case would be either an empty section on every work order or the
  // same paragraph copied onto every client row — where a policy change then has to be applied
  // N times and will be missed somewhere.
  //
  // NULLABLE + additive, mirroring remit_to above: a tenant that sets neither simply renders no
  // instructions section, which is the correct degradation.
  defaultDispatchInstructions: text("default_dispatch_instructions"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const tenantUsers = pgTable(
  "tenant_users",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: membershipStatus("status")
      .notNull()
      .default("active"),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("tenant_users_tenant_user_unique").on(t.tenantId, t.userId),
    index("tenant_users_user_idx").on(t.userId),
    index("tenant_users_tenant_idx").on(t.tenantId),
  ],
);
