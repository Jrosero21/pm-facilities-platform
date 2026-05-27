import {
  boolean,
  datetime,
  decimal,
  foreignKey,
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
import { jobs } from "./jobs";
import { clients } from "./clients";
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
const clientInvoiceStatusEnum = ["draft", "sent", "void"] as const;
const paymentStatusEnum = ["unpaid", "partially_paid", "paid"] as const;

export const clientInvoices = mysqlTable(
  "client_invoices",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    clientId: varchar("client_id", { length: 36 }).notNull(),
    invoiceNumber: varchar("invoice_number", { length: 128 }),
    sequenceNumber: int("sequence_number"),
    isFinal: boolean("is_final").notNull().default(false),
    status: mysqlEnum("status", clientInvoiceStatusEnum).notNull().default("draft"),
    paymentStatus: mysqlEnum("payment_status", paymentStatusEnum)
      .notNull()
      .default("unpaid"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    markupTotal: decimal("markup_total", { precision: 12, scale: 2 }).notNull().default("0"),
    taxTotal: decimal("tax_total", { precision: 14, scale: 2 }).notNull().default("0"),
    total: decimal("total", { precision: 12, scale: 2 }).notNull().default("0"),
    paymentTermsDays: int("payment_terms_days"),
    issuedAt: datetime("issued_at"),
    dueAt: datetime("due_at"),
    issuedByUserId: varchar("issued_by_user_id", { length: 36 }),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
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
export const clientInvoiceLineItems = mysqlTable(
  "client_invoice_line_items",
  {
    ...baseLineItemColumns(),
    ...arMarkupColumns(),
    clientInvoiceId: varchar("client_invoice_id", { length: 36 }).notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "cili_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.clientInvoiceId], foreignColumns: [clientInvoices.id], name: "cili_invoice_fk" }).onDelete("cascade"),
    index("cili_tenant_invoice_idx").on(t.tenantId, t.clientInvoiceId),
  ],
);
