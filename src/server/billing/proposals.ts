import "server-only";

import { and, asc, eq, or } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { proposalApprovals, proposalLineItems, proposals } from "@/server/schema";
import { recalculateProposalTotals } from "@/server/billing/totals";
import { emitJobBillingEvent } from "@/server/billing/events";
import { assertCommonLineFields, isDecimalStr } from "@/server/billing/money";
import {
  ProposalChainHasLiveRevision,
  ProposalNotDraft,
  ProposalNotSent,
  ProposalNotWithdrawable,
} from "@/server/billing/errors";

// ── Phase 8 batch 8c.5 — PROPOSAL DATA LAYER (#8/#9/#10) ──────────────────────────────
// LOAD-BEARING D-7.3 / R-7.2 ISOLATION: a proposal's scope is the INDEPENDENT scope_snapshot
// text column. Accepting a proposal touches `proposals` + `proposal_approvals` ONLY — it NEVER
// writes the published-scope substrate (the canonical scope-steps table or the job's approved-
// scope text column); the human-gated scope publish writer remains their sole writer. This
// module MUST NOT import the scope-steps table, the jobs data-layer module, or the scope publish
// writer — enforced structurally (no such import here) and asserted at verify time (Group 13: a
// string-match on this file for the forbidden symbol names, which therefore appear NOWHERE here).
//
// Single-live-revision (R-7.1-style, no DB unique): at most one non-terminal revision per chain.
// Totals are writer-owned (recalculateProposalTotals, 8c.2); state transitions emit via
// emitJobBillingEvent (8c.3). Line-CRUD holds the parent FOR UPDATE for edit+recalc (8c.2 contract).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// category union, derived from the table (no extra import).
type ProposalLineCategory = NonNullable<typeof proposalLineItems.$inferInsert["category"]>;

// LIVE = occupies the chain's single live slot (for the single-live-revision invariant). An
// accepted proposal is still live (it can be superseded by a revision — re-quote after accept).
const LIVE_STATUSES = ["draft", "sent", "viewed", "accepted"] as const;
function isLive(status: string): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(status);
}
// WITHDRAWABLE excludes `accepted`: once a client has accepted, the proposal is a commitment —
// you revise (supersede) or issue a change order, you do not withdraw it. (Distinct from LIVE.)
const WITHDRAWABLE_STATUSES = ["draft", "sent", "viewed"] as const;
function isWithdrawable(status: string): boolean {
  return (WITHDRAWABLE_STATUSES as readonly string[]).includes(status);
}

// ── line-item field validation (8c.5+ write-boundary contract; generic Error) ─────────
// The four shared fields (quantity/unit_price/tax_amount/tax_rate) live in billing/money.ts
// (extracted at 8c.7, Option A). markup_percent is AR-only, so its check stays inline here.
function assertValidLineFields(f: Partial<ProposalLineItemInput>): void {
  assertCommonLineFields(f);
  if (f.markupPercent != null && !isDecimalStr(f.markupPercent, 3, 3)) throw new Error("INVALID_LINE_MARKUP_PERCENT");
}

// Lock a proposal row FOR UPDATE; return the fields writers need (status + event fields).
async function lockProposal(tx: Tx, tenantId: string, id: string) {
  const rows = await tx
    .select({
      id: proposals.id, jobId: proposals.jobId, status: proposals.status,
      total: proposals.total, title: proposals.title, currency: proposals.currency,
    })
    .from(proposals)
    .where(and(eq(proposals.tenantId, tenantId), eq(proposals.id, id)))
    .for("update");
  if (!rows[0]) throw new Error("PROPOSAL_NOT_FOUND");
  return rows[0];
}

export type ProposalRow = typeof proposals.$inferSelect;

export type CreateProposalInput = {
  tenantId: string;
  jobId: string;
  title?: string | null;
  scopeSnapshot?: string | null;
  currency?: string;
  validUntil?: Date | null;
  notes?: string | null;
  createdByUserId: string | null;
};

/** Create a draft proposal. No event (draft creation isn't audited — 8c.3 taxonomy). Trusts
 *  jobId ∈ tenantId (the FK guarantees the job exists; the action validates the tenant match). */
export async function createProposal(input: CreateProposalInput): Promise<{ id: string }> {
  const id = uuidv7();
  await db.insert(proposals).values({
    id,
    tenantId: input.tenantId,
    jobId: input.jobId,
    title: input.title ?? null,
    scopeSnapshot: input.scopeSnapshot ?? null,
    currency: input.currency ?? "USD",
    validUntil: input.validUntil ?? null,
    notes: input.notes ?? null,
    createdByUserId: input.createdByUserId,
  });
  return { id };
}

