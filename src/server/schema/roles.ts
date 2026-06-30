import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { mysqlEnum } from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";

export const roles = pgTable("roles", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  key: varchar("key", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 128 }).notNull(),
  scope: mysqlEnum("scope", ["global", "tenant"]).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const userRoles = pgTable(
  "user_roles",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: varchar("role_id", { length: 36 })
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id, {
      onDelete: "cascade",
    }),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
    grantedByUserId: varchar("granted_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
  },
  (t) => [
    uniqueIndex("user_roles_user_role_tenant_unique").on(
      t.userId,
      t.roleId,
      t.tenantId,
    ),
    index("user_roles_user_idx").on(t.userId),
    index("user_roles_tenant_idx").on(t.tenantId),
  ],
);
