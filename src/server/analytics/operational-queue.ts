import "server-only";

// ── Phase 9 batch 9c — OPERATIONAL QUEUE (composite, current-state) ───────────────────
// "What needs attention now" — the action-oriented queue (design proposal §3; 9c manifest §3/§5B/§9).
// One base SQL query returns the tenant's OPEN population (current-state: is_terminal=false AND
// is_archived=false) with the computed-on-read fields the UI renders; APP CODE then classifies each
// row into an urgency tier, sorts by the §5 precedence, and slices to `limit`.
//
// EXPLICIT, APPROVED DEVIATION from the Phase-8 "SQL does the work" convention (manifest §9 +
// closeout 02-decisions.md): the multi-signal tier precedence (stalled > overdue >
// unassigned-high-priority > aged) is more legible and testable in TS than nested SQL CASE; volume
// is small post-filter. The base query stays unbounded (no SQL LIMIT) — the tier sort happens over
// the full open set before slicing, so the top-N reflects true cross-tier precedence, not SQL order.
//
// isStalled is the shared predicate from stalled-rules.ts (same definition countStalledJobs uses).
// vendor_check_ins is assignment_id-keyed → the on-site count joins through job_vendor_assignments.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { clientLocations, clients, jobStatuses, jobs, priorities } from "@/server/schema";
import {
  HIGH_PRIORITY_RANK_CUTOFF,
  URGENCY_TIER_ORDER,
  isStalled,
  type UrgencyTier,
} from "@/server/analytics/stalled-rules";
import { resolveScheduledStartAt } from "@/server/analytics/resolve-scheduled-start-at";

export type QueueEntry = {
  jobId: string;
  jobNumber: number;
  clientName: string;
  clientLocationName: string | null;
  statusCode: string;
  statusLabel: string;
  priorityCode: string | null;
  priorityRank: number | null;
  currentStatusEnteredAt: Date;
  ageInCurrentStatusSeconds: number;
  dueAt: Date | null;
  isOverdue: boolean;
  isStalled: boolean;
  isUnassignedHighPriority: boolean;
  urgencyTier: UrgencyTier;
  assignmentCount: number;
};

function toDate(v: string | Date | null): Date | null {
  if (v == null) return null;
  return v instanceof Date ? v : new Date(v);
}

export async function operationalQueue(tenantId: string, limit = 20): Promise<QueueEntry[]> {
  // Base query: ALL open jobs for the tenant (unbounded — tier sort precedes the limit). dwell and
  // the current-status entered-at are DB-computed (TZ-safe); assignment + on-site counts and the
  // scheduled-start inputs come via correlated subqueries (cheap at this volume).
  const enteredAtExpr = sql`COALESCE((SELECT MAX(h.created_at) FROM job_status_history h WHERE h.job_id = ${jobs.id}), ${jobs.createdAt})`;
  const rows = await db
    .select({
      jobId: jobs.id,
      jobNumber: jobs.jobNumber,
      clientName: clients.name,
      clientLocationName: clientLocations.name,
      statusCode: jobStatuses.code,
      statusLabel: jobStatuses.name,
      priorityCode: priorities.code,
      priorityRank: priorities.rank,
      dueAt: jobs.dueAt,
      createdAt: jobs.createdAt,
      currentStatusEnteredAt: sql<string | Date>`${enteredAtExpr}`,
      ageInCurrentStatusSeconds: sql<number>`EXTRACT(EPOCH FROM (NOW() - ${enteredAtExpr}))::int`,
      assignmentCount: sql<number>`(SELECT COUNT(*) FROM job_vendor_assignments a WHERE a.job_id = ${jobs.id})`,
      checkInCount: sql<number>`(SELECT COUNT(*) FROM vendor_check_ins v JOIN job_vendor_assignments a ON v.assignment_id = a.id WHERE a.job_id = ${jobs.id})`,
      jobScheduledStartAt: jobs.scheduledStartAt,
      minAssignmentScheduledStartAt: sql<
        string | null
      >`(SELECT MIN(a.scheduled_start_at) FROM job_vendor_assignments a WHERE a.job_id = ${jobs.id})`,
    })
    .from(jobs)
    .innerJoin(jobStatuses, eq(jobs.currentStatusId, jobStatuses.id))
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .innerJoin(clientLocations, eq(jobs.clientLocationId, clientLocations.id))
    .leftJoin(priorities, eq(jobs.priorityId, priorities.id))
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.isArchived, false), eq(jobStatuses.isTerminal, false)));

  const nowMs = Date.now();

  const classified = rows.map((r) => {
    const ageInCurrentStatusSeconds = Number(r.ageInCurrentStatusSeconds);
    const assignmentCount = Number(r.assignmentCount);
    const checkInCount = Number(r.checkInCount);

    const scheduledStartAt = resolveScheduledStartAt(
      { scheduledStartAt: toDate(r.jobScheduledStartAt) },
      toDate(r.minAssignmentScheduledStartAt)
        ? [{ scheduledStartAt: toDate(r.minAssignmentScheduledStartAt) }]
        : [],
    );

    const stalled = isStalled({
      statusCode: r.statusCode,
      dwellSeconds: ageInCurrentStatusSeconds,
      scheduledStartAt,
      checkInCount,
      nowMs,
    });
    const dueAt = toDate(r.dueAt);
    const isOverdue = dueAt !== null && dueAt.getTime() < nowMs;
    const isUnassignedHighPriority =
      r.priorityRank !== null && r.priorityRank <= HIGH_PRIORITY_RANK_CUTOFF && assignmentCount === 0;

    // Precedence (design §5), first match wins:
    const urgencyTier: UrgencyTier = stalled
      ? "stalled"
      : isOverdue
        ? "overdue"
        : isUnassignedHighPriority
          ? "unassigned-high-priority"
          : "aged";

    const entry: QueueEntry = {
      jobId: r.jobId,
      jobNumber: r.jobNumber,
      clientName: r.clientName,
      clientLocationName: r.clientLocationName,
      statusCode: r.statusCode,
      statusLabel: r.statusLabel,
      priorityCode: r.priorityCode,
      priorityRank: r.priorityRank,
      currentStatusEnteredAt: toDate(r.currentStatusEnteredAt) ?? toDate(r.createdAt)!,
      ageInCurrentStatusSeconds,
      dueAt,
      isOverdue,
      isStalled: stalled,
      isUnassignedHighPriority,
      urgencyTier,
      assignmentCount,
    };
    return { entry, createdAtMs: toDate(r.createdAt)?.getTime() ?? 0 };
  });

  // Sort: urgency tier (precedence order) → longest dwell first → oldest created_at first (design §3).
  classified.sort((a, b) => {
    const tierDelta =
      URGENCY_TIER_ORDER.indexOf(a.entry.urgencyTier) - URGENCY_TIER_ORDER.indexOf(b.entry.urgencyTier);
    if (tierDelta !== 0) return tierDelta;
    if (b.entry.ageInCurrentStatusSeconds !== a.entry.ageInCurrentStatusSeconds) {
      return b.entry.ageInCurrentStatusSeconds - a.entry.ageInCurrentStatusSeconds;
    }
    return a.createdAtMs - b.createdAtMs;
  });

  return classified.slice(0, limit).map((c) => c.entry);
}
