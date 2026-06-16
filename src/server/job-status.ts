import "server-only";

import { and, count, eq, notInArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dispatchAssignmentStatuses,
  jobVendorAssignments,
  jobs,
  jobStatuses,
  jobStatusHistory,
} from "@/server/schema";
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

// ── Single-vendor dispatch → job auto-follow ───────────────────────────────────────────
// When a job has exactly ONE active dispatch, a dispatch milestone carries the job forward:
// the vendor going on-site means the job is in progress; the vendor reporting work complete means
// the job is operationally done and awaiting invoicing. Multi-vendor jobs are hand-controlled (the
// platform can't infer the job's state from one of several vendors), so the follow only fires when
// the active-dispatch count is exactly 1.
//
// THE one swappable mapping (dispatch status code → job advance). fromCodes is the forward-only
// allow-list — only statuses that sit BEFORE the target, so the advance never regresses. ON_HOLD is
// deliberately absent from every fromCodes: a job an operator parked on hold is never auto-advanced.
export const DISPATCH_TO_JOB_ADVANCE: Record<string, { toCode: string; fromCodes: string[] }> = {
  ON_SITE: { toCode: "IN_PROGRESS", fromCodes: ["NEW", "SCHEDULED", "DISPATCHED"] },
  WORK_COMPLETE: { toCode: "PENDING_INVOICE", fromCodes: ["NEW", "SCHEDULED", "DISPATCHED", "IN_PROGRESS"] },
};

/**
 * Apply the single-vendor dispatch→job follow inside the caller's transaction, AFTER the dispatch
 * status has been updated (so the active-dispatch count reflects the new state). Both the operator
 * core (setAssignmentStatus) and the vendor core (performTransition) call this — one definition, no
 * duplication. Returns { advanced } — false when the dispatch status is unmapped, the job has ≠1
 * active dispatch, or the job is already at/past the target (forward-only).
 *
 * LOCK-FREE by design: advanceJobStatus does not lock the job. The forward-only fromCodes guard makes
 * a concurrent race a no-op (it never regresses), so this does NOT take a job FOR UPDATE — which would
 * impose an assignment→job lock order against sendDispatch's job→assignment order (deadlock risk).
 */
export async function applyDispatchJobFollow(
  tx: Tx,
  input: { tenantId: string; jobId: string; dispatchToCode: string; actorUserId: string | null },
): Promise<{ advanced: boolean }> {
  const mapping = DISPATCH_TO_JOB_ADVANCE[input.dispatchToCode];
  if (!mapping) return { advanced: false };

  // Active dispatches for this job = category NOT IN ('cancelled','draft') — DECLINED/CANCELLED are
  // category 'cancelled', a DRAFT is operator workspace; everything else (pending/active/completed)
  // counts. Run inside the tx, after the dispatch update.
  const [{ n }] = await tx
    .select({ n: count() })
    .from(jobVendorAssignments)
    .innerJoin(dispatchAssignmentStatuses, eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id))
    .where(
      and(
        eq(jobVendorAssignments.tenantId, input.tenantId),
        eq(jobVendorAssignments.jobId, input.jobId),
        notInArray(dispatchAssignmentStatuses.category, ["cancelled", "draft"]),
      ),
    );
  if (n !== 1) return { advanced: false };

  const r = await advanceJobStatus(tx, {
    tenantId: input.tenantId,
    jobId: input.jobId,
    toCode: mapping.toCode,
    fromCodes: mapping.fromCodes,
    actorUserId: input.actorUserId,
  });
  return { advanced: r.advanced };
}
