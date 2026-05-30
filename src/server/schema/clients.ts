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

// Client↔user linkage (Phase 11 Fork 1). Maps an auth user to a client org
// within an aggregator tenant, scoping client-portal visibility. MANY-TO-MANY:
// one user may be scoped to several client orgs; one client org has several
// portal users. A client user ALSO holds a tenant_users membership + a
// client_user role grant; this table adds the client-scope on top. The lean
// vendor_users twin (11c A1 confirmed vendor_users carries no status column) —
// all three FKs cascade; the unique (tenant,user,client) enforces one mapping
// per triple; (tenant,client) backs operator-side "who can access this client".
export const clientUsers = mysqlTable(
  "client_users",
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
    clientId: varchar("client_id", { length: 36 })
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("client_users_tenant_user_client_unique").on(
      t.tenantId,
      t.userId,
      t.clientId,
    ),
    index("client_users_tenant_client_idx").on(t.tenantId, t.clientId),
  ],
);
