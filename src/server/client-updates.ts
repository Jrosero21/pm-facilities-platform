import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import {
  auditLogs,
  clientUpdateLogs,
  communicationLogs,
  jobs,
  updateRewriteDrafts,
} from "@/server/schema";
import { getJob } from "@/server/jobs";
import { listClientContacts } from "@/server/client-contacts";
import { getDraft } from "@/server/agents/drafts";
import { getApproveReviewForDraft } from "@/server/agents/reviews";

export type ClientUpdateLogRow = typeof clientUpdateLogs.$inferSelect;

/** One client update by id, tenant-scoped. */
export async function getClientUpdate(tenantId: string, id: string): Promise<ClientUpdateLogRow | null> {
  const rows = await db
    .select()
    .from(clientUpdateLogs)
    .where(and(eq(clientUpdateLogs.tenantId, tenantId), eq(clientUpdateLogs.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

/** Client updates for a job, newest first. */
export async function listClientUpdatesForJob(tenantId: string, jobId: string): Promise<ClientUpdateLogRow[]> {
  return db
    .select()
    .from(clientUpdateLogs)
    .where(and(eq(clientUpdateLogs.tenantId, tenantId), eq(clientUpdateLogs.jobId, jobId)))
    .orderBy(desc(clientUpdateLogs.createdAt));
}

function excerpt(s: string, max = 200): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export type PublishResult = {
  clientUpdate: ClientUpdateLogRow;
  communicationId: string;
};

/**
 * Publish an APPROVED rewrite draft to the client — the human-gated, ONLY draft→comm
 * path (the agent itself can never reach this). Multi-row txn → audit INSIDE (R-4.5).
 * Parent-before-child lock order (R-5.7): lock the JOB (parent) FOR UPDATE, then the
 * DRAFT (child), re-check both, then write. Effective content = the approving review's
 * edited_content ?? the draft's immutable draft_content. Recipient is pre-filled from the
 * job's client primary contact (R-5.11). The communication starts at delivery_status
 * 'draft' (Publish ≠ Send — the operator Sends it via the existing 6e delivery machine).
 *
 * Throws: DRAFT_NOT_FOUND, DRAFT_NOT_APPROVED, JOB_NOT_FOUND.
 */
export async function publishRewriteDraft(input: {
  tenantId: string;
  draftId: string;
  actorUserId: string;
}): Promise<PublishResult> {
  // --- guards (read-only, before the txn) ---
  const draft = await getDraft(input.tenantId, input.draftId);
  if (!draft) throw new Error("DRAFT_NOT_FOUND");
  if (draft.status !== "approved") throw new Error("DRAFT_NOT_APPROVED");

  const job = await getJob(input.tenantId, draft.jobId);
  if (!job) throw new Error("JOB_NOT_FOUND");

  const approveReview = await getApproveReviewForDraft(input.tenantId, input.draftId);
  const content = approveReview?.editedContent ?? draft.draftContent;

  // Recipient pre-fill — the job's client primary contact (R-5.11).
  const contacts = await listClientContacts(input.tenantId, job.clientId);
  const primary = contacts.find((c) => c.isPrimary) ?? contacts[0];
  const recipientId = primary?.id ?? null;
  const recipientEmail = primary?.email ?? null;

  const culId = uuidv7();
  const commId = uuidv7();

  await db.transaction(async (tx) => {
    // 1. lock the PARENT (job) first — parent-before-child (R-5.7).
    const lockedJob = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.tenantId, input.tenantId), eq(jobs.id, draft.jobId)))
      .for("update");
    if (!lockedJob[0]) throw new Error("JOB_NOT_FOUND");

    // 2. lock the CHILD (draft); re-check still approved (double-publish race).
    const lockedDraft = await tx
      .select({ status: updateRewriteDrafts.status })
      .from(updateRewriteDrafts)
      .where(and(eq(updateRewriteDrafts.tenantId, input.tenantId), eq(updateRewriteDrafts.id, input.draftId)))
      .for("update");
    if (!lockedDraft[0]) throw new Error("DRAFT_NOT_FOUND");
    if (lockedDraft[0].status !== "approved") throw new Error("DRAFT_NOT_APPROVED");

    // 3. the published client update (content row).
    await tx.insert(clientUpdateLogs).values({
      id: culId,
      tenantId: input.tenantId,
      jobId: draft.jobId,
      content,
      sourceDraftId: input.draftId,
      createdByUserId: input.actorUserId,
    });

    // 4. the communication spine row (source_type='client_update' → the cul row).
    await tx.insert(communicationLogs).values({
      id: commId,
      tenantId: input.tenantId,
      jobId: draft.jobId,
      channel: "client_portal",
      direction: "outbound",
      sourceType: "client_update",
      sourceId: culId,
      visibility: "client_visible",
      summary: excerpt(content),
      sentByUserId: input.actorUserId,
      recipientType: "client_contact",
      recipientId,
      recipientEmail,
      deliveryStatus: "draft",
    });

    // 5. advance the draft → published, link its communication.
    await tx
      .update(updateRewriteDrafts)
      .set({ status: "published", publishedCommunicationId: commId })
      .where(eq(updateRewriteDrafts.id, input.draftId));

    // 6. audit — INSIDE the txn (R-4.5): the publish + the communication creation.
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "rewrite_draft.published",
      targetType: "update_rewrite_draft",
      targetId: input.draftId,
      metadata: { jobId: draft.jobId, clientUpdateId: culId, communicationId: commId },
    });
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "communication.created",
      targetType: "communication_log",
      targetId: commId,
      metadata: { jobId: draft.jobId, sourceType: "client_update", sourceId: culId, channel: "client_portal" },
    });
  });

  const clientUpdate = await getClientUpdate(input.tenantId, culId);
  if (!clientUpdate) throw new Error("Client update insert succeeded but row could not be reloaded.");
  return { clientUpdate, communicationId: commId };
}
