import {
  boolean,
  timestamp,
  numeric,
  foreignKey,
  index,
  integer,
  pgTable,
  varchar,
} from "drizzle-orm/pg-core";
import { clientInvoiceStatus, paymentStatus, rateType } from "./enums";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { jobs } from "./jobs";
import { clients } from "./clients";
import { trades } from "./trades";
import { arMarkupColumns, baseLineItemColumns } from "./billing-shared";

// ── Phase 8 batch 8b (migration 0021) — CLIENT INVOICES / AR (#3/#6/#14) ─────────────
// Accounts-receivable: what we issue to the client (outgoing). NO source_type (OQ-4 —
// aggregator-authored). status is the ISSUANCE lifecycle (draft/sent/void); payment_status
// is DERIVED by the payment-recording writer (#16). markup_total + line markup are
// INTERNAL-ONLY (OQ-6) — the Phase-11 client portal renders the marked-up total, never the
// cost+markup split. payment_terms_days is a SNAPSHOT copied from client_billing_rules at
// creation (#6 discipline). Totals owned by recalculateClientInvoiceTotals (8c, R-7.2).
// Issuing a client invoice (status → sent) is ACCOUNTING-gated/ENFORCED (issued_by_user_id;
// #20, OQ-23) — the platform's first enforced role gate (action layer, 8c).



export const clientInvoices = pgTable(
  "client_invoices",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    clientId: varchar("client_id", { length: 36 }).notNull(),
    invoiceNumber: varchar("invoice_number", { length: 128 }),
    sequenceNumber: integer("sequence_number"),
    isFinal: boolean("is_final").notNull().default(false),
    status: clientInvoiceStatus("status").notNull().default("draft"),
    paymentStatus: paymentStatus("payment_status")
      .notNull()
      .default("unpaid"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    markupTotal: numeric("markup_total", { precision: 12, scale: 2 }).notNull().default("0"),
    taxTotal: numeric("tax_total", { precision: 14, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    paymentTermsDays: integer("payment_terms_days"),
    issuedAt: timestamp("issued_at"),
    dueAt: timestamp("due_at"),
    issuedByUserId: varchar("issued_by_user_id", { length: 36 }),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "cinv_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.jobId], foreignColumns: [jobs.id], name: "cinv_job_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.clientId], foreignColumns: [clients.id], name: "cinv_client_fk" }).onDelete("restrict"),
    foreignKey({ columns: [t.issuedByUserId], foreignColumns: [users.id], name: "cinv_issued_by_fk" }).onDelete("set null"),
    foreignKey({ columns: [t.createdByUserId], foreignColumns: [users.id], name: "cinv_created_by_fk" }).onDelete("set null"),
    index("cinv_tenant_job_idx").on(t.tenantId, t.jobId),
    index("cinv_tenant_client_idx").on(t.tenantId, t.clientId),
    index("cinv_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

// Base + AR-markup (8b-D4); markup columns INTERNAL-ONLY (OQ-6). Totals writer-owned.
// Phase (ii) billing-from-rates (0050) — labor-rate PROVENANCE (AR-only). trade_id/rate_type
// record which client_rates row a labor line's unit_price was resolved from; both NULLABLE
// (materials/operator-authored lines carry neither). NOT on vendor (AP) lines — cost side.
export const clientInvoiceLineItems = pgTable(
  "client_invoice_line_items",
  {
    ...baseLineItemColumns(),
    ...arMarkupColumns(),
    tradeId: varchar("trade_id", { length: 36 }),
    rateType: rateType("rate_type"),
    clientInvoiceId: varchar("client_invoice_id", { length: 36 }).notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "cili_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.clientInvoiceId], foreignColumns: [clientInvoices.id], name: "cili_invoice_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.tradeId], foreignColumns: [trades.id], name: "cili_trade_fk" }).onDelete("restrict"),
    index("cili_tenant_invoice_idx").on(t.tenantId, t.clientInvoiceId),
  ],
);
