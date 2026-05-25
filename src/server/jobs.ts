import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import {
  auditLogs,
  clientLocations,
  clients,
  jobEvents,
  jobStatusHistory,
  jobStatuses,
  jobs,
  priorities,
  tenantJobSequences,
} from "@/server/schema";
import { getClient } from "@/server/clients";
import { getLocation } from "@/server/client-locations";
import { getJobStatusByCode, getPriority } from "@/server/job-reference";
import { getTrade } from "@/server/trades";

export type JobRow = typeof jobs.$inferSelect;
// 8-value union derived from the schema enum (no drift).
export type JobSourceType = NonNullable<
  (typeof jobs.$inferInsert)["sourceType"]
>;

// Every new job starts at the global "NEW" status — a convention enforced here,
// in one place, so callers never pass an initial status (D-4.x).
const INITIAL_STATUS_CODE = "NEW";

export type JobListItem = {
  id: string;
  jobNumber: number;
  clientName: string;
  locationName: string;
  statusName: string;
  priorityName: string | null;
  createdAt: Date;
};

/**
 * Non-archived jobs for a tenant, newest first. Joined to the display labels the
 * list page renders (client / location / status names, priority name nullable
 * since priority_id is nullable). No pagination yet (carry-forward).
 */
export async function listJobs(tenantId: string): Promise<JobListItem[]> {
  return db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      clientName: clients.name,
      locationName: clientLocations.name,
      statusName: jobStatuses.name,
      priorityName: priorities.name,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .innerJoin(clientLocations, eq(jobs.clientLocationId, clientLocations.id))
    .innerJoin(jobStatuses, eq(jobs.currentStatusId, jobStatuses.id))
    .leftJoin(priorities, eq(jobs.priorityId, priorities.id))
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.isArchived, false)))
    .orderBy(desc(jobs.createdAt));
}

/**
 * One job by id, scoped to the tenant. Lean — just the jobs row (the detail page
 * composes related data via separate calls). Null if missing/cross-tenant.
 */
export async function getJob(tenantId: string, id: string): Promise<JobRow | null> {
  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export type CreateJobInput = {
  tenantId: string;
  clientId: string;
  clientLocationId: string;
  primaryTradeId?: string | null;
  priorityId?: string | null;
  sourceType?: JobSourceType;
  sourceExternalId?: string | null;
  problemDescription: string;
  scopeOfWork?: string | null;
  createdByUserId: string;
};

/**
 * Create a job. Parent-in-tenant guards run first (read-only); the 7-step
 * mutation then runs in ONE transaction (D-4.5/D-4.6): ensure+lock the per-tenant
 * counter, insert the job with the allocated job_number and the initial NEW
 * status, bump the counter, write the initial status-history row, the job.created
 * timeline event, and the audit_logs row (the audit insert is INSIDE the txn —
 * atomicity over resilience for multi-row writes; D-4.x).
 *
 * Throws: CLIENT_NOT_FOUND, LOCATION_NOT_FOUND, LOCATION_CLIENT_MISMATCH,
 * TRADE_NOT_FOUND (if trade given), PRIORITY_NOT_FOUND (if priority given),
 * STATUS_NOT_FOUND (defensive — NEW status missing; shouldn't fire if seeded).
 */
export async function createJob(input: CreateJobInput): Promise<JobRow> {
  // --- parent-in-tenant guards (read-only; no need to be inside the txn) ---
  const client = await getClient(input.tenantId, input.clientId);
  if (!client) throw new Error("CLIENT_NOT_FOUND");

  const location = await getLocation(input.tenantId, input.clientLocationId);
  if (!location) throw new Error("LOCATION_NOT_FOUND");
  if (location.clientId !== input.clientId) throw new Error("LOCATION_CLIENT_MISMATCH");

  if (input.priorityId) {
    const priority = await getPriority(input.tenantId, input.priorityId);
    if (!priority) throw new Error("PRIORITY_NOT_FOUND");
  }

  if (input.primaryTradeId) {
    const trade = await getTrade(input.primaryTradeId);
    if (!trade) throw new Error("TRADE_NOT_FOUND");
  }

  const initialStatus = await getJobStatusByCode(INITIAL_STATUS_CODE);
  if (!initialStatus) throw new Error("STATUS_NOT_FOUND");

  const jobId = uuidv7();
  const sourceType: JobSourceType = input.sourceType ?? "manual";

  await db.transaction(async (tx) => {
    // 1. Ensure the tenant's sequence row exists (idempotent, race-safe).
    await tx.execute(sql`
      INSERT INTO tenant_job_sequences (tenant_id, next_number)
      VALUES (${input.tenantId}, 1)
      ON DUPLICATE KEY UPDATE next_number = next_number
    `);

    // 2. Lock the sequence row and read the number to assign.
    const seqRows = await tx
      .select({ nextNumber: tenantJobSequences.nextNumber })
      .from(tenantJobSequences)
      .where(eq(tenantJobSequences.tenantId, input.tenantId))
      .for("update");
    const n = seqRows[0].nextNumber;

    // 3. Insert the job with the allocated number and the initial status.
    await tx.insert(jobs).values({
      id: jobId,
      tenantId: input.tenantId,
      jobNumber: n,
      clientId: input.clientId,
      clientLocationId: input.clientLocationId,
      primaryTradeId: input.primaryTradeId ?? null,
      priorityId: input.priorityId ?? null,
      currentStatusId: initialStatus.id,
      sourceType,
      sourceExternalId: input.sourceExternalId ?? null,
      problemDescription: input.problemDescription,
      scopeOfWork: input.scopeOfWork ?? null,
      createdByUserId: input.createdByUserId,
    });

    // 4. Bump the counter.
    await tx
      .update(tenantJobSequences)
      .set({ nextNumber: n + 1 })
      .where(eq(tenantJobSequences.tenantId, input.tenantId));

    // 5. Initial status-history row (from null → NEW; changed_by = creator, D-4.x).
    await tx.insert(jobStatusHistory).values({
      tenantId: input.tenantId,
      jobId,
      fromStatusId: null,
      toStatusId: initialStatus.id,
      changedByUserId: input.createdByUserId,
    });

    // 6. Timeline event.
    await tx.insert(jobEvents).values({
      tenantId: input.tenantId,
      jobId,
      eventType: "job.created",
      actorUserId: input.createdByUserId,
      summary: `Job #${n} created`,
      metadata: { jobNumber: n, sourceType, clientId: input.clientId },
    });

    // 7. Audit row — INSIDE the transaction (atomicity over resilience; D-4.x).
    //    Deliberately a direct tx.insert, NOT writeAuditLog() (which uses the
    //    global db and swallows errors).
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.createdByUserId,
      action: "job.created",
      targetType: "job",
      targetId: jobId,
      metadata: { jobNumber: n, clientId: input.clientId, sourceType },
    });
  });

  const row = await getJob(input.tenantId, jobId);
  if (!row) throw new Error("Job insert succeeded but row could not be reloaded.");
  return row;
}
