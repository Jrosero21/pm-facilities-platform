import {
  boolean,
  timestamp,
  numeric,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  varchar,
} from "drizzle-orm/pg-core";
import { paymentStatus, vendorInvoiceSourceType, vendorInvoiceStatus } from "./enums";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { jobs } from "./jobs";
import { vendors } from "./vendors";
import { jobVendorAssignments } from "./dispatch-assignments";
import { baseLineItemColumns } from "./billing-shared";

// ── Phase 8 batch 8b (migration 0020) — VENDOR INVOICES / AP (#3/#5/#14/#18) ─────────
// Accounts-payable: what a vendor sent us (incoming). source_type mirrors jobs.source_type
// (§2.1) — only `manual` wired in Phase 8; `email_ingestion` is the Phase-13 placeholder
// (#5). source_external_id has NO uniqueness (D-4.13). assignment_id (nullable) ties the
// invoice to a specific dispatch so the NTE check can read its agreed_nte_amount (#18).
//
// NO markup (AP, #6). Totals (subtotal/tax_total/total) owned by recalculateVendorInvoiceTotals
// (8c), which ALSO sets exceeds_nte + nte_baseline_amount after totals, same txn (#18). The
// AP control point is OPERATOR approval (approved_by_user_id) — operator validates the
// agreed amount; accounting approves PAYMENT, not the invoice (#20, OQ-24). payment_status
// is DERIVED by the payment-recording writer (#16), never hand-set.




export const vendorInvoices = pgTable(
  "vendor_invoices",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    vendorId: varchar("vendor_id", { length: 36 }).notNull(),
    assignmentId: varchar("assignment_id", { length: 36 }),
    sourceType: vendorInvoiceSourceType("source_type")
      .notNull()
      .default("manual"),
    sourceExternalId: varchar("source_external_id", { length: 255 }),
    invoiceNumber: varchar("invoice_number", { length: 128 }),
    sequenceNumber: integer("sequence_number"),
    isFinal: boolean("is_final").notNull().default(false),
    status: vendorInvoiceStatus("status").notNull().default("received"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    taxTotal: numeric("tax_total", { precision: 14, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    nteBaselineAmount: numeric("nte_baseline_amount", { precision: 12, scale: 2 }),
    exceedsNte: boolean("exceeds_nte").notNull().default(false),
    paymentStatus: paymentStatus("payment_status")
      .notNull()
      .default("unpaid"),
    invoiceDate: timestamp("invoice_date"),
    approvedByUserId: varchar("approved_by_user_id", { length: 36 }),
    approvedAt: timestamp("approved_at"),
    notes: text("notes"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "vinv_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.jobId], foreignColumns: [jobs.id], name: "vinv_job_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.vendorId], foreignColumns: [vendors.id], name: "vinv_vendor_fk" }).onDelete("restrict"),
    foreignKey({ columns: [t.assignmentId], foreignColumns: [jobVendorAssignments.id], name: "vinv_assignment_fk" }).onDelete("set null"),
    foreignKey({ columns: [t.approvedByUserId], foreignColumns: [users.id], name: "vinv_approved_by_fk" }).onDelete("set null"),
    foreignKey({ columns: [t.createdByUserId], foreignColumns: [users.id], name: "vinv_created_by_fk" }).onDelete("set null"),
    index("vinv_tenant_job_idx").on(t.tenantId, t.jobId),
    index("vinv_tenant_vendor_idx").on(t.tenantId, t.vendorId),
    index("vinv_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

// Base shape ONLY — NO markup (AP, #6/8b-D4). extended_amount writer-owned.
export const vendorInvoiceLineItems = pgTable(
  "vendor_invoice_line_items",
  {
    ...baseLineItemColumns(),
    vendorInvoiceId: varchar("vendor_invoice_id", { length: 36 }).notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "vili_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.vendorInvoiceId], foreignColumns: [vendorInvoices.id], name: "vili_invoice_fk" }).onDelete("cascade"),
    index("vili_tenant_invoice_idx").on(t.tenantId, t.vendorInvoiceId),
  ],
);
