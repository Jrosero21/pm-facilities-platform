import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { mysqlEnum } from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";

const statusEnum = ["active", "inactive", "archived"] as const;

// Dispatch assignment statuses. GLOBAL (no tenant_id) — mirrors job_statuses
// exactly (D-4.1): the platform reasons about the dispatch lifecycle
// semantically (sendDispatch's state machine, the matcher, analytics), so the
// status set is canonical and shared, not tenant business semantics.
//
// `category` groups statuses into operational buckets where they behave
// identically — declined and cancelled BOTH fall in the `cancelled` category
// (Phase 5 lock (a)) while remaining distinct codes (decline-rate is computable
// from the code itself). `is_terminal` marks end states; `sort_order` drives
// display order.
//
// Resolved by code in createDispatch via getDispatchAssignmentStatusByCode
// (mirrors getJobStatusByCode); the unique `code` index is that lookup's key.
// Index/FK names use the short `das_`/operational prefixes shared across the
// dispatch module (several dispatch tables overrun MySQL's 64-char identifier
// limit with Drizzle's auto-generated names, so the module standardises on
// short explicit names — see check-migration-identifiers.mjs).
export const dispatchAssignmentStatuses = pgTable(
  "dispatch_assignment_statuses",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: varchar("name", { length: 128 }).notNull(),
    // Operator-facing meaning of this status (tooltip / picker subtext / banner).
    // Nullable; reference-table pattern (D-4.1).
    description: varchar("description", { length: 255 }),
    code: varchar("code", { length: 32 }).notNull(),
    category: mysqlEnum("category", [
      "draft",
      "pending",
      "active",
      "completed",
      "cancelled",
    ]).notNull(),
    sortOrder: integer("sort_order").notNull(),
    isTerminal: boolean("is_terminal").notNull().default(false),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    // Globally unique — no tenant dimension (mirrors job_statuses / trades).
    uniqueIndex("das_code_unique").on(t.code),
    uniqueIndex("das_name_unique").on(t.name),
    index("das_status_idx").on(t.status),
  ],
);
