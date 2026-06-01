import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { clients, jobNotes, jobs, users } from "@/server/schema";
import { getJob } from "@/server/jobs";
import { isNoteVisibility, type NoteVisibility } from "@/components/note-visibility-badge";

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

/**
 * Tenant-wide vendor-updates inbox (Phase 18c, FB-10a.3) — the cross-job mirror
 * of listJobNotes restricted to vendor-origin notes. Same users leftJoin for
 * authorName, PLUS a job + client join for the row label (#jobNumber · client),
 * matching 18b's DraftQueueItem labeling. Non-archived, newest first. PULL only.
 * Note: no (tenant_id, origin) index exists — a tenant-prefix scan filtered on
 * origin; banked as a soft perf item (job_notes_tenant_job_idx is the only index).
 */
export async function listVendorUpdates(tenantId: string) {
  return db
    .select({
      id: jobNotes.id,
      jobId: jobNotes.jobId,
      body: jobNotes.body,
      visibility: jobNotes.visibility,
      origin: jobNotes.origin,
      createdAt: jobNotes.createdAt,
      authorName: users.name,
      jobNumber: jobs.jobNumber,
      clientName: clients.name,
    })
    .from(jobNotes)
    .leftJoin(users, eq(jobNotes.createdByUserId, users.id))
    .innerJoin(jobs, eq(jobs.id, jobNotes.jobId))
    .innerJoin(clients, eq(clients.id, jobs.clientId))
    .where(
      and(
        eq(jobNotes.tenantId, tenantId),
        eq(jobNotes.origin, "vendor"),
        ne(jobNotes.status, "archived"),
      ),
    )
    .orderBy(desc(jobNotes.createdAt));
}

export type VendorUpdateItem = Awaited<ReturnType<typeof listVendorUpdates>>[number];

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

// FB-10l.2 promotion targets — the ONLY visibilities promoteNoteVisibility may set.
// This keeps the writer a PROMOTION writer (operator shares a note outward), not a
// general set-any-visibility mutator. internal_only / requires_review / vendor_visible
// are NOT valid promotion targets here.
const PROMOTION_TARGETS = ["client_visible", "client_and_vendor_visible"] as const;

/**
 * Operator-gated visibility promotion (Phase 18c, FB-10l.2) — flip a note's
 * visibility to a client-facing value + write the audit record. The one net-new
 * write of Phase 18. Operator authorization pattern: tenant-scoped via getJobNote
 * (NOTE_NOT_FOUND), NOT the vendor-scope check. Single-row UPDATE (updated_at fires
 * via onUpdateNow), audit OUTSIDE any txn (R-4.5), mirroring createJobNote.
 *
 * FORK 1 (locked): flip + audit ONLY. NO outbound — no communication_logs, no
 * client_update_logs, no notification. The send path is Phase 19's.
 *
 * Throws: NOTE_NOT_FOUND, INVALID_PROMOTION_TARGET.
 */
export async function promoteNoteVisibility(input: {
  tenantId: string;
  noteId: string;
  toVisibility: string;
  actorUserId: string;
}): Promise<JobNoteRow> {
  const note = await getJobNote(input.tenantId, input.noteId);
  if (!note) throw new Error("NOTE_NOT_FOUND");

  if (
    !isNoteVisibility(input.toVisibility) ||
    !(PROMOTION_TARGETS as readonly string[]).includes(input.toVisibility)
  ) {
    throw new Error("INVALID_PROMOTION_TARGET");
  }
  const to = input.toVisibility as NoteVisibility;
  const from = note.visibility;

  await db
    .update(jobNotes)
    .set({ visibility: to })
    .where(and(eq(jobNotes.tenantId, input.tenantId), eq(jobNotes.id, input.noteId)));

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.actorUserId,
    action: "job_note.visibility_promoted",
    targetType: "job_note",
    targetId: input.noteId,
    metadata: { jobId: note.jobId, from, to },
  });

  const updated = await getJobNote(input.tenantId, input.noteId);
  if (!updated) throw new Error("Note update succeeded but row could not be reloaded.");
  return updated;
}
