import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { agentDecisions, invoiceDrafts } from "@/server/schema";
import { writeAuditLog } from "@/server/audit";
import type { ClientInvoiceLineItemInput } from "@/server/billing/client-invoices";
import type { RateType } from "@/server/billing/client-rates";

// ── Phase 26 batch 2b-i — invoice_drafts data layer ───────────────────────────────────
// The invoice creator's draft I/O — the invoice equivalent of scope-generator/drafts.ts. The
// agent writes ONLY here, at status='pending_review' (§2.9 / R-6.15); it has NO path to
// client_invoices / client_invoice_line_items — that is the human-gated publish action
// (2b-ii). proposed_invoice is IMMUTABLE (the "what the AI produced" audit); operator edits
// live on invoice_reviews.edited_content.
//
// MONEY-SAFETY (D1): the LLM never emits a number. proposed_invoice's per-line quantity /
// unit_price / markup_percent are JOINED IN by runInvoiceCreator from the vendor invoice +
// markup rules (the LLM supplies only category + description + reconciliation). This layer
// just persists the structured object.

// The client-invoice line category — REUSED from the billing layer (do not redefine).
type ClientInvoiceLineCategory = ClientInvoiceLineItemInput["category"];

// One proposed client-invoice line. description is the LLM phrasing; the dollar fields are
// copied from the source vendor line (cost basis) — never produced by the LLM (D1).
// markup_percent is display-only here (D2: resolved from client_billing_rules for preview;
// publish re-resolves fresh in 2b-ii).
export type ProposedInvoiceLine = {
  category: ClientInvoiceLineCategory;
  description: string;
  quantity: string;
  unit?: string | null;
  unitPrice: string;
  markupPercent?: string | null;
  reconcilesToVendorLineId?: string | null;
  // Phase (ii) Unit 2b — rate_sheet labor provenance + read-time seed (mirrors ProposedProposalLine).
  // On a rate_sheet ITEMIZED labor/trip line the agent bills the AGREED RATE (unit_price = rate,
  // markup_percent null) DECOUPLED from vendor cost and stamps tradeId/rateType; suggestedUnitPrice
  // carries the same rate so the review editor (batch 2) can show an "agreed rate" chip. All three are
  // ABSENT on cost_plus/flat lines and on rate_sheet materials/other (untouched this batch).
  tradeId?: string | null;
  rateType?: RateType;
  suggestedUnitPrice?: string;
};

// The structured draft. lumpFlag (D3): the vendor invoice was a single lumped / non-itemized
// line, kept whole at the vendor amount — NEVER split into invented sub-numbers.
export type ProposedInvoice = {
  lineItems: ProposedInvoiceLine[];
  lumpFlag?: boolean;
  notes?: string;
};

type InvoiceDraftRow = typeof invoiceDrafts.$inferSelect;
export type InvoiceDraftStatus = InvoiceDraftRow["status"];

