import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { jobNotes } from "@/server/schema";
import { getJob } from "@/server/jobs";

export type JobNoteRow = typeof jobNotes.$inferSelect;

/** Non-archived notes for a job, newest first. */
export async function listJobNotes(
  tenantId: string,
  jobId: string,
): Promise<JobNoteRow[]> {
  return db
    .select()
    .from(jobNotes)
    .where(
      and(
        eq(jobNotes.tenantId, tenantId),
        eq(jobNotes.jobId, jobId),
        ne(jobNotes.status, "archived"),
      ),
    )
    .orderBy(desc(jobNotes.createdAt));
}

export type CreateJobNoteInput = {
  tenantId: string;
  jobId: string;
  body: string;
  createdByUserId: string;
};

/**
 * Create a job note. Guards job-in-tenant (JOB_NOT_FOUND). visibility is forced
 * to internal_only in Phase 4 — the column exists for Phase 6's visibility
 * workflows, but the operator can't set it yet (D-4.x). Single-row mutation:
 * audit via writeAuditLog() outside any transaction.
 */
export async function createJobNote(
  input: CreateJobNoteInput,
): Promise<JobNoteRow> {
  const job = await getJob(input.tenantId, input.jobId);
  if (!job) throw new Error("JOB_NOT_FOUND");

  const id = uuidv7();
  await db.insert(jobNotes).values({
    id,
    tenantId: input.tenantId,
    jobId: input.jobId,
    body: input.body,
    visibility: "internal_only",
    createdByUserId: input.createdByUserId,
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.createdByUserId,
    action: "job_note.created",
    targetType: "job_note",
    targetId: id,
    metadata: { jobId: input.jobId },
  });

  const rows = await db
    .select()
    .from(jobNotes)
    .where(and(eq(jobNotes.tenantId, input.tenantId), eq(jobNotes.id, id)))
    .limit(1);
  if (!rows[0]) throw new Error("Note insert succeeded but row could not be reloaded.");
  return rows[0];
}
