import {
  foreignKey,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { entityStatus } from "./enums";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { clients, clientLocations } from "./clients";
import { trades } from "./trades";
import { vendors } from "./vendors";



// Phase 22 (0045) — deterministic-routing data model. Two net-new tables that
// LAYER ON TOP of the Phase-5 eligibility floor (findCandidateVendorsForJobByFacets);
// they do not replace it. No existing table is altered.

// location_preferred_vendors — "this location's preferred vendor for this trade"
// (D-22.1). Per-location-per-trade, RANKED: priority orders the picker's fallback
// (lower = stronger; 1 = primary). Preference is an ORDERING within the eligibility
// candidate set, never a bypass — the matcher filters first, preference only sorts
// survivors. Ties on priority are intentionally allowed (no unique on priority) and
// broken downstream by the existing ranker (primary-trade → tightest-geo → name).
// trade_id references the GLOBAL trades table with onDelete RESTRICT; vendor_id
// RESTRICT (a referenced vendor can't be hard-deleted, matching
// job_vendor_assignments). Client-level default fallback is deferred (CF-22.2).
export const locationPreferredVendors = pgTable(
  "location_preferred_vendors",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientLocationId: varchar("client_location_id", { length: 36 }).notNull(),
    tradeId: varchar("trade_id", { length: 36 })
      .notNull()
      .references(() => trades.id, { onDelete: "restrict" }),
    vendorId: varchar("vendor_id", { length: 36 })
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    // lower = stronger preference (1 = primary). Non-unique: ties broken downstream.
    priority: integer("priority").notNull(),
    notes: varchar("notes", { length: 500 }),
    status: entityStatus("status").notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    // Explicit short name: the auto-generated FK name would exceed MySQL's
    // 64-char identifier limit.
    foreignKey({
      columns: [t.clientLocationId],
      foreignColumns: [clientLocations.id],
      name: "lpv_location_fk",
    }).onDelete("cascade"),
    // A vendor can't be listed twice for the same location + trade.
    uniqueIndex("lpv_location_trade_vendor_unique").on(
      t.clientLocationId,
      t.tradeId,
      t.vendorId,
    ),
    // The matcher's preference-rank lookup path.
    index("lpv_lookup_idx").on(t.tenantId, t.clientLocationId, t.tradeId),
  ],
);

// location_blocked_vendors — the per-location vendor blocklist (D-22.2). A COMPANY
// exclusion, never trade-specific: "don't use this subcontractor here for ANYTHING"
// (no trade_id by design — trade-specific blocking is a confirmed non-need). Scope is
// nullable-location: client_id is the always-set anchor; client_location_id NULL = a
// client-wide ban cascading to all the client's locations, set = this-location-only.
// Wired into the matcher as a NOT EXISTS floor predicate (EXCLUSION-BEFORE-PREFERENCE)
// so a blocklisted vendor never reaches preference ordering — a preferred-but-blocked
// vendor is still excluded. vendor_id RESTRICT (matches job_vendor_assignments);
// created_by_user_id + created_at are the who/when audit of who barred the vendor.
export const locationBlockedVendors = pgTable(
  "location_blocked_vendors",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Always set — the scoping anchor.
    clientId: varchar("client_id", { length: 36 })
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    // NULL = client-wide ban (all the client's locations); set = this-location-only.
    clientLocationId: varchar("client_location_id", { length: 36 }),
    vendorId: varchar("vendor_id", { length: 36 })
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    reason: varchar("reason", { length: 500 }),
    status: entityStatus("status").notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    // Explicit short name: the auto-generated FK name would exceed MySQL's
    // 64-char identifier limit.
    foreignKey({
      columns: [t.clientLocationId],
      foreignColumns: [clientLocations.id],
      name: "lbv_location_fk",
    }).onDelete("cascade"),
    // The matcher's per-location and client-wide blocklist lookup paths.
    index("lbv_location_vendor_idx").on(
      t.tenantId,
      t.clientLocationId,
      t.vendorId,
    ),
    index("lbv_client_vendor_idx").on(t.tenantId, t.clientId, t.vendorId),
  ],
);
