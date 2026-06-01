import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { agentDecisions, clients, jobs, updateRewriteDrafts } from "@/server/schema";
import { writeAuditLog } from "@/server/audit";

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

/**
 * Discard a pending draft (operator dismissal — no review row, unlike reject). Terminal.
 * Single-row update + writeAuditLog OUTSIDE (R-4.5). This IS an operator-driven mutation
 * on agent output, so it audits to audit_logs (the agent's OWN actions live in the
 * substrate; only human actions hit audit_logs — R-6.x).
 *
 * Throws: DRAFT_NOT_FOUND, DRAFT_NOT_PENDING_REVIEW.
 */
export async function discardDraft(tenantId: string, id: string, actorUserId: string): Promise<void> {
  const draft = await getDraft(tenantId, id);
  if (!draft) throw new Error("DRAFT_NOT_FOUND");
  if (draft.status !== "pending_review") throw new Error("DRAFT_NOT_PENDING_REVIEW");

  await db
    .update(updateRewriteDrafts)
    .set({ status: "discarded" })
    .where(and(eq(updateRewriteDrafts.tenantId, tenantId), eq(updateRewriteDrafts.id, id)));

  await writeAuditLog({
    tenantId,
    userId: actorUserId,
    action: "rewrite_draft.discarded",
    targetType: "update_rewrite_draft",
    targetId: id,
    metadata: { jobId: draft.jobId },
  });
}

// MariaDB stores drizzle `json()` as LONGTEXT; mysql2 returns it as a STRING and drizzle's
// mysql json type does NOT parse on read — so json columns round-trip as strings here.
// Parse at the read boundary so the UI gets a real object (R-6.x / drizzle-gotchas).
function parseJsonColumn(v: unknown): unknown {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v ?? null;
}

export type DraftListItemDetailed = {
  id: string;
  jobId: string;
  agentRunId: string;
  sourceType: DraftSourceType;
  sourceId: string;
  draftContent: string;
  status: UpdateRewriteDraftRow["status"];
  publishedCommunicationId: string | null;
  createdAt: Date;
  confidence: string | null;
  rationale: string | null;
  decisionMetadata: unknown;
};

/**
 * Drafts for a job joined to their rewrite_proposal decision (confidence/rationale/
 * stripped-items) for the Update drafts UI. Newest first. The decision lives on
 * agent_decisions via the shared agent_run_id.
 */
export async function listDraftsForJobDetailed(
  tenantId: string,
  jobId: string,
): Promise<DraftListItemDetailed[]> {
  const rows = await db
    .select({
      id: updateRewriteDrafts.id,
      jobId: updateRewriteDrafts.jobId,
      agentRunId: updateRewriteDrafts.agentRunId,
      sourceType: updateRewriteDrafts.sourceType,
      sourceId: updateRewriteDrafts.sourceId,
      draftContent: updateRewriteDrafts.draftContent,
      status: updateRewriteDrafts.status,
      publishedCommunicationId: updateRewriteDrafts.publishedCommunicationId,
      createdAt: updateRewriteDrafts.createdAt,
      confidence: agentDecisions.confidence,
      rationale: agentDecisions.reasoning,
      decisionMetadata: agentDecisions.metadata,
    })
    .from(updateRewriteDrafts)
    .leftJoin(
      agentDecisions,
      and(
        eq(agentDecisions.agentRunId, updateRewriteDrafts.agentRunId),
        eq(agentDecisions.decisionType, "rewrite_proposal"),
      ),
    )
    .where(and(eq(updateRewriteDrafts.tenantId, tenantId), eq(updateRewriteDrafts.jobId, jobId)))
    .orderBy(desc(updateRewriteDrafts.createdAt));
  return rows.map((r) => ({ ...r, decisionMetadata: parseJsonColumn(r.decisionMetadata) }));
}

// A queue row carries its job label (job_number + client name) so the tenant-wide
// review queue can show context + link to /jobs/{id} without a single jobId prop.
export type DraftQueueItem = DraftListItemDetailed & {
  jobNumber: number;
  clientName: string;
};

/**
 * Tenant-wide actionable draft queue (Phase 18b) — the cross-job mirror of
 * listDraftsForJobDetailed. Same agent_decisions leftJoin (confidence/rationale/
 * stripped-items) MINUS the jobId filter, PLUS a job + client join for the row
 * label. Returns the actionable set (pending_review + approved); the component
 * splits by status into the triage and publish lanes. Newest first.
 * urd_tenant_status_idx (tenant_id, status) backs the WHERE.
 */
export async function listPendingReviewDraftsDetailed(
  tenantId: string,
): Promise<DraftQueueItem[]> {
  const rows = await db
    .select({
      id: updateRewriteDrafts.id,
      jobId: updateRewriteDrafts.jobId,
      agentRunId: updateRewriteDrafts.agentRunId,
      sourceType: updateRewriteDrafts.sourceType,
      sourceId: updateRewriteDrafts.sourceId,
      draftContent: updateRewriteDrafts.draftContent,
      status: updateRewriteDrafts.status,
      publishedCommunicationId: updateRewriteDrafts.publishedCommunicationId,
      createdAt: updateRewriteDrafts.createdAt,
      confidence: agentDecisions.confidence,
      rationale: agentDecisions.reasoning,
      decisionMetadata: agentDecisions.metadata,
      jobNumber: jobs.jobNumber,
      clientName: clients.name,
    })
    .from(updateRewriteDrafts)
    .leftJoin(
      agentDecisions,
      and(
        eq(agentDecisions.agentRunId, updateRewriteDrafts.agentRunId),
        eq(agentDecisions.decisionType, "rewrite_proposal"),
      ),
    )
    .innerJoin(jobs, eq(jobs.id, updateRewriteDrafts.jobId))
    .innerJoin(clients, eq(clients.id, jobs.clientId))
    .where(
      and(
        eq(updateRewriteDrafts.tenantId, tenantId),
        inArray(updateRewriteDrafts.status, ["pending_review", "approved"]),
      ),
    )
    .orderBy(desc(updateRewriteDrafts.createdAt));
  return rows.map((r) => ({ ...r, decisionMetadata: parseJsonColumn(r.decisionMetadata) }));
}
