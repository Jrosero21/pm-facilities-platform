import {
  timestamp,
  numeric,
  foreignKey,
  index,
  pgTable,
  text,
  varchar,
} from "drizzle-orm/pg-core";
import { ioDirection } from "./enums";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { jobs } from "./jobs";
import { clientInvoices } from "./client-invoices";
import { vendorInvoices } from "./vendor-invoices";

// ── Phase 8 batch 8b (migration 0022) — PAYMENT RECORDS (#16) ────────────────────────
// ONE table, uniform shape, `direction` discriminator (the opposite call from invoices,
// and consistently so — payments are uniform; invoice lifecycles diverge). inbound =
// client→aggregator (sets client_invoice_id); outbound = aggregator→vendor (sets
// vendor_invoice_id). The XOR invariant (exactly one invoice FK set, matching direction) is
// a DATA-LAYER guarantee (D-7.7, 8c) — both FK columns are nullable here. One-payment-one-
// invoice; partial payments allowed (record the amount); the invoice's payment_status is
// DERIVED by this writer from Σ payments. Cross-invoice allocation deferred (OQ-17).
//
// job_id is DENORMALIZED NN, WRITER-DERIVED from the invoice at creation (8b-D5) — the
// payment-recording writer reads job_id off the resolved invoice and writes the copy; it
// NEVER accepts job_id as a caller parameter (would open a divergence path). For the job
// billing section + job_billing_events linkage. recorded_by_user_id = ACCOUNTING (ENFORCED,
// #20) — the ledger control point. Manual ledger entry only; NO processor integration (OQ-18).


export const paymentRecords = pgTable(
  "payment_records",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    direction: ioDirection("direction").notNull(),
    clientInvoiceId: varchar("client_invoice_id", { length: 36 }),
    vendorInvoiceId: varchar("vendor_invoice_id", { length: 36 }),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    method: varchar("method", { length: 64 }),
    reference: varchar("reference", { length: 255 }),
    paidAt: timestamp("paid_at").notNull(),
    recordedByUserId: varchar("recorded_by_user_id", { length: 36 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "pay_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.clientInvoiceId], foreignColumns: [clientInvoices.id], name: "pay_client_invoice_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.vendorInvoiceId], foreignColumns: [vendorInvoices.id], name: "pay_vendor_invoice_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.jobId], foreignColumns: [jobs.id], name: "pay_job_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.recordedByUserId], foreignColumns: [users.id], name: "pay_recorded_by_fk" }).onDelete("set null"),
    index("pay_tenant_job_idx").on(t.tenantId, t.jobId),
    index("pay_client_invoice_idx").on(t.clientInvoiceId),
    index("pay_vendor_invoice_idx").on(t.vendorInvoiceId),
    index("pay_tenant_direction_idx").on(t.tenantId, t.direction),
  ],
);
