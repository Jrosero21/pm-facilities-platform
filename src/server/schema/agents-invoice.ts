import {
  datetime,
  foreignKey,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";
import { users } from "./auth";
import { jobs } from "./jobs";
import { clients } from "./clients";
import { agentRuns } from "./agents-substrate";
import { vendorInvoices } from "./vendor-invoices";
import { clientInvoices } from "./client-invoices";

// ── Phase 26 batch 1a — INVOICE-CREATOR I/O ───────────────────────────────────────────
// The invoice_creator_v1 draft→review substrate. SPECIALIZED, not shared — the generic
// cross-agent layer is the agent substrate (agent_runs/_tool_calls/_decisions, reused via
// the agent_run_id FK below — NOT duplicated). This file is the invoice equivalent of
// scope-generation.ts; its enum / FK / index shapes deliberately MIRROR job_scope_drafts /
// job_scope_reviews (settled D-6.16: one specialized draft+review pair per agent).
//
// The agent reads a SUBMITTED vendor invoice on a FINISHED job and drafts the CLIENT-FACING,
// marked-up client invoice. AI writes the line-item PHRASING (descriptions) ONLY; the dollar
// amounts originate from the vendor invoice and the markup MATH comes from the fixed client
// billing rules (client_billing_rules.markup_percent → billing/totals.ts), NEVER the LLM.
//
// Draft = JSON working memory; published = the canonical relational record. The agent writes
// ONLY invoice_drafts at pending_review (§2.9 / R-6.15); the only writer of client_invoices /
// client_invoice_line_items is the human-gated publish action (a later batch). Schema only
// this batch — no data layer, no agent, no UI.

// invoice_drafts.status MIRRORS job_scope_drafts.status 1:1 (OQ #4).
const draftStatusEnum = ["pending_review", "approved", "rejected", "discarded", "published"] as const;
const reviewDecisionEnum = ["approve", "reject"] as const;

// invoice_drafts — one row per generation attempt. proposed_invoice is the AI's structured
// client-invoice draft (JSON, IMMUTABLE — the "what the AI produced" audit; parse at read per
// R-6.19). Shape: { lineItems: [{ category, description, quantity, unit, unitPrice,
// markupPercent, reconcilesToVendorLineId? }], lumpFlag?, notes? } — descriptions are LLM
// phrasing; the money fields originate from the vendor invoice, not the LLM. published_at is
// implicit via status='published'; published_client_invoice_id is the provenance link to the
// canonical AR record on publish (analog of update_rewrite_drafts.published_communication_id).
// Index set mirrors jsd_* (tenant_job / tenant_status / run) PLUS a vendor_invoice lookup (the
// AP source this draft marks up).
export const invoiceDrafts = mysqlTable(
  "invoice_drafts",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    agentRunId: varchar("agent_run_id", { length: 36 }).notNull(),
    vendorInvoiceId: varchar("vendor_invoice_id", { length: 36 }).notNull(),
    clientId: varchar("client_id", { length: 36 }).notNull(),
    proposedInvoice: json("proposed_invoice").notNull(),
    status: mysqlEnum("status", draftStatusEnum).notNull().default("pending_review"),
    publishedClientInvoiceId: varchar("published_client_invoice_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "invd_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.jobId], foreignColumns: [jobs.id], name: "invd_job_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.agentRunId], foreignColumns: [agentRuns.id], name: "invd_run_fk" }).onDelete("cascade"),
    // client_id / vendor_invoice_id are RESTRICT (not cascade) — matching the billing-table
    // convention (vendor_invoices.vendor_id, client_invoices.client_id) and preserving the
    // audit trail: a draft must not silently vanish when an upstream client / vendor-invoice
    // row is deleted; restrict forces explicit handling. tenant/job/agent_run stay cascade
    // (the scope-generation.ts agent-substrate precedent).
    foreignKey({ columns: [t.vendorInvoiceId], foreignColumns: [vendorInvoices.id], name: "invd_vendor_inv_fk" }).onDelete("restrict"),
    foreignKey({ columns: [t.clientId], foreignColumns: [clients.id], name: "invd_client_fk" }).onDelete("restrict"),
    foreignKey({ columns: [t.publishedClientInvoiceId], foreignColumns: [clientInvoices.id], name: "invd_pub_client_inv_fk" }).onDelete("set null"),
    index("invd_tenant_job_idx").on(t.tenantId, t.jobId),
    index("invd_tenant_status_idx").on(t.tenantId, t.status),
    index("invd_run_idx").on(t.agentRunId),
    index("invd_vendor_inv_idx").on(t.vendorInvoiceId),
  ],
);

// invoice_reviews — the operator's review of a draft (mirrors job_scope_reviews).
// edited_content (JSON, NULL when unchanged — carries "the operator changed something");
// proposed_invoice on the draft stays immutable. Effective published invoice = edited_content
// ?? proposed_invoice. NULL edited_content = approved-as-is — the signal Phase-24 approve-as-is
// and the Phase-25 positive/gold split both read. Append-only (created_at + reviewed_at).
export const invoiceReviews = mysqlTable(
  "invoice_reviews",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    draftId: varchar("draft_id", { length: 36 }).notNull(),
    reviewerUserId: varchar("reviewer_user_id", { length: 36 }),
    decision: mysqlEnum("decision", reviewDecisionEnum).notNull(),
    editedContent: json("edited_content"),
    reviewNotes: text("review_notes"),
    reviewedAt: datetime("reviewed_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "invr_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.draftId], foreignColumns: [invoiceDrafts.id], name: "invr_draft_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.reviewerUserId], foreignColumns: [users.id], name: "invr_reviewer_fk" }).onDelete("set null"),
    index("invr_draft_idx").on(t.draftId),
  ],
);
