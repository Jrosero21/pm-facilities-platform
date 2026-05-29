import "server-only";

// ── Phase 9 batch 9c — STALLED-JOB COUNT (current-state) ──────────────────────────────
// "How many open jobs are stalled RIGHT NOW", per the stalled-rules thresholds (9c manifest §6/§9).
//
// POPULATION (dual-population rule, manifest §9): CURRENT-STATE reader → open = is_terminal=false AND
// is_archived=false (asks "what is actionable now", so archived/soft-deleted jobs are excluded).
//
// HYBRID (manifest §9): SQL fetches the cheap base data per open job — current status code, current
// dwell in seconds (NOW − the latest job_status_history entry, DB-computed so TZ-safe), the resolved
// scheduled-start inputs, and the on-site check-in count — and app code does the classification
// (threshold compare + the SCHEDULED-specific resolveScheduledStartAt/on-site rule).
//
// vendor_check_ins is keyed by assignment_id only (no job_id — corrects 9c.1 §2.B), so the on-site
// count joins vendor_check_ins → job_vendor_assignments on assignment_id to reach the job.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { jobStatuses, jobs } from "@/server/schema";
import { isStalled } from "@/server/analytics/stalled-rules";
import { resolveScheduledStartAt } from "@/server/analytics/resolve-scheduled-start-at";

function toDate(v: string | Date | null): Date | null {
  if (v == null) return null;
  return v instanceof Date ? v : new Date(v);
}

export async function countStalledJobs(
  tenantId: string,
): Promise<{ total: number; byStatus: Array<{ statusCode: string; count: number }> }> {
  const rows = await db
    .select({
      jobId: jobs.id,
      statusCode: jobStatuses.code,
      // current dwell in seconds — DB-computed (TZ-safe). Fallback to jobs.created_at if (somehow)
      // a job has no status-history rows.
      dwellSeconds: sql<number>`TIMESTAMPDIFF(SECOND, COALESCE((SELECT MAX(h.created_at) FROM job_status_history h WHERE h.job_id = ${jobs.id}), ${jobs.createdAt}), NOW())`,
      jobScheduledStartAt: jobs.scheduledStartAt,
      minAssignmentScheduledStartAt: sql<
        string | null
      >`(SELECT MIN(a.scheduled_start_at) FROM job_vendor_assignments a WHERE a.job_id = ${jobs.id})`,
      checkInCount: sql<number>`(SELECT COUNT(*) FROM vendor_check_ins v JOIN job_vendor_assignments a ON v.assignment_id = a.id WHERE a.job_id = ${jobs.id})`,
    })
    .from(jobs)
    .innerJoin(jobStatuses, eq(jobs.currentStatusId, jobStatuses.id))
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.isArchived, false), eq(jobStatuses.isTerminal, false)));

  const nowMs = Date.now();
  const byStatus = new Map<string, number>();
  let total = 0;

  for (const r of rows) {
    // Resolve the authoritative scheduled-start (job-level intent, else earliest assignment) and
    // delegate the classification to the shared `isStalled` predicate (single definition; also
    // consumed by operationalQueue).
    const scheduledStartAt = resolveScheduledStartAt(
      { scheduledStartAt: toDate(r.jobScheduledStartAt) },
      toDate(r.minAssignmentScheduledStartAt)
        ? [{ scheduledStartAt: toDate(r.minAssignmentScheduledStartAt) }]
        : [],
    );
    const stalled = isStalled({
      statusCode: r.statusCode,
      dwellSeconds: Number(r.dwellSeconds),
      scheduledStartAt,
      checkInCount: Number(r.checkInCount),
      nowMs,
    });

    if (stalled) {
      total++;
      byStatus.set(r.statusCode, (byStatus.get(r.statusCode) ?? 0) + 1);
    }
  }

  return {
    total,
    byStatus: [...byStatus.entries()]
      .map(([statusCode, count]) => ({ statusCode, count }))
      .sort((a, b) => a.statusCode.localeCompare(b.statusCode)),
  };
}
