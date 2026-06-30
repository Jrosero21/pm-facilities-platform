import {
  boolean,
  date,
  numeric,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { mysqlEnum } from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { trades } from "./trades";
import { clients, clientLocations } from "./clients";

const statusEnum = ["active", "inactive", "archived"] as const;

// Contacts attached at the client (organization) level.
export const clientContacts = pgTable(
  "client_contacts",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: varchar("client_id", { length: 36 })
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    title: varchar("title", { length: 128 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 32 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("client_contacts_tenant_idx").on(t.tenantId),
    index("client_contacts_client_idx").on(t.clientId),
  ],
);

// Contacts attached to a specific location.
export const clientLocationContacts = pgTable(
  "client_location_contacts",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientLocationId: varchar("client_location_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    title: varchar("title", { length: 128 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 32 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.clientLocationId],
      foreignColumns: [clientLocations.id],
      name: "cl_contacts_location_fk",
    }).onDelete("cascade"),
    index("client_location_contacts_tenant_idx").on(t.tenantId),
    index("client_location_contacts_location_idx").on(t.clientLocationId),
  ],
);

// Operating hours per location. Multiple rows per day allowed (split hours).
// Schema-only in Phase 2 (no CRUD UI yet).
export const clientLocationHours = pgTable(
  "client_location_hours",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientLocationId: varchar("client_location_id", { length: 36 }).notNull(),
    dayOfWeek: mysqlEnum("day_of_week", [
      "sun",
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
      "sat",
    ]).notNull(),
    openTime: time("open_time"),
    closeTime: time("close_time"),
    isClosed: boolean("is_closed").notNull().default(false),
    notes: varchar("notes", { length: 255 }),
    // CF-19.1 — provenance of this hours row: client_provided (operator entered the
    // client's stated hours), system_default (the flat 9–5 seed), looked_up (resolved
    // from an external source). Defaults to system_default; additive, NOT NULL.
    hoursSource: mysqlEnum("hours_source", ["client_provided", "system_default", "looked_up"])
      .notNull()
      .default("system_default"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.clientLocationId],
      foreignColumns: [clientLocations.id],
      name: "cl_hours_location_fk",
    }).onDelete("cascade"),
    index("client_location_hours_tenant_idx").on(t.tenantId),
    index("client_location_hours_location_idx").on(t.clientLocationId),
  ],
);

// Free-form access/entry notes per location (gate codes, dock info, etc.).
// Schema-only in Phase 2.
export const clientLocationAccessNotes = pgTable(
  "client_location_access_notes",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientLocationId: varchar("client_location_id", { length: 36 }).notNull(),
    title: varchar("title", { length: 128 }),
    body: text("body").notNull(),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.clientLocationId],
      foreignColumns: [clientLocations.id],
      name: "cl_access_notes_location_fk",
    }).onDelete("cascade"),
    index("client_location_access_notes_tenant_idx").on(t.tenantId),
    index("client_location_access_notes_location_idx").on(t.clientLocationId),
  ],
);

// Billing rules per client (markup, payment terms). Schema-only in Phase 2;
// consumed by billing in Phase 8.
export const clientBillingRules = pgTable(
  "client_billing_rules",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: varchar("client_id", { length: 36 })
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    markupPercent: numeric("markup_percent", { precision: 6, scale: 3 }),
    paymentTermsDays: integer("payment_terms_days"),
    // Phase 8 (8b migration 0016) — two per-client billing-policy columns added to
    // this client-side billing-config substrate (8a §A; 8b-D1 Option B):
    // - is_tax_exempt: recorded, NOT enforced in Phase 8 (OQ-7).
    // - emergency_nte_multiplier: per-client override of the emergency NTE multiplier;
    //   NULL = tenant-default resolver constant 1.50, applied only when the job's
    //   priority.code = 'EMERGENCY' (Surface 23 A3). Resolver/enforcement is 8c code.
    isTaxExempt: boolean("is_tax_exempt").notNull().default(false),
    emergencyNteMultiplier: numeric("emergency_nte_multiplier", {
      precision: 4,
      scale: 2,
    }),
    notes: text("notes"),
    isDefault: boolean("is_default").notNull().default(false),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("client_billing_rules_tenant_idx").on(t.tenantId),
    index("client_billing_rules_client_idx").on(t.clientId),
  ],
);

// Phase (i) rate-sheet (0049) — per-client per-trade AGREED BILLED RATES (e.g. HVAC $95/hr).
// Mirrors vendor_rates (the cost-side analog) EXACTLY, with vendor_id → client_id and the
// vendor_location_id dimension DROPPED (deferred). trade_id null = a general (all-trade) rate.
// `unit` is meaningful when rate_type = 'per_unit' (e.g. materials). Resolution precedence
// (most-specific-wins) + how a rate produces a billed line is a Phase (ii) concern — not here.
export const clientRates = pgTable(
  "client_rates",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: varchar("client_id", { length: 36 })
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    tradeId: varchar("trade_id", { length: 36 }).references(() => trades.id, {
      onDelete: "restrict",
    }),
    rateType: mysqlEnum("rate_type", [
      "hourly",
      "flat",
      "trip_charge",
      "per_unit",
      "emergency",
      "after_hours",
    ]).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    unit: varchar("unit", { length: 32 }),
    effectiveDate: date("effective_date"),
    expiryDate: date("expiry_date"),
    notes: text("notes"),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("client_rates_tenant_client_idx").on(t.tenantId, t.clientId)],
);
