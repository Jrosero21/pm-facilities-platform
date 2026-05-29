import "server-only";

// ── Phase 9 batch 9c — TIME-TO-DISPATCH DISTRIBUTION (history-anchored) ───────────────
// Tenant-wide distribution of "time from job creation to first vendor assignment" (9c manifest
// §5A/§9). One interval per job that HAS at least one assignment (INNER JOIN drops never-dispatched
// jobs — the metric doesn't apply to them). Single tenant-wide distribution; a by-trade / by-priority
// breakdown is a future enhancement (manifest §5A).
//
// POPULATION (dual-population rule, manifest §9): HISTORICAL-DISTRIBUTION reader → INCLUDES
// since-archived jobs (no is_archived filter). Percentile math app-side via the shared
// summarizeSeconds helper (one summary helper for 9c, defined in time-in-status.ts).

import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { jobVendorAssignments, jobs } from "@/server/schema";
import { summarizeSeconds } from "@/server/analytics/percentile";

export type DispatchTimingResult = {
  count: number;
  p50Seconds: number;
  p90Seconds: number;
  meanSeconds: number;
};

export async function timeToDispatchDistribution(tenantId: string): Promise<DispatchTimingResult> {
  // Per job (with ≥1 assignment): seconds from job.created_at to the EARLIEST assignment.created_at.
  const rows = await db
    .select({
      jobId: jobs.id,
      seconds: sql<
        number | null
      >`TIMESTAMPDIFF(SECOND, ${jobs.createdAt}, MIN(${jobVendorAssignments.createdAt}))`,
    })
    .from(jobs)
    .innerJoin(jobVendorAssignments, eq(jobVendorAssignments.jobId, jobs.id))
    .where(eq(jobs.tenantId, tenantId))
    .groupBy(jobs.id, jobs.createdAt);

  const values = rows
    .map((r) => Number(r.seconds))
    .filter((s) => Number.isFinite(s));
  return summarizeSeconds(values);
}
