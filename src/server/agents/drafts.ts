import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { updateRewriteDrafts } from "@/server/schema";

export type UpdateRewriteDraftRow = typeof updateRewriteDrafts.$inferSelect;
export type DraftSourceType = "job_note" | "vendor_update";

/** One draft by id, tenant-scoped. */
export async function getDraft(tenantId: string, id: string): Promise<UpdateRewriteDraftRow | null> {
  const rows = await db
    .select()
    .from(updateRewriteDrafts)
    .where(and(eq(updateRewriteDrafts.tenantId, tenantId), eq(updateRewriteDrafts.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

/** Drafts for a job, newest first. */
export async function listDraftsForJob(tenantId: string, jobId: string): Promise<UpdateRewriteDraftRow[]> {
  return db
    .select()
    .from(updateRewriteDrafts)
    .where(and(eq(updateRewriteDrafts.tenantId, tenantId), eq(updateRewriteDrafts.jobId, jobId)))
    .orderBy(desc(updateRewriteDrafts.createdAt));
}

/** Pending-review drafts for a job (the operator's rewriter draft queue, 6g.b UI). */
export async function listPendingReviewDrafts(tenantId: string, jobId: string): Promise<UpdateRewriteDraftRow[]> {
  return db
    .select()
    .from(updateRewriteDrafts)
    .where(
      and(
        eq(updateRewriteDrafts.tenantId, tenantId),
        eq(updateRewriteDrafts.jobId, jobId),
        eq(updateRewriteDrafts.status, "pending_review"),
      ),
    )
    .orderBy(desc(updateRewriteDrafts.createdAt));
}

/**
 * Create a rewrite draft at status='pending_review' — the agent's ONLY write to
 * operational-adjacent state (and the rewriter's write tool). The agent has NO path to
 * communication_logs / client_update_logs / job_status; publishing is the separate,
 * human-gated publishRewriteDraft action. NOT audited to audit_logs here — the agent's
 * write is captured in agent_tool_calls (the agent audit substrate); audit_logs records
 * the HUMAN actions (review, publish). Single-row insert.
 */
export async function createRewriteDraft(input: {
  tenantId: string;
  jobId: string;
  agentRunId: string;
  sourceType: DraftSourceType;
  sourceId: string;
  draftContent: string;
}): Promise<UpdateRewriteDraftRow> {
  const id = uuidv7();
  await db.insert(updateRewriteDrafts).values({
    id,
    tenantId: input.tenantId,
    jobId: input.jobId,
    agentRunId: input.agentRunId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    draftContent: input.draftContent,
    status: "pending_review",
  });
  const row = await getDraft(input.tenantId, id);
  if (!row) throw new Error("Draft insert succeeded but row could not be reloaded.");
  return row;
}

/** Discard a pending draft silently (no review row). Terminal. Single-row update. */
export async function discardDraft(tenantId: string, id: string): Promise<void> {
  await db
    .update(updateRewriteDrafts)
    .set({ status: "discarded" })
    .where(
      and(
        eq(updateRewriteDrafts.tenantId, tenantId),
        eq(updateRewriteDrafts.id, id),
        eq(updateRewriteDrafts.status, "pending_review"),
      ),
    );
}
