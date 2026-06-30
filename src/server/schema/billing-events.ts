import {
  numeric,
  foreignKey,
  index,
  json,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { jobs } from "./jobs";
import { proposals } from "./proposals";
import { changeOrders } from "./change-orders";
import { vendorInvoices } from "./vendor-invoices";
import { clientInvoices } from "./client-invoices";
import { paymentRecords } from "./payments";

// ── Phase 8 batch 8b (migration 0023) — JOB BILLING EVENTS (#17) ─────────────────────
// The FINANCIAL audit timeline — a SEPARATE substrate from job_events (per §9), because
// billing events carry typed money + record refs the generic operational timeline does not.
// Mirrors job_events (event_type varchar(64) dot-namespaced, APPEND-ONLY — no updated_at).
// Written ONLY via emitJobBillingEvent (8c) — the single shape/taxonomy enforcement boundary
// (R-7.2 analog); distributed callers, one helper. NO double-write: billing events live
// only here; the job detail UI MERGES the operational + financial timelines for display
// (OQ-19). Taxonomy: proposal.*, change_order.*, vendor_invoice.*, client_invoice.*,
// payment.recorded, nte.exceeded (#18), nte.overridden (#23 A6).
//
// The five record FKs are nullable + SET NULL on delete (audit survives record retirement).
// amount/currency nullable (not every event carries a figure). metadata json parsed at read
// (R-6.19).

export const jobBillingEvents = pgTable(
  "job_billing_events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    actorUserId: varchar("actor_user_id", { length: 36 }),
    summary: varchar("summary", { length: 500 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 3 }),
    proposalId: varchar("proposal_id", { length: 36 }),
    changeOrderId: varchar("change_order_id", { length: 36 }),
    vendorInvoiceId: varchar("vendor_invoice_id", { length: 36 }),
    clientInvoiceId: varchar("client_invoice_id", { length: 36 }),
    paymentId: varchar("payment_id", { length: 36 }),
    metadata: json("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "jbe_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.jobId], foreignColumns: [jobs.id], name: "jbe_job_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.actorUserId], foreignColumns: [users.id], name: "jbe_actor_fk" }).onDelete("set null"),
    foreignKey({ columns: [t.proposalId], foreignColumns: [proposals.id], name: "jbe_proposal_fk" }).onDelete("set null"),
    foreignKey({ columns: [t.changeOrderId], foreignColumns: [changeOrders.id], name: "jbe_co_fk" }).onDelete("set null"),
    foreignKey({ columns: [t.vendorInvoiceId], foreignColumns: [vendorInvoices.id], name: "jbe_vendor_invoice_fk" }).onDelete("set null"),
    foreignKey({ columns: [t.clientInvoiceId], foreignColumns: [clientInvoices.id], name: "jbe_client_invoice_fk" }).onDelete("set null"),
    foreignKey({ columns: [t.paymentId], foreignColumns: [paymentRecords.id], name: "jbe_payment_fk" }).onDelete("set null"),
    index("jbe_job_created_idx").on(t.jobId, t.createdAt),
    index("jbe_tenant_job_idx").on(t.tenantId, t.jobId),
    index("jbe_tenant_type_idx").on(t.tenantId, t.eventType),
  ],
);
