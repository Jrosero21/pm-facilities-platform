import "server-only";

// ── Phase 19 batch 19d — EXCEPTION DETECTION (the "manage by exception" feed) ──────────
// Three tenant-wide exception kinds folded into one sorted operator list (getExceptions):
//   - vendor_not_accepted  — a dispatch SENT to a vendor but not yet accepted (status code 'SENT').
//   - nte_increase_requested — a change order awaiting approval (status 'submitted'); the CO IS the
//     NTE-increase mechanism (effective NTE = jobs.not_to_exceed_amount + Σ approved COs).
//   - operational — overdue / stalled / unassigned-high-priority jobs, from operationalQueue
//     (FILTERED — pure 'aged' is excluded; aged is "old", not blocking).
// Tenant-scope + jobs/clients label join mirrors the 18b draft queue / 18c vendor inbox readers.
// DETECTION ONLY — no auto-response (Phase 28), no autonomous send (Phase 23). Wall-clock dwell
// (Option B); the business-hours clock is banked (CF-19.1).

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  changeOrders,
  clients,
  dispatchAssignmentStatuses,
  jobStatuses,
  jobVendorAssignments,
  jobs,
  priorities,
  vendors,
} from "@/server/schema";
import { operationalQueue } from "@/server/analytics/operational-queue";
import { isDispatchStuck, dispatchStuckThresholdSeconds } from "@/server/analytics/dispatch-sla-rules";
import type { UrgencyTier } from "@/server/analytics/stalled-rules";
import type { FollowUpCategory } from "@/lib/follow-up";

// CF-19.1a — a stuck dispatch is lifted above any non-stuck row (across all kinds) by adding
// a large constant to its sortKey. Within each band (stuck / non-stuck) true age still orders.
const STUCK_SORT_BUMP_SECONDS = 365 * 24 * 3600;

// ── Reader rows ───────────────────────────────────────────────────────────────────────

export type VendorNotAcceptedRow = {
  jobId: string;
  jobNumber: number;
  clientName: string;
  assignmentId: string;
  vendorName: string;
  sentAt: Date | null;
  ageSeconds: number;
  priorityCode: string | null;
  isStuck: boolean;
  thresholdSeconds: number | null;
};

/**
 * Assignments dispatched to a vendor but not yet accepted — status code 'SENT' (category
 * 'pending'). DRAFT is not-yet-sent; ACCEPTED/SCHEDULED/… are responded; DECLINED/CANCELLED/
 * WORK_COMPLETE are terminal. ageSeconds = wall-clock dwell since sent_at (COALESCE to
 * created_at defensively), mirroring operationalQueue's TIMESTAMPDIFF idiom.
 */
export async function listVendorNotAccepted(tenantId: string): Promise<VendorNotAcceptedRow[]> {
  const rows = await db
    .select({
      jobId: jobVendorAssignments.jobId,
      jobNumber: jobs.jobNumber,
      clientName: clients.name,
      assignmentId: jobVendorAssignments.id,
      vendorName: vendors.name,
      sentAt: jobVendorAssignments.sentAt,
      ageSeconds: sql<number>`TIMESTAMPDIFF(SECOND, COALESCE(${jobVendorAssignments.sentAt}, ${jobVendorAssignments.createdAt}), NOW())`,
      priorityCode: priorities.code,
    })
    .from(jobVendorAssignments)
    .innerJoin(
      dispatchAssignmentStatuses,
      eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id),
    )
    .innerJoin(jobs, eq(jobs.id, jobVendorAssignments.jobId))
    .innerJoin(clients, eq(clients.id, jobs.clientId))
    .innerJoin(vendors, eq(vendors.id, jobVendorAssignments.vendorId))
    .leftJoin(priorities, eq(jobs.priorityId, priorities.id))
    .where(
      and(
        eq(jobVendorAssignments.tenantId, tenantId),
        eq(dispatchAssignmentStatuses.code, "SENT"),
      ),
    );
  return rows.map((r) => {
    const ageSeconds = Number(r.ageSeconds);
    const priorityCode = r.priorityCode ?? null;
    return {
      ...r,
      ageSeconds,
      priorityCode,
      isStuck: isDispatchStuck({ statusCode: "SENT", priorityCode, dwellSeconds: ageSeconds }),
      thresholdSeconds: dispatchStuckThresholdSeconds("SENT", priorityCode) ?? null,
    };
  });
}

