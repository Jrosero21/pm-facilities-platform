import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { dispatchAssignmentStatuses } from "@/server/schema";

export type DispatchAssignmentStatusRow =
  typeof dispatchAssignmentStatuses.$inferSelect;

/** All active dispatch statuses, by sort order. GLOBAL — not tenant-scoped. */
export async function listActiveDispatchStatuses(): Promise<
  DispatchAssignmentStatusRow[]
> {
  return db
    .select()
    .from(dispatchAssignmentStatuses)
    .where(eq(dispatchAssignmentStatuses.status, "active"))
    .orderBy(dispatchAssignmentStatuses.sortOrder);
}

/**
 * One global dispatch status by canonical code (e.g. "DRAFT", "SENT"). Null if
 * missing. Mirrors getJobStatusByCode — dispatch statuses are GLOBAL reference
 * data (D-4.1), so no tenant parameter. createDispatch resolves DRAFT;
 * sendDispatch resolves DRAFT (guard) and SENT (target).
 */
export async function getDispatchAssignmentStatusByCode(
  code: string,
): Promise<DispatchAssignmentStatusRow | null> {
  const rows = await db
    .select()
    .from(dispatchAssignmentStatuses)
    .where(eq(dispatchAssignmentStatuses.code, code))
    .limit(1);
  return rows[0] ?? null;
}
