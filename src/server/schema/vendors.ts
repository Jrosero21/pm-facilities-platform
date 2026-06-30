import {
  boolean,
  numeric,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { entityStatus, vendorsVendorType } from "./enums";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";



// Vendor (subcontractor) organization. Mirrors the clients table shape.
// vendor_type spans the local → national range called for in Phase 3; multi-
// location/national vendors carry one row per branch in vendor_locations.
export const vendors = pgTable(
  "vendors",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    // Legal entity name when it differs from the operating/DBA name.
    legalName: varchar("legal_name", { length: 255 }),
    vendorCode: varchar("vendor_code", { length: 64 }),
    vendorType: vendorsVendorType("vendor_type")
      .notNull()
      .default("local"),
    status: entityStatus("status").notNull().default("active"),
    mainPhone: varchar("main_phone", { length: 32 }),
    mainEmail: varchar("main_email", { length: 255 }),
    website: varchar("website", { length: 255 }),
    // Tax id / EIN. Free-form; not validated in Phase 3.
    taxId: varchar("tax_id", { length: 64 }),
    notes: text("notes"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    // Vendor name is intentionally NOT unique per tenant (unlike client name):
    // real-world vendor name collisions are legitimate (e.g. two unrelated
    // "ABC Plumbing" in different cities). vendor_code is the optional canonical
    // disambiguator — unique per tenant *when present* (MySQL treats NULLs as
    // distinct, so many code-less vendors are allowed). The non-unique
    // (tenant_id, name) index supports sorted listing.
    index("vendors_tenant_name_idx").on(t.tenantId, t.name),
    uniqueIndex("vendors_tenant_code_unique").on(t.tenantId, t.vendorCode),
    index("vendors_tenant_idx").on(t.tenantId),
    index("vendors_status_idx").on(t.status),
    index("vendors_type_idx").on(t.vendorType),
  ],
);

// Contacts attached at the vendor (organization) level. Mirrors client_contacts.
export const vendorContacts = pgTable(
  "vendor_contacts",
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
    name: varchar("name", { length: 255 }).notNull(),
    title: varchar("title", { length: 128 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 32 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    status: entityStatus("status").notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("vendor_contacts_tenant_idx").on(t.tenantId),
    index("vendor_contacts_vendor_idx").on(t.vendorId),
  ],
);

// Vendor branch/location. Mirrors client_locations: tenant_id is denormalized
// from the parent vendor (location.tenant_id must equal vendor.tenant_id).
// lat/lng reuse the numeric(10,7) precision used on client_locations and feed
// radius service-area centers in Phase 3d / dispatch in Phase 5.
export const vendorLocations = pgTable(
  "vendor_locations",
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
    name: varchar("name", { length: 255 }).notNull(),
    locationCode: varchar("location_code", { length: 64 }),
    status: entityStatus("status").notNull().default("active"),
    addressLine1: varchar("address_line1", { length: 255 }).notNull(),
    addressLine2: varchar("address_line2", { length: 255 }),
    city: varchar("city", { length: 128 }).notNull(),
    stateProvince: varchar("state_province", { length: 128 }).notNull(),
    postalCode: varchar("postal_code", { length: 32 }).notNull(),
    country: varchar("country", { length: 2 }).notNull().default("US"),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    // location_code unique within a vendor when present.
    uniqueIndex("vendor_locations_vendor_code_unique").on(
      t.vendorId,
      t.locationCode,
    ),
    index("vendor_locations_tenant_idx").on(t.tenantId),
    index("vendor_locations_vendor_idx").on(t.vendorId),
    index("vendor_locations_status_idx").on(t.status),
  ],
);

// Vendor↔user linkage (Phase 10 Fork 1). Maps an auth user to a vendor org
// within an aggregator tenant, scoping vendor-portal visibility. MANY-TO-MANY:
// one user may serve several vendor orgs; one vendor org has several staff
// users. A vendor user ALSO holds a tenant_users membership in the aggregator
// tenant + a vendor_user role grant; this table adds the vendor-scope on top
// (10b §1 Fork 1). All three FKs cascade — the mapping is meaningless without
// its tenant, user, and vendor (mirrors tenant_users' all-cascade precedent).
// updated_at kept per 10b lock (entity-style flexibility). Indexes: the unique
// (tenant,user,vendor) enforces one mapping per triple; (tenant,vendor) backs
// operator-side "who staffs this vendor" reads.
export const vendorUsers = pgTable(
  "vendor_users",
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
    vendorId: varchar("vendor_id", { length: 36 })
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("vendor_users_tenant_user_vendor_unique").on(
      t.tenantId,
      t.userId,
      t.vendorId,
    ),
    index("vendor_users_tenant_vendor_idx").on(t.tenantId, t.vendorId),
  ],
);
