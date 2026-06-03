import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { auditLogs, invoiceDrafts, invoiceReviews } from "@/server/schema";
import type { ProposedInvoice } from "./drafts";

// ── Phase 26 batch 2b-i — invoice_reviews data layer ──────────────────────────────────
// The operator's review of an invoice draft (the invoice equivalent of scope-generator/
// reviews.ts). edited_content (nullable JSON) is the operator's edited invoice — NULL when
// unchanged (carries "the operator changed something"); the draft's proposed_invoice stays
// IMMUTABLE. On publish (2b-ii), effective invoice = edited_content ?? proposed_invoice.
// createInvoiceReview is a 2-row write (review insert + draft status advance) → audit INSIDE
// the txn (R-6.7); parent-before-child lock order (R-5.7 / R-6.21): lock the DRAFT (parent),
// re-check pending_review, then write.
//
// D4: operators CAN edit numeric fields here (edited_content) — the AI cannot generate a
// number, but a human can correct one. The edited invoice is the gold correction signal.

type InvoiceReviewRow = typeof invoiceReviews.$inferSelect;
export type InvoiceReviewDecision = "approve" | "reject";

export type InvoiceReview = {
  id: string;
  tenantId: string;
  draftId: string;
  reviewerUserId: string | null;
  decision: InvoiceReviewDecision;
  editedContent: ProposedInvoice | null;
  reviewNotes: string | null;
  reviewedAt: Date;
  createdAt: Date;
};

function parseEditedContent(v: unknown): ProposedInvoice | null {
  // R-6.19: json() round-trips as a string on MariaDB; parse here. NULL stays null
  // (information-carrying: the operator made no edit).
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as ProposedInvoice;
    } catch {
      return null;
    }
  }
  return v as ProposedInvoice;
}

function toDomain(row: InvoiceReviewRow): InvoiceReview {
  return {
    id: row.id,
    tenantId: row.tenantId,
    draftId: row.draftId,
    reviewerUserId: row.reviewerUserId,
    decision: row.decision,
    editedContent: parseEditedContent(row.editedContent),
    reviewNotes: row.reviewNotes,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
  };
}

/** One review by id, tenant-scoped. */
export async function getInvoiceReview(tenantId: string, id: string): Promise<InvoiceReview | null> {
  const rows = await db
    .select()
    .from(invoiceReviews)
    .where(and(eq(invoiceReviews.tenantId, tenantId), eq(invoiceReviews.id, id)))
    .limit(1);
  return rows[0] ? toDomain(rows[0]) : null;
}

/** The most recent APPROVE review for a draft (carries edited_content, if any). */
export async function getApproveReviewForInvoiceDraft(
  tenantId: string,
  draftId: string,
): Promise<InvoiceReview | null> {
  const rows = await db
    .select()
    .from(invoiceReviews)
    .where(
      and(
        eq(invoiceReviews.tenantId, tenantId),
        eq(invoiceReviews.draftId, draftId),
        eq(invoiceReviews.decision, "approve"),
      ),
    )
    .orderBy(desc(invoiceReviews.createdAt))
    .limit(1);
  return rows[0] ? toDomain(rows[0]) : null;
}

/**
 * Record an operator's review of a pending draft and advance it. Two-row write → audit
 * INSIDE the txn (R-6.7). Parent-before-child (R-5.7): lock the DRAFT FOR UPDATE, re-check
 * pending_review (concurrent-review race), insert the review + advance the draft.
 * approve -> 'approved'; reject -> 'rejected'. editedContent (approve only, optional) is the
 * operator's edit; proposed_invoice stays immutable.
 *
 * Throws: DRAFT_NOT_FOUND, DRAFT_NOT_PENDING_REVIEW.
 */
export async function createInvoiceReview(input: {
  tenantId: string;
  draftId: string;
  reviewerUserId: string;
  decision: InvoiceReviewDecision;
  editedContent?: ProposedInvoice | null;
  reviewNotes?: string | null;
}): Promise<InvoiceReview> {
  const reviewId = uuidv7();
  const nextDraftStatus = input.decision === "approve" ? "approved" : "rejected";

  await db.transaction(async (tx) => {
    const locked = await tx
      .select({ status: invoiceDrafts.status })
      .from(invoiceDrafts)
      .where(and(eq(invoiceDrafts.tenantId, input.tenantId), eq(invoiceDrafts.id, input.draftId)))
      .for("update");
    if (!locked[0]) throw new Error("DRAFT_NOT_FOUND");
    if (locked[0].status !== "pending_review") throw new Error("DRAFT_NOT_PENDING_REVIEW");

    await tx.insert(invoiceReviews).values({
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
      .update(invoiceDrafts)
      .set({ status: nextDraftStatus })
      .where(eq(invoiceDrafts.id, input.draftId));

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.reviewerUserId,
      action: `invoice_draft.${nextDraftStatus}`,
      targetType: "invoice_draft",
      targetId: input.draftId,
      metadata: { decision: input.decision, reviewId, edited: input.editedContent != null },
    });
  });

  const row = await getInvoiceReview(input.tenantId, reviewId);
  if (!row) throw new Error("Invoice review insert succeeded but row could not be reloaded.");
  return row;
}
