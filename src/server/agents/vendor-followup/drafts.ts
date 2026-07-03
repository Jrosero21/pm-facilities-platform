import "server-only";

import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import {
  vendorFollowupDrafts,
  jobVendorAssignments,
  dispatchAssignmentStatuses,
  jobs,
  priorities,
  vendors,
} from "@/server/schema";

// ── vendor_followup_v1 data layer ─────────────────────────────────────────────────────
// read-narrow: exactly the fields the chase needs — the isDispatchStuck inputs (statusCode /
// priorityCode / sentAt) plus the message context (vendor / job / problem). write-narrow: one
// vendor_followup_drafts row @ pending_review. The agent NEVER writes dispatch_messages (sending
// is a separate operator step) and NEVER mutates the assignment (record-don't-apply).

export type FollowupContextRow = {
  assignmentId: string;
  jobId: string;
  jobNumber: number | null;
  statusCode: string;
  priorityCode: string | null;
  sentAt: Date | null;
  vendorName: string;
  problemDescription: string;
};

/** Read the assignment's dispatch context (tenant-scoped) — the chase's read-narrow. */
export async function getFollowupContext(tenantId: string, assignmentId: string): Promise<FollowupContextRow | null> {
  const rows = await db
    .select({
      assignmentId: jobVendorAssignments.id,
      jobId: jobVendorAssignments.jobId,
      jobNumber: jobs.jobNumber,
      statusCode: dispatchAssignmentStatuses.code,
      priorityCode: priorities.code,
      sentAt: jobVendorAssignments.sentAt,
      vendorName: vendors.name,
      problemDescription: jobs.problemDescription,
    })
    .from(jobVendorAssignments)
    .innerJoin(jobs, eq(jobVendorAssignments.jobId, jobs.id))
    .innerJoin(vendors, eq(jobVendorAssignments.vendorId, vendors.id))
    .innerJoin(dispatchAssignmentStatuses, eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id))
    .leftJoin(priorities, eq(jobs.priorityId, priorities.id))
    .where(and(eq(jobVendorAssignments.tenantId, tenantId), eq(jobVendorAssignments.id, assignmentId)))
    .limit(1);
  return rows[0] ?? null;
}

export type FollowupDraft = typeof vendorFollowupDrafts.$inferSelect;

/**
 * Single-writer — insert the chase draft @ pending_review. NEVER sends, NEVER touches the
 * assignment. Mirrors createIntakeDraft's single-row insert + reload.
 */
export async function createFollowupDraft(input: {
  tenantId: string;
  assignmentId: string;
  agentRunId: string;
  draftContent: string;
}): Promise<FollowupDraft> {
  const id = uuidv7();
  await db.insert(vendorFollowupDrafts).values({
    id,
    tenantId: input.tenantId,
    assignmentId: input.assignmentId,
    agentRunId: input.agentRunId,
    draftContent: input.draftContent,
    // status defaults to pending_review; sent_dispatch_message_id stays NULL until an operator sends it.
  });
  const row = (await db.select().from(vendorFollowupDrafts).where(eq(vendorFollowupDrafts.id, id)).limit(1))[0];
  if (!row) throw new Error("Followup draft insert succeeded but row could not be reloaded.");
  return row;
}
