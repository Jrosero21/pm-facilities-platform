import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";

const statusEnum = ["active", "inactive", "archived"] as const;

// Job-workflow reference tables (D-4.1). The global-vs-tenant split follows a
// principle: GLOBAL = data the platform's own code reasons about semantically
// (trades for capability matching; job_statuses for state machines / dispatch /
// analytics); TENANT-SCOPED = data that encodes a tenant's business semantics
// the platform does not itself reason about (priorities).
//   • priorities   → TENANT-SCOPED (the exception that inverts D-3.1's global model)
//   • job_statuses → GLOBAL (follows D-3.1, mirrors `trades` exactly)
// See 02-decisions.md D-4.1.

// Priority levels. `rank` is severity/sort (lower = more urgent).
export const priorities = mysqlTable(
  "priorities",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    // Operator-facing intent of this row — surfaced as tooltip / picker subtext /
    // status banner without hardcoding copy in the frontend. Nullable so future
    // rows aren't blocked on copy at migration time. Pattern for all reference
    // tables going forward (D-4.1).
    description: varchar("description", { length: 255 }),
    // Short canonical code, stored uppercased (e.g. "EMERGENCY"). Stable join key
    // for external_priority_mappings (Phase 12) and seeds.
    code: varchar("code", { length: 32 }).notNull(),
    rank: int("rank").notNull(),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    // Unique per tenant (not global) — each tenant owns its priority set.
    uniqueIndex("priorities_tenant_code_unique").on(t.tenantId, t.code),
    uniqueIndex("priorities_tenant_name_unique").on(t.tenantId, t.name),
    index("priorities_tenant_idx").on(t.tenantId),
    index("priorities_status_idx").on(t.status),
  ],
);

// Job statuses. GLOBAL (no tenant_id) — mirrors the `trades` model: the platform
// reasons about statuses semantically (state machines, dispatch, analytics), so
// they are canonical and shared. `category` groups statuses into lifecycle
// buckets; `is_terminal` marks end states; `sort_order` drives display order.
export const jobStatuses = mysqlTable(
  "job_statuses",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: varchar("name", { length: 128 }).notNull(),
    // Operator-facing meaning of this status in the workflow (tooltip / picker
    // subtext / status banner). Nullable; reference-table pattern (D-4.1).
    description: varchar("description", { length: 255 }),
    code: varchar("code", { length: 32 }).notNull(),
    category: mysqlEnum("category", [
      "open",
      "in_progress",
      "on_hold",
      "completed",
      "cancelled",
    ]).notNull(),
    sortOrder: int("sort_order").notNull(),
    isTerminal: boolean("is_terminal").notNull().default(false),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    // Globally unique — no tenant dimension (like trades).
    uniqueIndex("job_statuses_code_unique").on(t.code),
    uniqueIndex("job_statuses_name_unique").on(t.name),
    index("job_statuses_status_idx").on(t.status),
  ],
);
