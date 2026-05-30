import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { jobs, clients, clientLocations, jobStatuses } from "@/server/schema";

/**
 * Lists jobs visible to a client user in the active tenant.
 *
 * JOB-PRIMARY (twins the aggregator listJobs, NOT the vendor assignment reader):
 * clients own jobs directly via jobs.client_id, so the filter is
 * inArray(jobs.clientId, scope) — no assignment join. Current-state reader →
 * filters is_archived=false (dual-population rule, Phase 9 foundational principle 2).
 *
 * Selects ONLY client-safe columns (11d fork): job number, problem description,
 * status name, location name, created_at. EXCLUDES not_to_exceed_amount, scope_*
 * text, vendor/assignment data, and financials — operator-internal fields never
 * reach the client surface.
 *
 * Empty scope short-circuits to [] (inArray with [] is dialect-specific; bypass).
 * Tenant filter retained alongside the scope filter for defense-in-depth.
 *
 * Phase 11 batch 11d.
 */
export async function listClientJobs(
  tenantId: string,
  clientScope: Set<string>,
) {
  if (clientScope.size === 0) {
    return [];
  }
  return db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      problemDescription: jobs.problemDescription,
      statusName: jobStatuses.name,
      locationName: clientLocations.name,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .innerJoin(clientLocations, eq(jobs.clientLocationId, clientLocations.id))
    .innerJoin(jobStatuses, eq(jobs.currentStatusId, jobStatuses.id))
    .where(
      and(
        eq(jobs.tenantId, tenantId),
        inArray(jobs.clientId, [...clientScope]),
        eq(jobs.isArchived, false),
      ),
    )
    .orderBy(desc(jobs.createdAt));
}

export type ClientJobListRow = Awaited<ReturnType<typeof listClientJobs>>[number];
