import {
  boolean,
  numeric,
  foreignKey,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { entityStatus, vendorCoverageAreaType } from "./enums";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { trades } from "./trades";
import { vendors, vendorLocations } from "./vendors";



// Trades a vendor covers. trade_id references the GLOBAL trades table with
// onDelete RESTRICT (a trade covered by any vendor can't be hard-deleted out
// from under it). vendor_location_id is optional: null = the vendor covers this
// trade everywhere; set = scoped to one branch. is_primary marks the vendor's
// single primary trade — one per vendor, enforced in the create path.
export const vendorTradeCoverage = pgTable(
  "vendor_trade_coverage",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vendorId: varchar("vendor_id", { length: 36 })
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    tradeId: varchar("trade_id", { length: 36 })
      .notNull()
      .references(() => trades.id, { onDelete: "restrict" }),
    vendorLocationId: varchar("vendor_location_id", { length: 36 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    status: entityStatus("status").notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    // Explicit short name: the auto-generated FK name would near the 64-char
    // MySQL identifier limit.
    foreignKey({
      columns: [t.vendorLocationId],
      foreignColumns: [vendorLocations.id],
      name: "vtc_location_fk",
    }).onDelete("cascade"),
    // Branch-scoped duplicates blocked here; org-wide (NULL location) duplicates
    // are guarded in the create path, since MySQL treats NULLs as distinct.
    uniqueIndex("vtc_vendor_trade_location_unique").on(
      t.vendorId,
      t.tradeId,
      t.vendorLocationId,
    ),
    // Phase 3 list queries filter on (tenant_id, vendor_id).
    index("vtc_tenant_vendor_idx").on(t.tenantId, t.vendorId),
  ],
);

// Geographic coverage for a vendor. Polymorphic: area_type discriminates which
// value columns are meaningful (validated in the create path — MySQL has no
// conditional NOT NULL). vendor_location_id optional (null = vendor-wide). The
// shape anticipates Phase 5 geographic dispatch; no matching logic lives here.
export const vendorServiceAreas = pgTable(
  "vendor_service_areas",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vendorId: varchar("vendor_id", { length: 36 })
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    vendorLocationId: varchar("vendor_location_id", { length: 36 }),
    areaType: vendorCoverageAreaType("area_type").notNull(),
    areaLabel: varchar("area_label", { length: 120 }),
    // radius only
    centerLatitude: numeric("center_latitude", { precision: 10, scale: 7 }),
    centerLongitude: numeric("center_longitude", { precision: 10, scale: 7 }),
    radiusMiles: numeric("radius_miles", { precision: 6, scale: 2 }),
    // postal_code only
    postalCode: varchar("postal_code", { length: 32 }),
    // city only
    city: varchar("city", { length: 128 }),
    // county only
    countyName: varchar("county_name", { length: 128 }),
    // city / county / state
    stateCode: varchar("state_code", { length: 8 }),
    countryCode: varchar("country_code", { length: 2 }).notNull().default("US"),
    status: entityStatus("status").notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.vendorLocationId],
      foreignColumns: [vendorLocations.id],
      name: "vsa_location_fk",
    }).onDelete("cascade"),
    // Phase 3 list queries filter on (tenant_id, vendor_id).
    index("vsa_tenant_vendor_idx").on(t.tenantId, t.vendorId),
    // Phase 5 dispatch-readiness composites (Decision 2). radius is intentionally
    // left unindexed; spatial indexing is deferred until scale demands it.
    index("vsa_tenant_type_postal_idx").on(t.tenantId, t.areaType, t.postalCode),
    index("vsa_tenant_type_state_idx").on(t.tenantId, t.areaType, t.stateCode),
    index("vsa_tenant_type_city_state_idx").on(
      t.tenantId,
      t.areaType,
      t.city,
      t.stateCode,
    ),
  ],
);
