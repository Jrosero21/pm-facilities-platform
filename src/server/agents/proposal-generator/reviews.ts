import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { auditLogs, proposalDrafts, proposalReviews } from "@/server/schema";
import type { ProposedProposal } from "./drafts";

// ── Phase 27 batch 3b — proposal_reviews data layer ───────────────────────────────────
// The operator's review of a proposal draft (the proposal equivalent of invoice-creator/
// reviews.ts). edited_content (nullable JSON) is the operator's edited proposal — NULL when
// unchanged; the draft's proposed_proposal stays IMMUTABLE. On publish, effective proposal =
// edited_content ?? proposed_proposal. createProposalReview is a 2-row write (review insert +
// draft status advance) → audit INSIDE the txn (R-6.7); parent-before-child lock order
// (R-5.7 / R-6.21): lock the DRAFT (parent), re-check pending_review, then write.
//
// D4 (proposal-specific): the proposal draft is NUMBER-FREE, so the operator's edit is where
// the dollar figures FIRST appear (quantity / unit_price). The edited proposal is the gold
// correction signal — and the only source of pricing the publish path can bill from.

type ProposalReviewRow = typeof proposalReviews.$inferSelect;
export type ProposalReviewDecision = "approve" | "reject";

export type ProposalReview = {
  id: string;
  tenantId: string;
  proposalDraftId: string;
  reviewerUserId: string | null;
  decision: ProposalReviewDecision;
  editedContent: ProposedProposal | null;
  reviewNotes: string | null;
  reviewedAt: Date;
  createdAt: Date;
};

function parseEditedContent(v: unknown): ProposedProposal | null {
  // R-6.19: json() round-trips as a string on MariaDB; parse here. NULL stays null
  // (information-carrying: the operator made no edit).
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as ProposedProposal;
    } catch {
      return null;
    }
  }
  return v as ProposedProposal;
}

function toDomain(row: ProposalReviewRow): ProposalReview {
  return {
    id: row.id,
    tenantId: row.tenantId,
    proposalDraftId: row.proposalDraftId,
    reviewerUserId: row.reviewerUserId,
    decision: row.decision,
    editedContent: parseEditedContent(row.editedContent),
    reviewNotes: row.reviewNotes,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
  };
}

/** One review by id, tenant-scoped. */
export async function getProposalReview(tenantId: string, id: string): Promise<ProposalReview | null> {
  const rows = await db
    .select()
    .from(proposalReviews)
    .where(and(eq(proposalReviews.tenantId, tenantId), eq(proposalReviews.id, id)))
    .limit(1);
  return rows[0] ? toDomain(rows[0]) : null;
}

/** The most recent APPROVE review for a draft (carries edited_content, if any). */
export async function getApproveReviewForProposalDraft(
  tenantId: string,
  proposalDraftId: string,
): Promise<ProposalReview | null> {
  const rows = await db
    .select()
    .from(proposalReviews)
    .where(
      and(
        eq(proposalReviews.tenantId, tenantId),
        eq(proposalReviews.proposalDraftId, proposalDraftId),
        eq(proposalReviews.decision, "approve"),
      ),
    )
    .orderBy(desc(proposalReviews.createdAt))
    .limit(1);
  return rows[0] ? toDomain(rows[0]) : null;
}

/**
 * Record an operator's review of a pending draft and advance it. Two-row write → audit
 * INSIDE the txn (R-6.7). Parent-before-child (R-5.7): lock the DRAFT FOR UPDATE, re-check
 * pending_review (concurrent-review race), insert the review + advance the draft.
 * approve -> 'approved'; reject -> 'rejected'. editedContent (approve only, optional) is the
 * operator's edited proposal; proposed_proposal stays immutable.
 *
 * Throws: DRAFT_NOT_FOUND, DRAFT_NOT_PENDING_REVIEW.
 */
export async function createProposalReview(input: {
  tenantId: string;
  proposalDraftId: string;
  reviewerUserId: string;
  decision: ProposalReviewDecision;
  editedContent?: ProposedProposal | null;
  reviewNotes?: string | null;
}): Promise<ProposalReview> {
  const reviewId = uuidv7();
  const nextDraftStatus = input.decision === "approve" ? "approved" : "rejected";

  await db.transaction(async (tx) => {
    const locked = await tx
      .select({ status: proposalDrafts.status })
      .from(proposalDrafts)
      .where(and(eq(proposalDrafts.tenantId, input.tenantId), eq(proposalDrafts.id, input.proposalDraftId)))
      .for("update");
    if (!locked[0]) throw new Error("DRAFT_NOT_FOUND");
    if (locked[0].status !== "pending_review") throw new Error("DRAFT_NOT_PENDING_REVIEW");

    await tx.insert(proposalReviews).values({
      id: reviewId,
      tenantId: input.tenantId,
      proposalDraftId: input.proposalDraftId,
      reviewerUserId: input.reviewerUserId,
      decision: input.decision,
      editedContent: input.editedContent ?? null,
      reviewNotes: input.reviewNotes ?? null,
      reviewedAt: new Date(),
    });

    await tx
      .update(proposalDrafts)
      .set({ status: nextDraftStatus })
      .where(eq(proposalDrafts.id, input.proposalDraftId));

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.reviewerUserId,
      action: `proposal_draft.${nextDraftStatus}`,
      targetType: "proposal_draft",
      targetId: input.proposalDraftId,
      metadata: { decision: input.decision, reviewId, edited: input.editedContent != null },
    });
  });

  const row = await getProposalReview(input.tenantId, reviewId);
  if (!row) throw new Error("Proposal review insert succeeded but row could not be reloaded.");
  return row;
}
