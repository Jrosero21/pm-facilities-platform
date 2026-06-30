import {
  index,
  pgTable,
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
