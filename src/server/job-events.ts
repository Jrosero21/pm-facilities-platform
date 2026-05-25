import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { jobEvents, users } from "@/server/schema";

export type JobEventListItem = {
  id: string;
  eventType: string;
  summary: string;
  actorName: string | null;
  createdAt: Date;
};

/**
 * Events for a job, oldest first (timeline order). Left-joins users for the
 * actor name (null for system/external events). Read-only — events are written
 * inside createJob's transaction, not by a create function here.
 */
export async function listJobEvents(
  tenantId: string,
  jobId: string,
): Promise<JobEventListItem[]> {
  return db
    .select({
      id: jobEvents.id,
      eventType: jobEvents.eventType,
      summary: jobEvents.summary,
      actorName: users.name,
      createdAt: jobEvents.createdAt,
    })
    .from(jobEvents)
    .leftJoin(users, eq(jobEvents.actorUserId, users.id))
    .where(and(eq(jobEvents.tenantId, tenantId), eq(jobEvents.jobId, jobId)))
    .orderBy(asc(jobEvents.createdAt));
}
