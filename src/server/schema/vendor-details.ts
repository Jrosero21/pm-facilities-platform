import {
  bigint,
  date,
  numeric,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { entityStatus, rateType, vendorDetailsComplianceStatus, vendorDetailsDocumentType, vendorDetailsRequirementType } from "./enums";
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



// Vendor pricing. trade_id (null = general rate) -> trades RESTRICT;
// vendor_location_id (null = vendor-wide) -> vendor_locations cascade. `unit` is
// meaningful only when rate_type = 'per_unit' (Decision). Resolution precedence
// (most-specific-wins) is a Phase 8 concern — not modeled here.
export const vendorRates = pgTable(
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
    rateType: rateType("rate_type").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    unit: varchar("unit", { length: 32 }),
    effectiveDate: date("effective_date", { mode: "date" }),
    expiryDate: date("expiry_date", { mode: "date" }),
    notes: text("notes"),
    status: entityStatus("status").notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("vendor_rates_tenant_vendor_idx").on(t.tenantId, t.vendorId)],
);

// Vendor documents (insurance certs, W-9s, licenses). file_url/size/mime are
// nullable: file-upload infrastructure is deferred, so a row can be metadata
// only or hold an external URL. expiry_date index deferred until Phase 5 (see
// 02-decisions.md).
export const vendorDocuments = pgTable(
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
    documentType: vendorDetailsDocumentType("document_type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    fileUrl: varchar("file_url", { length: 1024 }),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    fileMimeType: varchar("file_mime_type", { length: 127 }),
    issuedDate: date("issued_date", { mode: "date" }),
    expiryDate: date("expiry_date", { mode: "date" }),
    notes: text("notes"),
    status: entityStatus("status").notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("vendor_documents_tenant_vendor_idx").on(t.tenantId, t.vendorId)],
);

// Vendor compliance requirements (insurance coverage, background checks, etc.).
// `status` (soft-delete) and `compliance_status` (business state) are DISTINCT
// concerns and must not be collapsed (see 06-business-rules.md). expiry_date
// index deferred until Phase 5 (see 02-decisions.md).
export const vendorCompliance = pgTable(
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
    requirementType: vendorDetailsRequirementType("requirement_type").notNull(),
    coverageAmount: numeric("coverage_amount", { precision: 14, scale: 2 }),
    carrier: varchar("carrier", { length: 255 }),
    policyNumber: varchar("policy_number", { length: 128 }),
    effectiveDate: date("effective_date", { mode: "date" }),
    expiryDate: date("expiry_date", { mode: "date" }),
    complianceStatus: vendorDetailsComplianceStatus("compliance_status")
      .notNull()
      .default("pending"),
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
    index("vendor_compliance_tenant_vendor_idx").on(t.tenantId, t.vendorId),
  ],
);

// Vendor performance scores, computed in Phase 9 from Phase 4 job data.
// trade_id (null = overall vendor score) -> trades RESTRICT.
export const vendorPerformanceScores = pgTable(
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
    periodStart: date("period_start", { mode: "date" }),
    periodEnd: date("period_end", { mode: "date" }),
    jobsCompleted: integer("jobs_completed"),
    jobsOnTime: integer("jobs_on_time"),
    // B-16.4 (0054): completion = jobs_completed / total_dispatches (declines+cancels count
    // against). Additive, nullable, backfill-free — beside the on-time pair.
    totalDispatches: integer("total_dispatches"),
    completionRate: numeric("completion_rate", { precision: 5, scale: 2 }),
    onTimeRate: numeric("on_time_rate", { precision: 5, scale: 2 }),
    avgRating: numeric("avg_rating", { precision: 3, scale: 2 }),
    score: numeric("score", { precision: 6, scale: 2 }),
    computedAt: timestamp("computed_at"),
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
    index("vendor_performance_scores_tenant_vendor_idx").on(
      t.tenantId,
      t.vendorId,
    ),
  ],
);
