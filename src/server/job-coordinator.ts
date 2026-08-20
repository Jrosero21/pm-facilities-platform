import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { jobs, users } from "@/server/schema";

// ── vendor-WO batch 0 — WHO IS THE COORDINATOR ON THIS JOB ────────────────────────────
// The resolver behind the @coordinator / @coordinatorEmail tokens in Batch 2. Kept separate from
// the jobs reader because it answers a PERSON question, not a job question, and because the
// fallback rule below is a policy decision that deserves one home rather than being re-implemented
// at each token site.
//
// ★ RESOLUTION ORDER: assigned_user_id, then created_by_user_id.
// The fallback exists for rows that predate the column and for any future path that inserts a job
// without going through createJob. It is deliberately NOT silent — the result reports WHICH source
// answered, so a caller rendering a vendor-facing document can tell "this is the assigned
// coordinator" from "this is whoever happened to create the job", and the operator-facing surfaces
// can nudge toward a real assignment.
//
// ★ NO PHONE. users has name and email only — there is no phone column anywhere on a user. A
// vendor-facing "call the coordinator" line has nothing to resolve today; tenants.phone (the
// aggregator's main number, already populated) is the available fallback and is a TENANT fact, not
// a person fact, so it is not returned from here. Adding users.phone is a separate decision.

export type JobCoordinator = {
  userId: string;
  name: string;
  /** users.email is NOT NULL, so a resolved coordinator always has a real address. */
  email: string;
  /**
   * "assigned"  — the job carries an explicit coordinator (the normal case after batch 0).
   * "creator"   — fell back to authorship; treat as provisional, not a real assignment.
   */
  source: "assigned" | "creator";
};

/**
 * Resolve the coordinator for a job, tenant-scoped.
 *
 * Returns null when the job does not exist in this tenant, when it carries neither an assigned
 * user nor a creator, or when the referenced user row is gone (both FKs are ON DELETE set null,
 * so a deleted user leaves the job intact and coordinator-less — which is the honest answer).
 */
export async function getJobCoordinator(
  tenantId: string,
  jobId: string,
): Promise<JobCoordinator | null> {
  const rows = await db
    .select({
      assignedUserId: jobs.assignedUserId,
      createdByUserId: jobs.createdByUserId,
    })
    .from(jobs)
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId)))
    .limit(1);
  const job = rows[0];
  if (!job) return null;

  const candidate = job.assignedUserId ?? job.createdByUserId;
  if (!candidate) return null;
  const source: JobCoordinator["source"] = job.assignedUserId ? "assigned" : "creator";

  const userRows = await db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, candidate))
    .limit(1);
  const user = userRows[0];
  if (!user) return null; // FK is set-null on delete, but a stale id must not fabricate a person.

  return { ...user, source };
}