export type NteIncreaseRow = {
  jobId: string;
  jobNumber: number;
  clientName: string;
  changeOrderId: string;
  total: string;
  reason: string | null;
  pendingSince: Date;
};

/**
 * Change orders awaiting an approval decision — status 'submitted' = the increase requested.
 * `pendingSince` uses updated_at as a PROXY for the submit time (change_orders has no dedicated
 * submitted_at column; a precise timestamp lives in change_order_approvals — banked refinement).
 */
export async function listNteIncreaseRequested(tenantId: string): Promise<NteIncreaseRow[]> {
  return db
    .select({
      jobId: changeOrders.jobId,
      jobNumber: jobs.jobNumber,
      clientName: clients.name,
      changeOrderId: changeOrders.id,
      total: changeOrders.total,
      reason: changeOrders.reason,
      pendingSince: changeOrders.updatedAt,
    })
    .from(changeOrders)
    .innerJoin(jobs, eq(jobs.id, changeOrders.jobId))
    .innerJoin(clients, eq(clients.id, jobs.clientId))
    .where(and(eq(changeOrders.tenantId, tenantId), eq(changeOrders.status, "submitted")));
}

export type FollowUpOverdueRow = {
  jobId: string;
  jobNumber: number;
  clientName: string;
  followUpAt: Date;
  category: FollowUpCategory | null;
  ageSeconds: number;
};

/**
 * Jobs whose operator follow-up reminder (jobs.follow_up_at) is in the past — the "next action is
 * overdue" signal. OPEN-job-scoped like operationalQueue (is_terminal=false AND is_archived=false) so
 * a closed/archived job's stale follow-up doesn't nag.
 *
 * The OVERDUE comparison + ageSeconds are computed in JS (Date.now), NOT in SQL — follow_up_at is
 * written CLIENT-side (an operator-picked Date via mysql2), so the stored value and the server's
 * NOW() live in different timezone frames; a SQL `follow_up_at < NOW()` skews by the server's UTC
 * offset. mysql2 round-trips the stored datetime back to the correct instant, so `getTime() <
 * Date.now()` is frame-safe. This mirrors operationalQueue's dueAt overdue check exactly. Wall-clock
 * dwell (Option B; CF-19.1 banked). The SQL stage only does the structural filters (open + has a
 * follow-up), which the jobs_tenant_followup_idx still supports.
 */
export async function listFollowUpOverdue(tenantId: string): Promise<FollowUpOverdueRow[]> {
  const rows = await db
    .select({
      jobId: jobs.id,
      jobNumber: jobs.jobNumber,
      clientName: clients.name,
      followUpAt: jobs.followUpAt,
      category: jobs.followUpCategory,
    })
    .from(jobs)
    .innerJoin(clients, eq(clients.id, jobs.clientId))
    .innerJoin(jobStatuses, eq(jobStatuses.id, jobs.currentStatusId))
    .where(
      and(
        eq(jobs.tenantId, tenantId),
        isNotNull(jobs.followUpAt),
        eq(jobs.isArchived, false),
        eq(jobStatuses.isTerminal, false),
      ),
    );
  const nowMs = Date.now();
  const out: FollowUpOverdueRow[] = [];
  for (const r of rows) {
    const at = r.followUpAt as Date; // isNotNull-filtered above
    const ageSeconds = Math.floor((nowMs - at.getTime()) / 1000);
    if (ageSeconds <= 0) continue; // future-dated → not yet due, skip
    out.push({ jobId: r.jobId, jobNumber: r.jobNumber, clientName: r.clientName, followUpAt: at, category: r.category, ageSeconds });
  }
  return out;
}

// ── The composed exception feed ───────────────────────────────────────────────────────

