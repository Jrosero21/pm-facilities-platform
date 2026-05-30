import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { jobNotes, users } from "@/server/schema";
import { getJob } from "@/server/jobs";
import type { NoteVisibility } from "@/components/note-visibility-badge";

export type JobNoteRow = typeof jobNotes.$inferSelect;

/**
 * Non-archived notes for a job, newest first. Left-joins users for the author
 * name (null for system-authored) — narrative parity with listJobEvents /
 * listCommunicationsForJob, so the 6c.1 timeline can attribute notes.
 */
export async function listJobNotes(tenantId: string, jobId: string) {
  return db
    .select({
      id: jobNotes.id,
      jobId: jobNotes.jobId,
      body: jobNotes.body,
      visibility: jobNotes.visibility,
      origin: jobNotes.origin,
      createdAt: jobNotes.createdAt,
      authorName: users.name,
    })
    .from(jobNotes)
    .leftJoin(users, eq(jobNotes.createdByUserId, users.id))
    .where(
      and(
        eq(jobNotes.tenantId, tenantId),
        eq(jobNotes.jobId, jobId),
        ne(jobNotes.status, "archived"),
      ),
    )
    .orderBy(desc(jobNotes.createdAt));
}

export type JobNoteListItem = Awaited<ReturnType<typeof listJobNotes>>[number];

/** One note by id, tenant-scoped. Null if missing/cross-tenant. */
export async function getJobNote(
  tenantId: string,
  id: string,
): Promise<JobNoteRow | null> {
  const rows = await db
    .select()
    .from(jobNotes)
    .where(and(eq(jobNotes.tenantId, tenantId), eq(jobNotes.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export type CreateJobNoteInput = {
  tenantId: string;
  jobId: string;
  body: string;
  visibility?: NoteVisibility;
  createdByUserId: string;
  // Provenance (Phase 10 Fork 4). Default 'operator'; the vendor note path
  // (createVendorNote) passes 'vendor'; the client note path (createClientNote,
  // Phase 11 11g) passes 'client'. App-enforced — the column is varchar(16), so
  // new origins widen this union without a migration (schema lock's documented intent).
  origin?: "operator" | "vendor" | "client";
};

/**
 * Create a job note. Guards job-in-tenant (JOB_NOT_FOUND). visibility is an
 * operator classification (Phase 6 6b) — one of the 5-value enum, default
 * internal_only. Setting visibility is CLASSIFICATION only; it does NOT share the
 * note (R-5.8 explicit-transitions) — the explicit "Share with client/vendor"
 * action lands post-6d once communication_logs exists. Single-row mutation:
 * audit via writeAuditLog() outside any transaction (R-4.5).
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
    visibility: input.visibility ?? "internal_only",
    origin: input.origin ?? "operator",
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
