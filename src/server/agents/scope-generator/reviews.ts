import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { auditLogs, jobScopeDrafts, jobScopeReviews } from "@/server/schema";
import type { ScopeStep } from "./drafts";

// ── Phase 7 batch 7c — job_scope_reviews data layer ───────────────────────────────────
// The operator's review of a scope draft (the scope equivalent of agents/reviews.ts).
// edited_steps (nullable JSON) is the operator's edited list — NULL when unchanged (carries
// "the operator changed something"); the draft's proposed_steps stays IMMUTABLE. On publish,
// effective steps = edited_steps ?? proposed_steps. createScopeReview is a 2-row write
// (review insert + draft status advance) → audit INSIDE the txn (R-6.7); parent-before-child
// lock order (R-5.7 / R-6.21): lock the DRAFT (parent), re-check pending_review, then write.

type JobScopeReviewRow = typeof jobScopeReviews.$inferSelect;
export type ScopeReviewDecision = "approve" | "reject";

export type ScopeReview = {
  id: string;
  tenantId: string;
  draftId: string;
  reviewerUserId: string | null;
  decision: ScopeReviewDecision;
  editedSteps: ScopeStep[] | null;
  reviewNotes: string | null;
  reviewedAt: Date;
  createdAt: Date;
};

function parseEditedSteps(v: unknown): ScopeStep[] | null {
  // R-6.19: json() round-trips as a string on MariaDB; parse here. NULL stays null
  // (information-carrying: the operator made no edit).
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as ScopeStep[];
    } catch {
      return null;
    }
  }
  return v as ScopeStep[];
}

function toDomain(row: JobScopeReviewRow): ScopeReview {
  return {
    id: row.id,
    tenantId: row.tenantId,
    draftId: row.draftId,
    reviewerUserId: row.reviewerUserId,
    decision: row.decision,
    editedSteps: parseEditedSteps(row.editedSteps),
    reviewNotes: row.reviewNotes,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
  };
}

/** One review by id, tenant-scoped. */
export async function getScopeReview(tenantId: string, id: string): Promise<ScopeReview | null> {
  const rows = await db
    .select()
    .from(jobScopeReviews)
    .where(and(eq(jobScopeReviews.tenantId, tenantId), eq(jobScopeReviews.id, id)))
    .limit(1);
  return rows[0] ? toDomain(rows[0]) : null;
}

/** The most recent APPROVE review for a draft (carries edited_steps, if any). */
export async function getApproveReviewForScopeDraft(
  tenantId: string,
  draftId: string,
): Promise<ScopeReview | null> {
  const rows = await db
    .select()
    .from(jobScopeReviews)
    .where(
      and(
        eq(jobScopeReviews.tenantId, tenantId),
        eq(jobScopeReviews.draftId, draftId),
        eq(jobScopeReviews.decision, "approve"),
      ),
    )
    .orderBy(desc(jobScopeReviews.createdAt))
    .limit(1);
  return rows[0] ? toDomain(rows[0]) : null;
}

/**
 * Record an operator's review of a pending draft and advance it. Two-row write → audit
 * INSIDE the txn (R-6.7). Parent-before-child (R-5.7): lock the DRAFT FOR UPDATE, re-check
 * pending_review (concurrent-review race), insert the review + advance the draft.
 * approve -> 'approved'; reject -> 'rejected'. editedSteps (approve only, optional) is the
 * operator's edit; proposed_steps stays immutable.
 *
 * Throws: DRAFT_NOT_FOUND, DRAFT_NOT_PENDING_REVIEW.
 */
export async function createScopeReview(input: {
  tenantId: string;
  draftId: string;
  reviewerUserId: string;
  decision: ScopeReviewDecision;
  editedSteps?: ScopeStep[] | null;
  reviewNotes?: string | null;
}): Promise<ScopeReview> {
  const reviewId = uuidv7();
  const nextDraftStatus = input.decision === "approve" ? "approved" : "rejected";

  await db.transaction(async (tx) => {
    const locked = await tx
      .select({ status: jobScopeDrafts.status })
      .from(jobScopeDrafts)
      .where(and(eq(jobScopeDrafts.tenantId, input.tenantId), eq(jobScopeDrafts.id, input.draftId)))
      .for("update");
    if (!locked[0]) throw new Error("DRAFT_NOT_FOUND");
    if (locked[0].status !== "pending_review") throw new Error("DRAFT_NOT_PENDING_REVIEW");

    await tx.insert(jobScopeReviews).values({
      id: reviewId,
      tenantId: input.tenantId,
      draftId: input.draftId,
      reviewerUserId: input.reviewerUserId,
      decision: input.decision,
      editedSteps: input.editedSteps ?? null,
      reviewNotes: input.reviewNotes ?? null,
      reviewedAt: new Date(),
    });

    await tx
      .update(jobScopeDrafts)
      .set({ status: nextDraftStatus })
      .where(eq(jobScopeDrafts.id, input.draftId));

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.reviewerUserId,
      action: `scope_draft.${nextDraftStatus}`,
      targetType: "job_scope_draft",
      targetId: input.draftId,
      metadata: { decision: input.decision, reviewId, edited: input.editedSteps != null },
    });
  });

  const row = await getScopeReview(input.tenantId, reviewId);
  if (!row) throw new Error("Scope review insert succeeded but row could not be reloaded.");
  return row;
}