/** Edit a DRAFT proposal's header fields. */
export async function updateProposalDraft(input: {
  tenantId: string; id: string;
  title?: string | null; scopeSnapshot?: string | null; validUntil?: Date | null; notes?: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const p = await lockProposal(tx, input.tenantId, input.id);
    if (p.status !== "draft") throw new ProposalNotDraft(input.id, p.status);
    await tx
      .update(proposals)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.scopeSnapshot !== undefined ? { scopeSnapshot: input.scopeSnapshot } : {}),
        ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      })
      .where(and(eq(proposals.tenantId, input.tenantId), eq(proposals.id, input.id)));
  });
}

export type ProposalLineItemInput = {
  category: ProposalLineCategory;
  description: string;
  quantity: string;
  unit?: string | null;
  unitPrice: string;
  markupPercent?: string | null;
  taxRate?: string | null;
  taxAmount?: string;
};

/** Add a line to a DRAFT proposal (lineNumber auto = max+1 under the parent lock, 10e), then recalc. */
export async function addProposalLineItem(
  input: { tenantId: string; proposalId: string } & ProposalLineItemInput,
): Promise<{ id: string }> {
  assertValidLineFields(input);
  const id = uuidv7();
  await db.transaction(async (tx) => {
    const p = await lockProposal(tx, input.tenantId, input.proposalId);
    if (p.status !== "draft") throw new ProposalNotDraft(input.proposalId, p.status);
    const existing = await tx
      .select({ ln: proposalLineItems.lineNumber })
      .from(proposalLineItems)
      .where(and(eq(proposalLineItems.tenantId, input.tenantId), eq(proposalLineItems.proposalId, input.proposalId)));
    const nextLine = existing.reduce((m, r) => Math.max(m, r.ln), 0) + 1;
    await tx.insert(proposalLineItems).values({
      id,
      tenantId: input.tenantId,
      proposalId: input.proposalId,
      lineNumber: nextLine,
      category: input.category,
      description: input.description,
      quantity: input.quantity,
      unit: input.unit ?? null,
      unitPrice: input.unitPrice,
      markupPercent: input.markupPercent ?? null,
      taxRate: input.taxRate ?? null,
      taxAmount: input.taxAmount ?? "0",
    });
    await recalculateProposalTotals(tx, input.tenantId, input.proposalId);
  });
  return { id };
}

/** Update a DRAFT proposal's line item, then recalc. */
export async function updateProposalLineItem(
  input: { tenantId: string; id: string } & Partial<ProposalLineItemInput>,
): Promise<void> {
  assertValidLineFields(input);
  await db.transaction(async (tx) => {
    const line = (
      await tx
        .select({ proposalId: proposalLineItems.proposalId })
        .from(proposalLineItems)
        .where(and(eq(proposalLineItems.tenantId, input.tenantId), eq(proposalLineItems.id, input.id)))
        .limit(1)
    )[0];
    if (!line) throw new Error("PROPOSAL_LINE_ITEM_NOT_FOUND");
    const p = await lockProposal(tx, input.tenantId, line.proposalId);
    if (p.status !== "draft") throw new ProposalNotDraft(line.proposalId, p.status);
    await tx
      .update(proposalLineItems)
      .set({
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice } : {}),
        ...(input.markupPercent !== undefined ? { markupPercent: input.markupPercent } : {}),
        ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
        ...(input.taxAmount !== undefined ? { taxAmount: input.taxAmount } : {}),
      })
      .where(and(eq(proposalLineItems.tenantId, input.tenantId), eq(proposalLineItems.id, input.id)));
    await recalculateProposalTotals(tx, input.tenantId, line.proposalId);
  });
}

/** Remove a line from a DRAFT proposal, then recalc. */
export async function removeProposalLineItem(input: { tenantId: string; id: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const line = (
      await tx
        .select({ proposalId: proposalLineItems.proposalId })
        .from(proposalLineItems)
        .where(and(eq(proposalLineItems.tenantId, input.tenantId), eq(proposalLineItems.id, input.id)))
        .limit(1)
    )[0];
    if (!line) throw new Error("PROPOSAL_LINE_ITEM_NOT_FOUND");
    const p = await lockProposal(tx, input.tenantId, line.proposalId);
    if (p.status !== "draft") throw new ProposalNotDraft(line.proposalId, p.status);
    await tx
      .delete(proposalLineItems)
      .where(and(eq(proposalLineItems.tenantId, input.tenantId), eq(proposalLineItems.id, input.id)));
    await recalculateProposalTotals(tx, input.tenantId, line.proposalId);
  });
}

