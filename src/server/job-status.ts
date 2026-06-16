import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { jobs, jobStatuses, jobStatusHistory } from "@/server/schema";
import { getJobStatusByCode } from "@/server/job-reference";

// ── Shared job-status advance (the status + history core) ──────────────────────────────
// Extracted from the three inline advance sites (createJob's initial-status insert is the ONE
// exception — it writes a null→NEW history row on a fresh insert, which a read-current helper
// can't reproduce, so it stays inline). sendDispatch (NEW/SCHEDULED → DISPATCHED) and
// markBillingClosed (→ CLOSED_BILLED) call this; the per-dispatch auto-follow (next sub-batch)
// reuses it too.
//
// SCOPE OF THIS HELPER: resolve toCode → id, read the job's current status UNDER THE CALLER'S TX
// (it does NOT lock — callers own lock ordering; sendDispatch/markBillingClosed already hold a
// FOR UPDATE on the job), optionally gate on fromCodes (forward-only — never regress), UPDATE the
// status, and write the jobStatusHistory row. It writes NO job_events / audit_logs / billing
// events — those are site-specific and stay at the call sites (Inspect-C).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AdvanceJobStatusInput = {
  tenantId: string;
  jobId: string;
  /** Target status code (e.g. "DISPATCHED", "CLOSED_BILLED", "PENDING_INVOICE"). */
  toCode: string;
  /**
   * When given, advance ONLY if the job's current status code is in this set (forward-only,
   * never regress) — otherwise return { advanced: false } without writing. When absent, the
   * advance is unconditional (the caller owns any guard, e.g. a throw on already-at-target).
   */
  fromCodes?: readonly string[];
  /** Nullable — a linkless/system advance carries null. */
  actorUserId: string | null;
  /** Nullable history note (<=500). */
  note?: string | null;
  /** Extra columns to set on the jobs row in the SAME update (e.g. closedAt). status-only by default. */
  extraSet?: Partial<typeof jobs.$inferInsert>;
};

/**
 * Advance a job's status + write the typed history row, in the caller's transaction.
 * Returns { advanced, fromStatusId }. Throws STATUS_NOT_FOUND (bad toCode) / JOB_NOT_FOUND.
 */
export async function advanceJobStatus(
  tx: Tx,
  input: AdvanceJobStatusInput,
): Promise<{ advanced: boolean; fromStatusId: string | null }> {
  const to = await getJobStatusByCode(input.toCode);
  if (!to) throw new Error("STATUS_NOT_FOUND");

  // Current status (id + code) under the caller's lock.
  const [cur] = await tx
    .select({ currentStatusId: jobs.currentStatusId, currentCode: jobStatuses.code })
    .from(jobs)
    .innerJoin(jobStatuses, eq(jobStatuses.id, jobs.currentStatusId))
    .where(and(eq(jobs.tenantId, input.tenantId), eq(jobs.id, input.jobId)))
    .limit(1);
  if (!cur) throw new Error("JOB_NOT_FOUND");

  // Forward-only guard: skip silently when the current code is outside fromCodes.
  if (input.fromCodes && !input.fromCodes.includes(cur.currentCode)) {
    return { advanced: false, fromStatusId: cur.currentStatusId };
  }

  await tx
    .update(jobs)
    .set({ currentStatusId: to.id, ...(input.extraSet ?? {}) })
    .where(and(eq(jobs.tenantId, input.tenantId), eq(jobs.id, input.jobId)));

  await tx.insert(jobStatusHistory).values({
    tenantId: input.tenantId,
    jobId: input.jobId,
    fromStatusId: cur.currentStatusId,
    toStatusId: to.id,
    changedByUserId: input.actorUserId,
    note: input.note ?? null,
  });

  return { advanced: true, fromStatusId: cur.currentStatusId };
}
