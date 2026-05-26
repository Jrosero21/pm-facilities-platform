import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { auditLogs, updateRewriteDrafts, updateRewriteReviews } from "@/server/schema";

export type UpdateRewriteReviewRow = typeof updateRewriteReviews.$inferSelect;
export type ReviewDecision = "approve" | "reject";

/** One review by id, tenant-scoped. */
export async function getReview(tenantId: string, id: string): Promise<UpdateRewriteReviewRow | null> {
  const rows = await db
    .select()
    .from(updateRewriteReviews)
    .where(and(eq(updateRewriteReviews.tenantId, tenantId), eq(updateRewriteReviews.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

/** Reviews for a draft, newest first. */
export async function listReviewsForDraft(tenantId: string, draftId: string): Promise<UpdateRewriteReviewRow[]> {
  return db
    .select()
    .from(updateRewriteReviews)
    .where(and(eq(updateRewriteReviews.tenantId, tenantId), eq(updateRewriteReviews.draftId, draftId)))
    .orderBy(desc(updateRewriteReviews.createdAt));
}

/** The most recent APPROVE review for a draft (carries edited_content, if any). */
export async function getApproveReviewForDraft(
  tenantId: string,
  draftId: string,
): Promise<UpdateRewriteReviewRow | null> {
  const rows = await db
    .select()
    .from(updateRewriteReviews)
    .where(
      and(
        eq(updateRewriteReviews.tenantId, tenantId),
        eq(updateRewriteReviews.draftId, draftId),
        eq(updateRewriteReviews.decision, "approve"),
      ),
    )
    .orderBy(desc(updateRewriteReviews.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Record an operator's review of a pending draft and advance the draft. Two-row write
 * (review insert + draft status update) → audit INSIDE the txn (R-4.5, by row-count).
 * Parent-before-child lock order (R-5.7): lock the DRAFT (parent) FOR UPDATE, re-check
 * it's still pending_review, then insert the review (child) + advance the draft.
 * approve → draft 'approved'; reject → draft 'rejected'. `editedContent` (approve only,
 * optional) is the operator's edit; the draft's draft_content stays IMMUTABLE.
 *
 * Throws: DRAFT_NOT_FOUND, DRAFT_NOT_PENDING_REVIEW.
 */
export async function createReview(input: {
  tenantId: string;
  draftId: string;
  reviewerUserId: string;
  decision: ReviewDecision;
  editedContent?: string | null;
  reviewNotes?: string | null;
}): Promise<UpdateRewriteReviewRow> {
  const reviewId = uuidv7();
  const nextDraftStatus = input.decision === "approve" ? "approved" : "rejected";

  await db.transaction(async (tx) => {
    // lock the parent draft, re-check pending under the lock (concurrent-review race).
    const locked = await tx
      .select({ status: updateRewriteDrafts.status })
      .from(updateRewriteDrafts)
      .where(and(eq(updateRewriteDrafts.tenantId, input.tenantId), eq(updateRewriteDrafts.id, input.draftId)))
      .for("update");
    if (!locked[0]) throw new Error("DRAFT_NOT_FOUND");
    if (locked[0].status !== "pending_review") throw new Error("DRAFT_NOT_PENDING_REVIEW");

    await tx.insert(updateRewriteReviews).values({
      id: reviewId,
      tenantId: input.tenantId,
      draftId: input.draftId,
      reviewerUserId: input.reviewerUserId,
      decision: input.decision,
      editedContent: input.editedContent ?? null,
      reviewNotes: input.reviewNotes ?? null,
      reviewedAt: new Date(),
    });

    await tx
      .update(updateRewriteDrafts)
      .set({ status: nextDraftStatus })
      .where(eq(updateRewriteDrafts.id, input.draftId));

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.reviewerUserId,
      action: `rewrite_draft.${nextDraftStatus}`,
      targetType: "update_rewrite_draft",
      targetId: input.draftId,
      metadata: { decision: input.decision, reviewId, edited: input.editedContent != null },
    });
  });

  const row = await getReview(input.tenantId, reviewId);
  if (!row) throw new Error("Review insert succeeded but row could not be reloaded.");
  return row;
}