/** draft → sent. Emits proposal.sent. */
export async function sendProposal(input: { tenantId: string; id: string; actorUserId: string | null }): Promise<void> {
  await db.transaction(async (tx) => {
    const p = await lockProposal(tx, input.tenantId, input.id);
    if (p.status !== "draft") throw new ProposalNotDraft(input.id, p.status); // 10h: 2nd send → throws
    await tx
      .update(proposals)
      .set({ status: "sent", sentAt: new Date() })
      .where(and(eq(proposals.tenantId, input.tenantId), eq(proposals.id, input.id)));
    await emitJobBillingEvent(tx, {
      tenantId: input.tenantId, jobId: p.jobId, eventType: "proposal.sent",
      actorUserId: input.actorUserId,
      summary: `Proposal sent: ${p.title ?? "(untitled)"} — ${p.total}`,
      amount: p.total, currency: p.currency, proposalId: input.id,
    });
  });
}

/** sent → accepted/declined. Writes proposal_approvals + emits proposal.accepted/declined.
 *  ISOLATION: touches proposals + proposal_approvals ONLY — NEVER the published-scope substrate (D-7.3). */
export async function recordProposalAcceptance(input: {
  tenantId: string; id: string;
  decision: "accepted" | "declined";
  approverUserId?: string | null; approverName?: string | null; decidedAt: Date; notes?: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const p = await lockProposal(tx, input.tenantId, input.id);
    if (p.status !== "sent") throw new ProposalNotSent(input.id, p.status);
    await tx
      .update(proposals)
      .set({ status: input.decision })
      .where(and(eq(proposals.tenantId, input.tenantId), eq(proposals.id, input.id)));
    await tx.insert(proposalApprovals).values({
      tenantId: input.tenantId, proposalId: input.id, decision: input.decision,
      approverUserId: input.approverUserId ?? null, approverName: input.approverName ?? null,
      decidedAt: input.decidedAt, notes: input.notes ?? null,
    });
    await emitJobBillingEvent(tx, {
      tenantId: input.tenantId, jobId: p.jobId,
      eventType: input.decision === "accepted" ? "proposal.accepted" : "proposal.declined",
      actorUserId: input.approverUserId ?? null,
      summary:
        input.decision === "accepted"
          ? `Proposal accepted: ${p.title ?? "(untitled)"} — ${p.total}`
          : `Proposal declined: ${p.title ?? "(untitled)"}`,
      amount: p.total, currency: p.currency, proposalId: input.id,
      metadata: input.approverName ? { approverName: input.approverName } : undefined,
    });
  });
}

/** draft/sent/viewed → withdrawn (NOT accepted — that's a commitment; revise/change-order instead). Emits proposal.withdrawn. */
export async function withdrawProposal(input: { tenantId: string; id: string; actorUserId: string | null }): Promise<void> {
  await db.transaction(async (tx) => {
    const p = await lockProposal(tx, input.tenantId, input.id);
    if (!isWithdrawable(p.status)) throw new ProposalNotWithdrawable(input.id, p.status);
    await tx
      .update(proposals)
      .set({ status: "withdrawn" })
      .where(and(eq(proposals.tenantId, input.tenantId), eq(proposals.id, input.id)));
    await emitJobBillingEvent(tx, {
      tenantId: input.tenantId, jobId: p.jobId, eventType: "proposal.withdrawn",
      actorUserId: input.actorUserId,
      summary: `Proposal withdrawn: ${p.title ?? "(untitled)"}`,
      amount: p.total, currency: p.currency, proposalId: input.id,
    });
  });
}

/** Create a new revision superseding `supersedesProposalId`. New row = draft, parent=root,
 *  copies the prior's header + line items (10c/10d). Single-live-revision enforced by locking
 *  the chain ROOT row (per-chain mutex). 0-live re-open supported (prior terminal → no flip/event). */
