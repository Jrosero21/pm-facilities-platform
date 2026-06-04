import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { agentDecisions, proposalDrafts } from "@/server/schema";
import { writeAuditLog } from "@/server/audit";
import { lineItemCategoryEnum } from "@/server/schema/billing-shared";

// ── Phase 27 batch 3b — proposal_drafts data layer ────────────────────────────────────
// The proposal generator's draft I/O — the proposal equivalent of invoice-creator/drafts.ts.
// The agent writes ONLY here, at status='pending_review' (§2.9 / R-6.15); it has NO path to
// proposals / proposal_line_items — that is the human-gated publish action (publish.ts).
// proposed_proposal is IMMUTABLE (the "what the AI produced" audit); operator edits — INCLUDING
// the first appearance of any dollar figure — live on proposal_reviews.edited_content.
//
// MONEY-SAFETY (D1): the LLM never emits a number. proposed_proposal carries category +
// description + scopePhrasing ONLY. The per-line quantity / unit_price / markup are absent on the
// AI draft and are AUTHORED BY THE OPERATOR at the gate (edits.ts), then resolved by publish.ts.
// This layer just persists the structured object.
//
// NOTE FOR BATCH 4 (correction signal): because this draft is number-free, the operator ALWAYS
// adds pricing at the gate → proposal_reviews.edited_content is never null on a valid publish.
// proposalCorrectionPairs therefore needs a different positive/gold signal than the invoice
// agent's null-means-approved-as-is (see edits.ts note). Flag only — not solved this batch.

export type ProposalLineCategory = (typeof lineItemCategoryEnum)[number];

// One proposed proposal line. category + description + scopePhrasing are the LLM's number-free
// output. The numeric fields are OPTIONAL and ABSENT on the AI draft — they appear only on the
// operator-edited content (proposal_reviews.edited_content) and are validated there (edits.ts).
export type ProposedProposalLine = {
  category: ProposalLineCategory;
  description: string;
  scopePhrasing: string;
  // Operator-authored at the review gate (D4) — NOT present on the number-free AI draft.
  quantity?: string;
  unit?: string | null;
  unitPrice?: string;
  markupPercent?: string | null;
  taxRate?: string | null;
  taxAmount?: string;
};

// The structured draft. No lumpFlag (no vendor source to keep whole — unlike invoices).
export type ProposedProposal = {
  lineItems: ProposedProposalLine[];
  notes?: string;
};

type ProposalDraftRow = typeof proposalDrafts.$inferSelect;
export type ProposalDraftStatus = ProposalDraftRow["status"];

