import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { jobStatuses, priorities } from "@/server/schema";

export type PriorityRow = typeof priorities.$inferSelect;
export type JobStatusRow = typeof jobStatuses.$inferSelect;

/** Active priorities for a tenant, most-urgent first (rank asc). Tenant-scoped. */
export async function listPrioritiesForTenant(
  tenantId: string,
): Promise<PriorityRow[]> {
  return db
    .select()
    .from(priorities)
    .where(and(eq(priorities.tenantId, tenantId), eq(priorities.status, "active")))
    .orderBy(priorities.rank);
}

/** One priority by id, scoped to the tenant. Null if missing/cross-tenant. */
export async function getPriority(
  tenantId: string,
  id: string,
): Promise<PriorityRow | null> {
  const rows = await db
    .select()
    .from(priorities)
    .where(and(eq(priorities.tenantId, tenantId), eq(priorities.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

/** All active job statuses, by sort order. GLOBAL — not tenant-scoped. */
export async function listActiveJobStatuses(): Promise<JobStatusRow[]> {
  return db
    .select()
    .from(jobStatuses)
    .where(eq(jobStatuses.status, "active"))
    .orderBy(jobStatuses.sortOrder);
}

/** One global job status by canonical code (e.g. "NEW"). Null if missing. */
export async function getJobStatusByCode(
  code: string,
): Promise<JobStatusRow | null> {
  const rows = await db
    .select()
    .from(jobStatuses)
    .where(eq(jobStatuses.code, code))
    .limit(1);
  return rows[0] ?? null;
}
