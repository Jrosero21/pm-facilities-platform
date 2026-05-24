import {
  decimal,
  index,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";

export const clients = mysqlTable(
  "clients",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    clientCode: varchar("client_code", { length: 64 }),
    status: mysqlEnum("status", ["active", "inactive", "archived"])
      .notNull()
      .default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    // Name unique per tenant. client_code unique per tenant *when present* —
    // MySQL treats NULLs as distinct, so many code-less clients are allowed.
    uniqueIndex("clients_tenant_name_unique").on(t.tenantId, t.name),
    uniqueIndex("clients_tenant_code_unique").on(t.tenantId, t.clientCode),
    index("clients_tenant_idx").on(t.tenantId),
    index("clients_status_idx").on(t.status),
  ],
);

export const clientLocations = mysqlTable(
  "client_locations",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    // tenant_id is denormalized from the parent client so location queries can
    // be scoped by tenant without joining through clients, and cross-tenant
    // client references are guarded. location.tenant_id must equal client.tenant_id.
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: varchar("client_id", { length: 36 })
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    locationCode: varchar("location_code", { length: 64 }),
    status: mysqlEnum("status", ["active", "inactive", "archived"])
      .notNull()
      .default("active"),
    addressLine1: varchar("address_line1", { length: 255 }).notNull(),
    addressLine2: varchar("address_line2", { length: 255 }),
    city: varchar("city", { length: 128 }).notNull(),
    stateProvince: varchar("state_province", { length: 128 }).notNull(),
    postalCode: varchar("postal_code", { length: 32 }).notNull(),
    country: varchar("country", { length: 2 }).notNull().default("US"),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    // location_code unique within a client when present.
    uniqueIndex("client_locations_client_code_unique").on(
      t.clientId,
      t.locationCode,
    ),
    index("client_locations_tenant_idx").on(t.tenantId),
    index("client_locations_client_idx").on(t.clientId),
    index("client_locations_status_idx").on(t.status),
  ],
);
