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
      dwellSeconds: sql<number>`EXTRACT(EPOCH FROM (NOW() - COALESCE((SELECT MAX(h.created_at) FROM job_status_history h WHERE h.job_id = ${jobs.id}), ${jobs.createdAt})))::int`,
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

/**
 * (9f) Single-job counterpart to countStalledJobs — the SAME query shape + the SAME shared `isStalled`
 * predicate, scoped to one job, so the /jobs/[id] aging badge classifies IDENTICALLY to the dashboard
 * operational queue (no second code path to drift). Tenant-scoped (defends against cross-tenant id
 * injection via the URL). Returns null when the job is missing OR in a terminal status — no stalled
 * callout for closed jobs, mirroring the queue's `is_terminal=false` exclusion by construction. The
 * returned `dwellSeconds` lets a future caller surface "in <status> for <duration>" with no extra query.
 *
 * Pairs with countStalledJobs as the "aggregate + single-row" reader pattern: extract the predicate
 * (isStalled, 9c.6) → aggregate reader (countStalledJobs, 9c.5) → single-row reader (here, 9f) once a
 * consumer surfaces. Avoids cycling the all-job aggregate to classify one job.
 */
export async function isJobStalled(
  tenantId: string,
  jobId: string,
): Promise<{ isStalled: boolean; statusCode: string; dwellSeconds: number } | null> {
  const rows = await db
    .select({
      statusCode: jobStatuses.code,
      isTerminal: jobStatuses.isTerminal,
      // dwell + scheduled-start + check-in subqueries are VERBATIM from countStalledJobs (no drift).
      dwellSeconds: sql<number>`EXTRACT(EPOCH FROM (NOW() - COALESCE((SELECT MAX(h.created_at) FROM job_status_history h WHERE h.job_id = ${jobs.id}), ${jobs.createdAt})))::int`,
      jobScheduledStartAt: jobs.scheduledStartAt,
      minAssignmentScheduledStartAt: sql<
        string | null
      >`(SELECT MIN(a.scheduled_start_at) FROM job_vendor_assignments a WHERE a.job_id = ${jobs.id})`,
      checkInCount: sql<number>`(SELECT COUNT(*) FROM vendor_check_ins v JOIN job_vendor_assignments a ON v.assignment_id = a.id WHERE a.job_id = ${jobs.id})`,
    })
    .from(jobs)
    .innerJoin(jobStatuses, eq(jobs.currentStatusId, jobStatuses.id))
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId)))
    .limit(1);

  const r = rows[0];
  if (!r) return null; // missing or cross-tenant
  if (r.isTerminal) return null; // terminal status → no aging callout (matches the queue's exclusion)

  const scheduledStartAt = resolveScheduledStartAt(
    { scheduledStartAt: toDate(r.jobScheduledStartAt) },
    toDate(r.minAssignmentScheduledStartAt)
      ? [{ scheduledStartAt: toDate(r.minAssignmentScheduledStartAt) }]
      : [],
  );
  const dwellSeconds = Number(r.dwellSeconds);
  const stalled = isStalled({
    statusCode: r.statusCode,
    dwellSeconds,
    scheduledStartAt,
    checkInCount: Number(r.checkInCount),
    nowMs: Date.now(),
  });
  return { isStalled: stalled, statusCode: r.statusCode, dwellSeconds };
}
