import {
  bigint,
  date,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { trades } from "./trades";
import { vendors, vendorLocations } from "./vendors";

// Schema-only vendor tables for future consumers. No data layer / actions / UI
// in Phase 3 (mirrors how Phase 2 shipped client_location_hours et al.). Domain
// columns are a reasonable first cut; the consuming phase refines.
//   vendor_rates              -> Phase 8 billing
//   vendor_documents          -> file-upload infra phase (TBD)
//   vendor_compliance         -> Phase 5 dispatch eligibility
//   vendor_performance_scores -> Phase 9 analytics (computed from Phase 4 jobs)

const statusEnum = ["active", "inactive", "archived"] as const;

// Vendor pricing. trade_id (null = general rate) -> trades RESTRICT;
// vendor_location_id (null = vendor-wide) -> vendor_locations cascade. `unit` is
// meaningful only when rate_type = 'per_unit' (Decision). Resolution precedence
// (most-specific-wins) is a Phase 8 concern — not modeled here.
export const vendorRates = mysqlTable(
  "vendor_rates",
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
    tradeId: varchar("trade_id", { length: 36 }).references(() => trades.id, {
      onDelete: "restrict",
    }),
    vendorLocationId: varchar("vendor_location_id", { length: 36 }).references(
      () => vendorLocations.id,
      { onDelete: "cascade" },
    ),
    rateType: mysqlEnum("rate_type", [
      "hourly",
      "flat",
      "trip_charge",
      "per_unit",
      "emergency",
      "after_hours",
    ]).notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    unit: varchar("unit", { length: 32 }),
    effectiveDate: date("effective_date"),
    expiryDate: date("expiry_date"),
    notes: text("notes"),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("vendor_rates_tenant_vendor_idx").on(t.tenantId, t.vendorId)],
);

// Vendor documents (insurance certs, W-9s, licenses). file_url/size/mime are
// nullable: file-upload infrastructure is deferred, so a row can be metadata
// only or hold an external URL. expiry_date index deferred until Phase 5 (see
// 02-decisions.md).
export const vendorDocuments = mysqlTable(
  "vendor_documents",
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
    vendorLocationId: varchar("vendor_location_id", { length: 36 }).references(
      () => vendorLocations.id,
      { onDelete: "cascade" },
    ),
    documentType: mysqlEnum("document_type", [
      "insurance",
      "w9",
      "license",
      "certification",
      "agreement",
      "other",
    ]).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    fileUrl: varchar("file_url", { length: 1024 }),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    fileMimeType: varchar("file_mime_type", { length: 127 }),
    issuedDate: date("issued_date"),
    expiryDate: date("expiry_date"),
    notes: text("notes"),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("vendor_documents_tenant_vendor_idx").on(t.tenantId, t.vendorId)],
);

// Vendor compliance requirements (insurance coverage, background checks, etc.).
// `status` (soft-delete) and `compliance_status` (business state) are DISTINCT
// concerns and must not be collapsed (see 06-business-rules.md). expiry_date
// index deferred until Phase 5 (see 02-decisions.md).
export const vendorCompliance = mysqlTable(
  "vendor_compliance",
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
    requirementType: mysqlEnum("requirement_type", [
      "general_liability",
      "workers_comp",
      "auto_liability",
      "umbrella",
      "background_check",
      "license",
      "certification",
      "other",
    ]).notNull(),
    coverageAmount: decimal("coverage_amount", { precision: 14, scale: 2 }),
    carrier: varchar("carrier", { length: 255 }),
    policyNumber: varchar("policy_number", { length: 128 }),
    effectiveDate: date("effective_date"),
    expiryDate: date("expiry_date"),
    complianceStatus: mysqlEnum("compliance_status", [
      "pending",
      "compliant",
      "non_compliant",
      "expired",
    ])
      .notNull()
      .default("pending"),
    notes: text("notes"),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index("vendor_compliance_tenant_vendor_idx").on(t.tenantId, t.vendorId),
  ],
);

// Vendor performance scores, computed in Phase 9 from Phase 4 job data.
// trade_id (null = overall vendor score) -> trades RESTRICT.
export const vendorPerformanceScores = mysqlTable(
  "vendor_performance_scores",
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
    tradeId: varchar("trade_id", { length: 36 }).references(() => trades.id, {
      onDelete: "restrict",
    }),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    jobsCompleted: int("jobs_completed"),
    jobsOnTime: int("jobs_on_time"),
    onTimeRate: decimal("on_time_rate", { precision: 5, scale: 2 }),
    avgRating: decimal("avg_rating", { precision: 3, scale: 2 }),
    score: decimal("score", { precision: 6, scale: 2 }),
    computedAt: timestamp("computed_at"),
    notes: text("notes"),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index("vendor_performance_scores_tenant_vendor_idx").on(
      t.tenantId,
      t.vendorId,
    ),
  ],
);
