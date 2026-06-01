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

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  changeOrders,
  clients,
  dispatchAssignmentStatuses,
  jobVendorAssignments,
  jobs,
  vendors,
} from "@/server/schema";
import { operationalQueue } from "@/server/analytics/operational-queue";
import type { UrgencyTier } from "@/server/analytics/stalled-rules";

// ── Reader rows ───────────────────────────────────────────────────────────────────────

export type VendorNotAcceptedRow = {
  jobId: string;
  jobNumber: number;
  clientName: string;
  assignmentId: string;
  vendorName: string;
  sentAt: Date | null;
  ageSeconds: number;
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
    })
    .from(jobVendorAssignments)
    .innerJoin(
      dispatchAssignmentStatuses,
      eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id),
    )
    .innerJoin(jobs, eq(jobs.id, jobVendorAssignments.jobId))
    .innerJoin(clients, eq(clients.id, jobs.clientId))
    .innerJoin(vendors, eq(vendors.id, jobVendorAssignments.vendorId))
    .where(
      and(
        eq(jobVendorAssignments.tenantId, tenantId),
        eq(dispatchAssignmentStatuses.code, "SENT"),
      ),
    );
  return rows.map((r) => ({ ...r, ageSeconds: Number(r.ageSeconds) }));
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
  );

/**
 * The tenant-wide exception queue — composes the two net-new readers with a FILTERED
 * operationalQueue, into one list sorted by sortKey (elapsed seconds) DESC. Pure 'aged'
 * operational rows are EXCLUDED (only overdue/stalled/unassigned-high-priority qualify).
 */
export async function getExceptions(tenantId: string): Promise<Exception[]> {
  const [notAccepted, nteRequested, queue] = await Promise.all([
    listVendorNotAccepted(tenantId),
    listNteIncreaseRequested(tenantId),
    operationalQueue(tenantId, Number.MAX_SAFE_INTEGER),
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
      sortKey: r.ageSeconds,
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

  return exceptions.sort((a, b) => b.sortKey - a.sortKey);
}