// The domain row, with proposed_invoice PARSED. proposed_invoice is a JSON (longtext) column;
// MariaDB/mysql2 returns it as a STRING and Drizzle does not parse on read — parse at the
// boundary (R-6.19) so consumers get a real ProposedInvoice, not a string.
export type InvoiceDraft = {
  id: string;
  tenantId: string;
  jobId: string;
  agentRunId: string;
  vendorInvoiceId: string;
  clientId: string;
  proposedInvoice: ProposedInvoice;
  status: InvoiceDraftStatus;
  publishedClientInvoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const EMPTY_INVOICE: ProposedInvoice = { lineItems: [] };

function parseProposedInvoice(v: unknown): ProposedInvoice {
  // R-6.19: json() round-trips as a string on MariaDB; parse here.
  let parsed: unknown = v;
  if (typeof v === "string") {
    try {
      parsed = JSON.parse(v);
    } catch {
      return EMPTY_INVOICE;
    }
  }
  const obj = (parsed as ProposedInvoice | null) ?? EMPTY_INVOICE;
  return Array.isArray(obj.lineItems) ? obj : EMPTY_INVOICE;
}

function toDomain(row: InvoiceDraftRow): InvoiceDraft {
  return {
    id: row.id,
    tenantId: row.tenantId,
    jobId: row.jobId,
    agentRunId: row.agentRunId,
    vendorInvoiceId: row.vendorInvoiceId,
    clientId: row.clientId,
    proposedInvoice: parseProposedInvoice(row.proposedInvoice),
    status: row.status,
    publishedClientInvoiceId: row.publishedClientInvoiceId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** One draft by id, tenant-scoped (proposed_invoice parsed). */
export async function getInvoiceDraft(tenantId: string, id: string): Promise<InvoiceDraft | null> {
  const rows = await db
    .select()
    .from(invoiceDrafts)
    .where(and(eq(invoiceDrafts.tenantId, tenantId), eq(invoiceDrafts.id, id)))
    .limit(1);
  return rows[0] ? toDomain(rows[0]) : null;
}

/** Drafts for a job, newest first. */
export async function listInvoiceDraftsForJob(tenantId: string, jobId: string): Promise<InvoiceDraft[]> {
  const rows = await db
    .select()
    .from(invoiceDrafts)
    .where(and(eq(invoiceDrafts.tenantId, tenantId), eq(invoiceDrafts.jobId, jobId)))
    .orderBy(desc(invoiceDrafts.createdAt));
  return rows.map(toDomain);
}

/**
 * Create an invoice draft at status='pending_review' — the agent's ONLY write
 * (createInvoiceDraftTool). proposed_invoice is stored as JSON (a raw JS object — Drizzle
 * serializes on write). NOT audited to audit_logs (the agent's write is captured in
 * agent_tool_calls; audit_logs records the HUMAN actions — R-6.12). Single-row insert.
 */
export async function createInvoiceDraft(input: {
  tenantId: string;
  jobId: string;
  agentRunId: string;
  vendorInvoiceId: string;
  clientId: string;
  proposedInvoice: ProposedInvoice;
}): Promise<InvoiceDraft> {
  const id = uuidv7();
  await db.insert(invoiceDrafts).values({
    id,
    tenantId: input.tenantId,
    jobId: input.jobId,
    agentRunId: input.agentRunId,
    vendorInvoiceId: input.vendorInvoiceId,
    clientId: input.clientId,
    proposedInvoice: input.proposedInvoice,
    status: "pending_review",
  });
  const row = await getInvoiceDraft(input.tenantId, id);
  if (!row) throw new Error("Invoice draft insert succeeded but row could not be reloaded.");
  return row;
}

/**
 * Discard a draft (operator dismissal — no review row, unlike reject). Allowed from
 * pending_review OR approved (mirrors discardScopeDraft / D-7.h): a stranded APPROVED draft
 * that can't be published needs a disposal path. Terminal states (rejected/discarded/
 * published) are not discardable. Single-row update + writeAuditLog OUTSIDE (R-6.7).
 *
 * Throws: DRAFT_NOT_FOUND, DRAFT_NOT_DISCARDABLE.
 */
export async function discardInvoiceDraft(tenantId: string, id: string, actorUserId: string): Promise<void> {
  const draft = await getInvoiceDraft(tenantId, id);
  if (!draft) throw new Error("DRAFT_NOT_FOUND");
  if (draft.status !== "pending_review" && draft.status !== "approved") throw new Error("DRAFT_NOT_DISCARDABLE");

  await db
    .update(invoiceDrafts)
    .set({ status: "discarded" })
    .where(and(eq(invoiceDrafts.tenantId, tenantId), eq(invoiceDrafts.id, id)));

  await writeAuditLog({
    tenantId,
    userId: actorUserId,
    action: "invoice_draft.discarded",
    targetType: "invoice_draft",
    targetId: id,
    metadata: { jobId: draft.jobId },
  });
}

// R-6.19: agent_decisions.metadata is json (longtext on MariaDB) — parse at the boundary,
// then extract the lumpFlag / lineCount the invoice_proposal decision recorded.
function parseDecisionMeta(v: unknown): { lumpFlag: boolean; lineCount: number | null } {
  let parsed: unknown = v;
  if (typeof v === "string") {
    try {
      parsed = JSON.parse(v);
    } catch {
      return { lumpFlag: false, lineCount: null };
    }
  }
  const m = (parsed as { lumpFlag?: unknown; lineCount?: unknown } | null) ?? null;
  return {
    lumpFlag: m?.lumpFlag === true,
    lineCount: typeof m?.lineCount === "number" ? m.lineCount : null,
  };
}

// A draft joined to its invoice_proposal decision (confidence / rationale / lumpFlag /
// lineCount) for the review UI — the invoice analog of listScopeDraftsForJobDetailed. The
// decision lives on agent_decisions via the shared agent_run_id. Newest first.
export type InvoiceDraftDetailed = InvoiceDraft & {
  confidence: string | null;
  rationale: string | null;
  lumpFlag: boolean;
  lineCount: number | null;
};

export async function listInvoiceDraftsForJobDetailed(
  tenantId: string,
  jobId: string,
): Promise<InvoiceDraftDetailed[]> {
  const rows = await db
    .select({
      id: invoiceDrafts.id,
      tenantId: invoiceDrafts.tenantId,
      jobId: invoiceDrafts.jobId,
      agentRunId: invoiceDrafts.agentRunId,
      vendorInvoiceId: invoiceDrafts.vendorInvoiceId,
      clientId: invoiceDrafts.clientId,
      proposedInvoice: invoiceDrafts.proposedInvoice,
      status: invoiceDrafts.status,
      publishedClientInvoiceId: invoiceDrafts.publishedClientInvoiceId,
      createdAt: invoiceDrafts.createdAt,
      updatedAt: invoiceDrafts.updatedAt,
      confidence: agentDecisions.confidence,
      rationale: agentDecisions.reasoning,
      decisionMetadata: agentDecisions.metadata,
    })
    .from(invoiceDrafts)
    .leftJoin(
      agentDecisions,
      and(
        eq(agentDecisions.agentRunId, invoiceDrafts.agentRunId),
        eq(agentDecisions.decisionType, "invoice_proposal"),
      ),
    )
    .where(and(eq(invoiceDrafts.tenantId, tenantId), eq(invoiceDrafts.jobId, jobId)))
    .orderBy(desc(invoiceDrafts.createdAt));

  return rows.map((r) => {
    const meta = parseDecisionMeta(r.decisionMetadata);
    return {
      id: r.id,
      tenantId: r.tenantId,
      jobId: r.jobId,
      agentRunId: r.agentRunId,
      vendorInvoiceId: r.vendorInvoiceId,
      clientId: r.clientId,
      proposedInvoice: parseProposedInvoice(r.proposedInvoice),
      status: r.status,
      publishedClientInvoiceId: r.publishedClientInvoiceId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      confidence: r.confidence,
      rationale: r.rationale,
      lumpFlag: meta.lumpFlag,
      lineCount: meta.lineCount,
    };
  });
}
