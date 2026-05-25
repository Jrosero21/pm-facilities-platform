import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { jobContacts } from "@/server/schema";
import { getJob } from "@/server/jobs";

export type JobContactRow = typeof jobContacts.$inferSelect;

/** Non-archived contacts for a job, primary first then by name. */
export async function listJobContacts(
  tenantId: string,
  jobId: string,
): Promise<JobContactRow[]> {
  return db
    .select()
    .from(jobContacts)
    .where(
      and(
        eq(jobContacts.tenantId, tenantId),
        eq(jobContacts.jobId, jobId),
        ne(jobContacts.status, "archived"),
      ),
    )
    .orderBy(desc(jobContacts.isPrimary), jobContacts.name);
}

export type CreateJobContactInput = {
  tenantId: string;
  jobId: string;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
  createdByUserId: string;
};

/**
 * Create a job contact. Guards that the job is in the tenant (JOB_NOT_FOUND),
 * inserts, and writes a job_contact.created audit row. Single-row mutation, so
 * audit goes through writeAuditLog() OUTSIDE any transaction (resilience over
 * atomicity — the createJob multi-row rule does not apply here; D-4.x).
 */
export async function createJobContact(
  input: CreateJobContactInput,
): Promise<JobContactRow> {
  const job = await getJob(input.tenantId, input.jobId);
  if (!job) throw new Error("JOB_NOT_FOUND");

  const id = uuidv7();
  await db.insert(jobContacts).values({
    id,
    tenantId: input.tenantId,
    jobId: input.jobId,
    name: input.name,
    title: input.title ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    isPrimary: input.isPrimary ?? false,
    notes: input.notes ?? null,
    createdByUserId: input.createdByUserId,
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.createdByUserId,
    action: "job_contact.created",
    targetType: "job_contact",
    targetId: id,
    metadata: { jobId: input.jobId, name: input.name },
  });

  const rows = await db
    .select()
    .from(jobContacts)
    .where(and(eq(jobContacts.tenantId, input.tenantId), eq(jobContacts.id, id)))
    .limit(1);
  if (!rows[0]) throw new Error("Contact insert succeeded but row could not be reloaded.");
  return rows[0];
}