// The domain row, with proposed_proposal PARSED. proposed_proposal is a JSON (longtext) column;
// MariaDB/mysql2 returns it as a STRING and Drizzle does not parse on read — parse at the
// boundary (R-6.19) so consumers get a real ProposedProposal, not a string.
export type ProposalDraft = {
  id: string;
  tenantId: string;
  jobId: string;
  agentRunId: string;
  proposedProposal: ProposedProposal;
  status: ProposalDraftStatus;
  publishedProposalId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const EMPTY_PROPOSAL: ProposedProposal = { lineItems: [] };

function parseProposedProposal(v: unknown): ProposedProposal {
  // R-6.19: json() round-trips as a string on MariaDB; parse here.
  let parsed: unknown = v;
  if (typeof v === "string") {
    try {
      parsed = JSON.parse(v);
    } catch {
      return EMPTY_PROPOSAL;
    }
  }
  const obj = (parsed as ProposedProposal | null) ?? EMPTY_PROPOSAL;
  return Array.isArray(obj.lineItems) ? obj : EMPTY_PROPOSAL;
}

function toDomain(row: ProposalDraftRow): ProposalDraft {
  return {
    id: row.id,
    tenantId: row.tenantId,
    jobId: row.jobId,
    agentRunId: row.agentRunId,
    proposedProposal: parseProposedProposal(row.proposedProposal),
    status: row.status,
    publishedProposalId: row.publishedProposalId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** One draft by id, tenant-scoped (proposed_proposal parsed). */
export async function getProposalDraft(tenantId: string, id: string): Promise<ProposalDraft | null> {
  const rows = await db
    .select()
    .from(proposalDrafts)
    .where(and(eq(proposalDrafts.tenantId, tenantId), eq(proposalDrafts.id, id)))
    .limit(1);
  return rows[0] ? toDomain(rows[0]) : null;
}

/** Drafts for a job, newest first. */
export async function listProposalDraftsForJob(tenantId: string, jobId: string): Promise<ProposalDraft[]> {
  const rows = await db
    .select()
    .from(proposalDrafts)
    .where(and(eq(proposalDrafts.tenantId, tenantId), eq(proposalDrafts.jobId, jobId)))
    .orderBy(desc(proposalDrafts.createdAt));
  return rows.map(toDomain);
}

/**
 * Create a proposal draft at status='pending_review' — the agent's ONLY write
 * (createProposalDraftTool). proposed_proposal is stored as JSON (a raw JS object — Drizzle
 * serializes on write). NOT audited to audit_logs (the agent's write is captured in
 * agent_tool_calls; audit_logs records the HUMAN actions — R-6.12). Single-row insert.
 */
export async function createProposalDraft(input: {
  tenantId: string;
  jobId: string;
  agentRunId: string;
  proposedProposal: ProposedProposal;
}): Promise<ProposalDraft> {
  const id = uuidv7();
  await db.insert(proposalDrafts).values({
    id,
    tenantId: input.tenantId,
    jobId: input.jobId,
    agentRunId: input.agentRunId,
    proposedProposal: input.proposedProposal,
    status: "pending_review",
  });
  const row = await getProposalDraft(input.tenantId, id);
  if (!row) throw new Error("Proposal draft insert succeeded but row could not be reloaded.");
  return row;
}

/**
 * Discard a draft (operator dismissal — no review row, unlike reject). Allowed from
 * pending_review OR approved (mirrors discardInvoiceDraft): a stranded APPROVED draft that
 * can't be published needs a disposal path. Terminal states (rejected/discarded/published)
 * are not discardable. Single-row update + writeAuditLog OUTSIDE (R-6.7).
 *
 * Throws: DRAFT_NOT_FOUND, DRAFT_NOT_DISCARDABLE.
 */
export async function discardProposalDraft(tenantId: string, id: string, actorUserId: string): Promise<void> {
  const draft = await getProposalDraft(tenantId, id);
  if (!draft) throw new Error("DRAFT_NOT_FOUND");
  if (draft.status !== "pending_review" && draft.status !== "approved") throw new Error("DRAFT_NOT_DISCARDABLE");

  await db
    .update(proposalDrafts)
    .set({ status: "discarded" })
    .where(and(eq(proposalDrafts.tenantId, tenantId), eq(proposalDrafts.id, id)));

  await writeAuditLog({
    tenantId,
    userId: actorUserId,
    action: "proposal_draft.discarded",
    targetType: "proposal_draft",
    targetId: id,
    metadata: { jobId: draft.jobId },
  });
}

// R-6.19: agent_decisions.metadata is json (longtext on MariaDB) — parse at the boundary,
// then extract the lineCount the proposal_generation decision recorded.
function parseDecisionMeta(v: unknown): { lineCount: number | null } {
  let parsed: unknown = v;
  if (typeof v === "string") {
    try {
      parsed = JSON.parse(v);
    } catch {
      return { lineCount: null };
    }
  }
  const m = (parsed as { lineCount?: unknown } | null) ?? null;
  return { lineCount: typeof m?.lineCount === "number" ? m.lineCount : null };
}

// A draft joined to its proposal_generation decision (confidence / rationale / lineCount) for the
// review UI (Batch 5) — the proposal analog of listInvoiceDraftsForJobDetailed. The decision lives
// on agent_decisions via the shared agent_run_id. Newest first.
export type ProposalDraftDetailed = ProposalDraft & {
  confidence: string | null;
  rationale: string | null;
  lineCount: number | null;
};

export async function listProposalDraftsForJobDetailed(
  tenantId: string,
  jobId: string,
): Promise<ProposalDraftDetailed[]> {
  const rows = await db
    .select({
      id: proposalDrafts.id,
      tenantId: proposalDrafts.tenantId,
      jobId: proposalDrafts.jobId,
      agentRunId: proposalDrafts.agentRunId,
      proposedProposal: proposalDrafts.proposedProposal,
      status: proposalDrafts.status,
      publishedProposalId: proposalDrafts.publishedProposalId,
      createdAt: proposalDrafts.createdAt,
      updatedAt: proposalDrafts.updatedAt,
      confidence: agentDecisions.confidence,
      rationale: agentDecisions.reasoning,
      decisionMetadata: agentDecisions.metadata,
    })
    .from(proposalDrafts)
    .leftJoin(
      agentDecisions,
      and(
        eq(agentDecisions.agentRunId, proposalDrafts.agentRunId),
        eq(agentDecisions.decisionType, "proposal_generation"),
      ),
    )
    .where(and(eq(proposalDrafts.tenantId, tenantId), eq(proposalDrafts.jobId, jobId)))
    .orderBy(desc(proposalDrafts.createdAt));

  return rows.map((r) => {
    const meta = parseDecisionMeta(r.decisionMetadata);
    return {
      id: r.id,
      tenantId: r.tenantId,
      jobId: r.jobId,
      agentRunId: r.agentRunId,
      proposedProposal: parseProposedProposal(r.proposedProposal),
      status: r.status,
      publishedProposalId: r.publishedProposalId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      confidence: r.confidence,
      rationale: r.rationale,
      lineCount: meta.lineCount,
    };
  });
}
