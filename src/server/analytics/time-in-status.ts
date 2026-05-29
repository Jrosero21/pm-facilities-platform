import "server-only";

// ── Phase 9 batch 9c — TIME-IN-STATUS DISTRIBUTION (history-anchored) ─────────────────
// Per-status dwell-time distribution from job_status_history (9c manifest §5A/§9). Window-function
// territory — NO Phase-8 precedent (billing readers are scalar COUNT/SUM), so this establishes the
// local convention: SQL computes per-interval durations via LAG()+TIMESTAMPDIFF; percentile math is
// app-side (PERCENTILE_CONT is window-only on MariaDB 11.4.10 — awkward for one-row-per-group).
//
// POPULATION (dual-population rule, manifest §9): this is a HISTORICAL-DISTRIBUTION reader, so it
// INCLUDES since-archived jobs (a completed interval is real historical performance; tenant-scoped
// via job_status_history.tenant_id — no is_archived filter).
//
// ATTRIBUTION: an interval is the dwell of the status the job just DEPARTED — i.e. the current row's
// from_status_id (== the previous row's to_status_id). Its duration = created_at − LAG(created_at)
// over (partition by job, order by created_at). COMPLETED-INTERVALS-ONLY: the first row per job has
// LAG = NULL (no predecessor) and is dropped; the still-open current interval is never emitted here
// (it is right-censored — surfaced by countStalledJobs / operationalQueue instead, never mixed into
// these percentiles).

import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { jobStatusHistory, jobStatuses } from "@/server/schema";
import { summarizeSeconds } from "@/server/analytics/percentile";

export type TimeInStatusResult = Array<{
  statusId: string;
  statusCode: string;
  statusLabel: string;
  category: string;
  count: number;
  p50Seconds: number;
  p90Seconds: number;
  meanSeconds: number;
}>;

export async function timeInStatusDistribution(tenantId: string): Promise<TimeInStatusResult> {
  // One row per status-history transition; dwellS = duration of the just-departed status
  // (from_status_id), NULL for the first row per job (right-censored open / no-predecessor → dropped).
  const intervals = await db
    .select({
      statusId: jobStatusHistory.fromStatusId,
      dwellS: sql<
        number | null
      >`TIMESTAMPDIFF(SECOND, LAG(${jobStatusHistory.createdAt}) OVER (PARTITION BY ${jobStatusHistory.jobId} ORDER BY ${jobStatusHistory.createdAt}, ${jobStatusHistory.id}), ${jobStatusHistory.createdAt})`,
    })
    .from(jobStatusHistory)
    .where(eq(jobStatusHistory.tenantId, tenantId));

  const byStatus = new Map<string, number[]>();
  for (const r of intervals) {
    if (r.statusId == null || r.dwellS == null) continue; // completed-intervals-only
    const s = Number(r.dwellS);
    if (!Number.isFinite(s)) continue;
    const arr = byStatus.get(r.statusId);
    if (arr) arr.push(s);
    else byStatus.set(r.statusId, [s]);
  }
  if (byStatus.size === 0) return [];

  // Label + ordering from the global status vocabulary (terminal statuses included — a job can dwell
  // in COMPLETED before CLOSED; "time in status" is meaningful for any status with history).
  const statuses = await db
    .select({
      id: jobStatuses.id,
      code: jobStatuses.code,
      name: jobStatuses.name,
      category: jobStatuses.category,
    })
    .from(jobStatuses)
    .orderBy(jobStatuses.sortOrder);

  const out: TimeInStatusResult = [];
  for (const st of statuses) {
    const vals = byStatus.get(st.id);
    if (!vals || vals.length === 0) continue; // statuses with no completed intervals are omitted
    out.push({
      statusId: st.id,
      statusCode: st.code,
      statusLabel: st.name,
      category: st.category,
      ...summarizeSeconds(vals),
    });
  }
  return out;
}
