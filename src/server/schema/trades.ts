import {
  index,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";

// GLOBAL, platform-wide reference table — a DELIBERATE EXCEPTION to the
// "tenant_id on every table" standing rule. Trades are canonical reference data
// shared across all tenants so that external_trade_mappings (roadmap §12) stays
// a 2-D matrix (external_system × trade) instead of 3-D (× tenant). Maintained
// by super_admin and seeded from db/seeds/trades.ts; retired via the status
// enum, never hard-deleted. No tenant_id, no FK to tenants, no created_by user
// (it is not operator-created data).
export const trades = mysqlTable(
  "trades",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: varchar("name", { length: 128 }).notNull(),
    // Short canonical code, stored uppercased (e.g. "PLUMB"). Stable join key
    // for external_trade_mappings and seeds.
    code: varchar("code", { length: 32 }).notNull(),
    status: mysqlEnum("status", ["active", "inactive", "archived"])
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    // Globally unique — no tenant dimension.
    uniqueIndex("trades_name_unique").on(t.name),
    uniqueIndex("trades_code_unique").on(t.code),
    index("trades_status_idx").on(t.status),
  ],
);