export async function createProposalRevision(input: {
  tenantId: string; supersedesProposalId: string; actorUserId: string | null;
}): Promise<{ id: string }> {
  const priorPre = await getProposal(input.tenantId, input.supersedesProposalId);
  if (!priorPre) throw new Error("PROPOSAL_NOT_FOUND");
  const rootId = priorPre.parentProposalId ?? priorPre.id;
  const newId = uuidv7();

  await db.transaction(async (tx) => {
    // Lock the chain ROOT row FOR UPDATE — the per-chain serialization mutex.
    const root = await tx
      .select({ id: proposals.id })
      .from(proposals)
      .where(and(eq(proposals.tenantId, input.tenantId), eq(proposals.id, rootId)))
      .for("update");
    if (!root[0]) throw new Error("PROPOSAL_NOT_FOUND");

    // Chain rows (current, under the root lock).
    const chain = await tx
      .select({ id: proposals.id, status: proposals.status, revisionNumber: proposals.revisionNumber })
      .from(proposals)
      .where(
        and(
          eq(proposals.tenantId, input.tenantId),
          or(eq(proposals.parentProposalId, rootId), eq(proposals.id, rootId)),
        ),
      );
    const live = chain.filter((r) => isLive(r.status));
    // Precondition (item 4): 0 live, OR exactly 1 live that IS the one being superseded.
    const ok = live.length === 0 || (live.length === 1 && live[0].id === input.supersedesProposalId);
    if (!ok) throw new ProposalChainHasLiveRevision(rootId, live.length);
    const newRev = chain.reduce((m, r) => Math.max(m, r.revisionNumber), 0) + 1;

    // Re-read the prior header + lines IN-txn (consistent copy source).
    const prior = (
      await tx
        .select({
          jobId: proposals.jobId, status: proposals.status, total: proposals.total,
          title: proposals.title, scopeSnapshot: proposals.scopeSnapshot, currency: proposals.currency,
          validUntil: proposals.validUntil, notes: proposals.notes,
        })
        .from(proposals)
        .where(and(eq(proposals.tenantId, input.tenantId), eq(proposals.id, input.supersedesProposalId)))
        .limit(1)
    )[0];
    if (!prior) throw new Error("PROPOSAL_NOT_FOUND");

    // New revision (draft) — copy header (10d).
    await tx.insert(proposals).values({
      id: newId, tenantId: input.tenantId, jobId: prior.jobId,
      parentProposalId: rootId, supersedesProposalId: input.supersedesProposalId,
      revisionNumber: newRev, status: "draft",
      title: prior.title, scopeSnapshot: prior.scopeSnapshot, currency: prior.currency,
      validUntil: prior.validUntil, notes: prior.notes, createdByUserId: input.actorUserId,
    });

    // Copy line items (10c) — extended/markup recomputed by recalc.
    const priorLines = await tx
      .select({
        lineNumber: proposalLineItems.lineNumber, category: proposalLineItems.category,
        description: proposalLineItems.description, quantity: proposalLineItems.quantity,
        unit: proposalLineItems.unit, unitPrice: proposalLineItems.unitPrice,
        markupPercent: proposalLineItems.markupPercent, taxRate: proposalLineItems.taxRate,
        taxAmount: proposalLineItems.taxAmount,
      })
      .from(proposalLineItems)
      .where(and(eq(proposalLineItems.tenantId, input.tenantId), eq(proposalLineItems.proposalId, input.supersedesProposalId)));
    if (priorLines.length > 0) {
      await tx.insert(proposalLineItems).values(
        priorLines.map((l) => ({ ...l, id: uuidv7(), tenantId: input.tenantId, proposalId: newId })),
      );
    }
    await recalculateProposalTotals(tx, input.tenantId, newId);

    // Flip the prior to superseded ONLY if it's currently non-terminal (the 1-live case).
    // 0-live re-open: prior already terminal → no flip, no event.
    if (isLive(prior.status)) {
      await tx
        .update(proposals)
        .set({ status: "superseded" })
        .where(and(eq(proposals.tenantId, input.tenantId), eq(proposals.id, input.supersedesProposalId)));
      await emitJobBillingEvent(tx, {
        tenantId: input.tenantId, jobId: prior.jobId, eventType: "proposal.superseded",
        actorUserId: input.actorUserId,
        summary: `Proposal superseded by revision ${newRev}: ${prior.title ?? "(untitled)"}`,
        // prior.total is the frozen total at send-time; immutable once sent (clarification 2).
        amount: prior.total, currency: prior.currency, proposalId: input.supersedesProposalId,
        metadata: { supersededByProposalId: newId, revisionNumber: newRev },
      });
    }
  });
  return { id: newId };
}

export async function getProposal(tenantId: string, id: string): Promise<ProposalRow | null> {
  const rows = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.tenantId, tenantId), eq(proposals.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

/** All proposals for a job, chronological (chain-grouping for display is the 8c.11b UI's job). */
export async function listProposalsForJob(tenantId: string, jobId: string): Promise<ProposalRow[]> {
  return db
    .select()
    .from(proposals)
    .where(and(eq(proposals.tenantId, tenantId), eq(proposals.jobId, jobId)))
    .orderBy(asc(proposals.createdAt), asc(proposals.id));
}

export type ProposalLineItemRow = typeof proposalLineItems.$inferSelect;

/** Line items for a proposal, ordered by line number. Tenant-scoped. Pure read (8c.11b — the
 *  detail screen renders inputs + the writer-owned extended_amount/markup_amount). */
export async function listProposalLineItems(tenantId: string, proposalId: string): Promise<ProposalLineItemRow[]> {
  return db
    .select()
    .from(proposalLineItems)
    .where(and(eq(proposalLineItems.tenantId, tenantId), eq(proposalLineItems.proposalId, proposalId)))
    .orderBy(asc(proposalLineItems.lineNumber));
}