type ExceptionBase = {
  jobId: string;
  jobNumber: number;
  clientName: string;
  // Sort key — ELAPSED SECONDS for every kind, so all three sort comparably DESC (oldest/most
  // urgent first). No tier-weight is mixed into the raw scale; if an operational floor is ever
  // wanted, add a fixed seconds-equivalent bump per tier — for now it is pure elapsed seconds.
  sortKey: number;
};

export type Exception = ExceptionBase &
  (
    | {
        kind: "vendor_not_accepted";
        assignmentId: string;
        vendorName: string;
        sentAt: Date | null;
        ageSeconds: number;
        priorityCode: string | null;
        isStuck: boolean;
        thresholdSeconds: number | null;
      }
    | {
        kind: "nte_increase_requested";
        changeOrderId: string;
        total: string;
        reason: string | null;
        pendingSince: Date;
      }
    | {
        kind: "operational";
        urgencyTier: UrgencyTier;
        ageInCurrentStatusSeconds: number;
        isOverdue: boolean;
        isStalled: boolean;
        isUnassignedHighPriority: boolean;
      }
    | {
        kind: "follow_up_overdue";
        followUpAt: Date;
        category: FollowUpCategory | null;
      }
  );

/**
 * The tenant-wide exception queue — composes the two net-new readers with a FILTERED
 * operationalQueue, into one list sorted by sortKey (elapsed seconds) DESC. Pure 'aged'
 * operational rows are EXCLUDED (only overdue/stalled/unassigned-high-priority qualify).
 */
export async function getExceptions(tenantId: string): Promise<Exception[]> {
  const [notAccepted, nteRequested, queue, followUps] = await Promise.all([
    listVendorNotAccepted(tenantId),
    listNteIncreaseRequested(tenantId),
    operationalQueue(tenantId, Number.MAX_SAFE_INTEGER),
    listFollowUpOverdue(tenantId),
  ]);

  const nowMs = Date.now();
  const exceptions: Exception[] = [];

  for (const r of notAccepted) {
    exceptions.push({
      kind: "vendor_not_accepted",
      jobId: r.jobId,
      jobNumber: r.jobNumber,
      clientName: r.clientName,
      assignmentId: r.assignmentId,
      vendorName: r.vendorName,
      sentAt: r.sentAt,
      ageSeconds: r.ageSeconds,
      priorityCode: r.priorityCode,
      isStuck: r.isStuck,
      thresholdSeconds: r.thresholdSeconds,
      // Stuck rows bubble to the top band; true age still orders within each band.
      sortKey: r.ageSeconds + (r.isStuck ? STUCK_SORT_BUMP_SECONDS : 0),
    });
  }

  for (const r of nteRequested) {
    const ageSeconds = Math.max(0, Math.floor((nowMs - new Date(r.pendingSince).getTime()) / 1000));
    exceptions.push({
      kind: "nte_increase_requested",
      jobId: r.jobId,
      jobNumber: r.jobNumber,
      clientName: r.clientName,
      changeOrderId: r.changeOrderId,
      total: r.total,
      reason: r.reason,
      pendingSince: r.pendingSince,
      sortKey: ageSeconds,
    });
  }

  // FILTER: only genuine exceptions — exclude pure 'aged' (informational, not blocking).
  for (const q of queue) {
    if (!(q.isOverdue || q.isStalled || q.isUnassignedHighPriority)) continue;
    exceptions.push({
      kind: "operational",
      jobId: q.jobId,
      jobNumber: q.jobNumber,
      clientName: q.clientName,
      urgencyTier: q.urgencyTier,
      ageInCurrentStatusSeconds: q.ageInCurrentStatusSeconds,
      isOverdue: q.isOverdue,
      isStalled: q.isStalled,
      isUnassignedHighPriority: q.isUnassignedHighPriority,
      sortKey: q.ageInCurrentStatusSeconds,
    });
  }

  for (const r of followUps) {
    exceptions.push({
      kind: "follow_up_overdue",
      jobId: r.jobId,
      jobNumber: r.jobNumber,
      clientName: r.clientName,
      followUpAt: r.followUpAt,
      category: r.category,
      sortKey: r.ageSeconds,
    });
  }

  return exceptions.sort((a, b) => b.sortKey - a.sortKey);
}
