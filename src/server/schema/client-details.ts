import {
  boolean,
  decimal,
  foreignKey,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  time,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { clients, clientLocations } from "./clients";

const statusEnum = ["active", "inactive", "archived"] as const;

// Contacts attached at the client (organization) level.
export const clientContacts = mysqlTable(
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
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index("client_contacts_tenant_idx").on(t.tenantId),
    index("client_contacts_client_idx").on(t.clientId),
  ],
);

// Contacts attached to a specific location.
export const clientLocationContacts = mysqlTable(
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
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
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
export const clientLocationHours = mysqlTable(
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
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
export const clientLocationAccessNotes = mysqlTable(
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
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
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
export const clientBillingRules = mysqlTable(
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
    markupPercent: decimal("markup_percent", { precision: 6, scale: 3 }),
    paymentTermsDays: int("payment_terms_days"),
    notes: text("notes"),
    isDefault: boolean("is_default").notNull().default(false),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index("client_billing_rules_tenant_idx").on(t.tenantId),
    index("client_billing_rules_client_idx").on(t.clientId),
  ],
);
