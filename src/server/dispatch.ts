import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import {
  auditLogs,
  dispatchAssignmentStatuses,
  jobEvents,
  jobStatusHistory,
  jobStatuses,
  jobVendorAssignments,
  jobVendorAssignmentStatusHistory,
  jobs,
  trades,
  vendorContacts,
  vendorLocations,
  vendors,
} from "@/server/schema";
import { getJob } from "@/server/jobs";
import { getVendor } from "@/server/vendors";
import { getVendorLocation } from "@/server/vendor-locations";
import { getVendorContact } from "@/server/vendor-contacts";
import { getDispatchAssignmentStatusByCode } from "@/server/dispatch-reference";
import { branchCoversTrade } from "@/server/vendor-trade-coverage";
import { findCandidateVendorsForJob } from "@/server/vendor-matching";

export type JobVendorAssignmentRow = typeof jobVendorAssignments.$inferSelect;

// Job-status gating for sendDispatch (R-2a, 06-business-rules.md):
//   DISPATCHABLE — sendDispatch accepts a send from a job in these states.
//   ADVANCE_FROM — ...and advances the job to DISPATCHED only from these.
// ON_HOLD is dispatchable but does NOT advance: lifting a hold is an explicit
// operator action, never an implicit side effect of dispatch (explicit-workflow-
// transitions rule). Re-dispatch from DISPATCHED/IN_PROGRESS is a no-op on the
// job status (never regresses IN_PROGRESS).
const DISPATCHABLE_JOB_CODES: string[] = [
  "NEW",
  "SCHEDULED",
  "DISPATCHED",
  "IN_PROGRESS",
  "ON_HOLD",
];
const ADVANCE_FROM_JOB_CODES: string[] = ["NEW", "SCHEDULED"];
const DISPATCHED_JOB_CODE = "DISPATCHED";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** One assignment by id, tenant-scoped. Lean — for guards + post-write reload. */
export async function getAssignment(
  tenantId: string,
  id: string,
): Promise<JobVendorAssignmentRow | null> {
  const rows = await db
    .select()
    .from(jobVendorAssignments)
    .where(
      and(
        eq(jobVendorAssignments.tenantId, tenantId),
        eq(jobVendorAssignments.id, id),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Assignments for a job, newest first, with display labels (5d dispatch section). */
export async function listAssignmentsForJob(tenantId: string, jobId: string) {
  return db
    .select({
      id: jobVendorAssignments.id,
      vendorId: jobVendorAssignments.vendorId,
      vendorName: vendors.name,
      vendorLocationName: vendorLocations.name,
      vendorContactName: vendorContacts.name,
      statusCode: dispatchAssignmentStatuses.code,
      statusName: dispatchAssignmentStatuses.name,
      statusCategory: dispatchAssignmentStatuses.category,
      matchedTradeName: trades.name,
      matchedTradeWasPrimary: jobVendorAssignments.matchedTradeWasPrimary,
      tightestGeoAtDispatch: jobVendorAssignments.tightestGeoAtDispatch,
      complianceStatusAtDispatch: jobVendorAssignments.complianceStatusAtDispatch,
      agreedNteAmount: jobVendorAssignments.agreedNteAmount,
      scheduledStartAt: jobVendorAssignments.scheduledStartAt,
      sentAt: jobVendorAssignments.sentAt,
      createdAt: jobVendorAssignments.createdAt,
    })
    .from(jobVendorAssignments)
    .innerJoin(vendors, eq(jobVendorAssignments.vendorId, vendors.id))
    .innerJoin(
      dispatchAssignmentStatuses,
      eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id),
    )
    .innerJoin(trades, eq(jobVendorAssignments.matchedTradeId, trades.id))
    .leftJoin(
      vendorLocations,
      eq(jobVendorAssignments.vendorLocationId, vendorLocations.id),
    )
    .leftJoin(
      vendorContacts,
      eq(jobVendorAssignments.vendorContactId, vendorContacts.id),
    )
    .where(
      and(
        eq(jobVendorAssignments.tenantId, tenantId),
        eq(jobVendorAssignments.jobId, jobId),
      ),
    )
    .orderBy(desc(jobVendorAssignments.createdAt));
}

export type AssignmentListItem = Awaited<
  ReturnType<typeof listAssignmentsForJob>
>[number];

/** One assignment with joined display labels + the facet snapshot (5d detail). */
export async function getAssignmentDetail(tenantId: string, id: string) {
  const rows = await db
    .select({
      id: jobVendorAssignments.id,
      jobId: jobVendorAssignments.jobId,
      jobNumber: jobs.jobNumber,
      vendorId: jobVendorAssignments.vendorId,
      vendorName: vendors.name,
      vendorLocationId: jobVendorAssignments.vendorLocationId,
      vendorLocationName: vendorLocations.name,
      vendorContactId: jobVendorAssignments.vendorContactId,
      vendorContactName: vendorContacts.name,
      statusCode: dispatchAssignmentStatuses.code,
      statusName: dispatchAssignmentStatuses.name,
      statusCategory: dispatchAssignmentStatuses.category,
      agreedNteAmount: jobVendorAssignments.agreedNteAmount,
      scheduledStartAt: jobVendorAssignments.scheduledStartAt,
      scheduledEndAt: jobVendorAssignments.scheduledEndAt,
      dispatchScope: jobVendorAssignments.dispatchScope,
      matchedTradeId: jobVendorAssignments.matchedTradeId,
      matchedTradeName: trades.name,
      matchedTradeWasPrimary: jobVendorAssignments.matchedTradeWasPrimary,
      tightestGeoAtDispatch: jobVendorAssignments.tightestGeoAtDispatch,
      matchedGeoTypesAtDispatch: jobVendorAssignments.matchedGeoTypesAtDispatch,
      complianceStatusAtDispatch: jobVendorAssignments.complianceStatusAtDispatch,
      chosenBranchCoveredTrade: jobVendorAssignments.chosenBranchCoveredTrade,
      sentAt: jobVendorAssignments.sentAt,
      createdAt: jobVendorAssignments.createdAt,
      updatedAt: jobVendorAssignments.updatedAt,
    })
    .from(jobVendorAssignments)
    .innerJoin(jobs, eq(jobVendorAssignments.jobId, jobs.id))
    .innerJoin(vendors, eq(jobVendorAssignments.vendorId, vendors.id))
    .innerJoin(
      dispatchAssignmentStatuses,
      eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id),
    )
    .innerJoin(trades, eq(jobVendorAssignments.matchedTradeId, trades.id))
    .leftJoin(
      vendorLocations,
      eq(jobVendorAssignments.vendorLocationId, vendorLocations.id),
    )
    .leftJoin(
      vendorContacts,
      eq(jobVendorAssignments.vendorContactId, vendorContacts.id),
    )
    .where(
      and(
        eq(jobVendorAssignments.tenantId, tenantId),
        eq(jobVendorAssignments.id, id),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export type AssignmentDetail = NonNullable<
  Awaited<ReturnType<typeof getAssignmentDetail>>
>;

// ---------------------------------------------------------------------------
// createDispatch — single-entity, 3-write txn, modeled on createJob.
// Lands the assignment at DRAFT. NO job_events row and NO job-side status change
// (a draft is operator workspace, not a job milestone — R1).
// ---------------------------------------------------------------------------

export type CreateDispatchInput = {
  tenantId: string;
  jobId: string;
  vendorId: string;
  vendorLocationId?: string | null;
  vendorContactId?: string | null;
  agreedNteAmount?: string | null;
  scheduledStartAt?: Date | null;
  scheduledEndAt?: Date | null;
  dispatchScope?: string | null;
  // string for a human operator; null for a system actor (Phase 22 auto-dispatch).
  // All three write targets (assignment / status-history / audit) are nullable.
  createdByUserId: string | null;
};

/**
 * Throws: JOB_NOT_FOUND, JOB_NOT_DISPATCHABLE (no primary trade), VENDOR_NOT_FOUND,
 * VENDOR_LOCATION_NOT_FOUND, VENDOR_LOCATION_VENDOR_MISMATCH, VENDOR_CONTACT_NOT_FOUND,
 * VENDOR_CONTACT_VENDOR_MISMATCH, STATUS_NOT_FOUND (DRAFT missing — defensive),
 * VENDOR_NO_LONGER_CANDIDATE (vendor dropped out of the matcher since form load).
 */
export async function createDispatch(
  input: CreateDispatchInput,
): Promise<JobVendorAssignmentRow> {
  // --- parent guards (read-only, before the txn) ---
  const job = await getJob(input.tenantId, input.jobId);
  if (!job) throw new Error("JOB_NOT_FOUND");
  // No trade ⇒ the matcher can't run; nothing to dispatch against.
  if (!job.primaryTradeId) throw new Error("JOB_NOT_DISPATCHABLE");
  const tradeId = job.primaryTradeId;

  const vendor = await getVendor(input.tenantId, input.vendorId);
  if (!vendor) throw new Error("VENDOR_NOT_FOUND");

  if (input.vendorLocationId) {
    const loc = await getVendorLocation(input.tenantId, input.vendorLocationId);
    if (!loc) throw new Error("VENDOR_LOCATION_NOT_FOUND");
    if (loc.vendorId !== input.vendorId)
      throw new Error("VENDOR_LOCATION_VENDOR_MISMATCH");
  }
  if (input.vendorContactId) {
    const contact = await getVendorContact(input.tenantId, input.vendorContactId);
    if (!contact) throw new Error("VENDOR_CONTACT_NOT_FOUND");
    if (contact.vendorId !== input.vendorId)
      throw new Error("VENDOR_CONTACT_VENDOR_MISMATCH");
  }

  const draftStatus = await getDispatchAssignmentStatusByCode("DRAFT");
  if (!draftStatus) throw new Error("STATUS_NOT_FOUND");

  // Facet snapshot — re-derive the matcher server-side (the UI's run was
  // display-only). Reject if the chosen vendor is no longer a candidate.
  const candidates = await findCandidateVendorsForJob(input.tenantId, input.jobId);
  const candidate = candidates.find((c) => c.vendorId === input.vendorId);
  if (!candidate) throw new Error("VENDOR_NO_LONGER_CANDIDATE");

  // chosen_branch_covered_trade: only meaningful when a branch was picked.
  const chosenBranchCoveredTrade = input.vendorLocationId
    ? await branchCoversTrade(input.tenantId, input.vendorLocationId, tradeId)
    : null;

  // dispatch_scope: operator-editable snapshot — explicit input wins, else snapshot
  // the job's approved (then current) scope (lock (e)). Immutable once written.
  const dispatchScope =
    input.dispatchScope !== undefined
      ? input.dispatchScope
      : (job.approvedScopeOfWork ?? job.scopeOfWork ?? null);

  const assignmentId = uuidv7();

  await db.transaction(async (tx) => {
    // 1. the assignment row (DRAFT + immutable facet snapshot)
    await tx.insert(jobVendorAssignments).values({
      id: assignmentId,
      tenantId: input.tenantId,
      jobId: input.jobId,
      vendorId: input.vendorId,
      vendorLocationId: input.vendorLocationId ?? null,
      vendorContactId: input.vendorContactId ?? null,
      currentStatusId: draftStatus.id,
      agreedNteAmount: input.agreedNteAmount ?? null,
      scheduledStartAt: input.scheduledStartAt ?? null,
      scheduledEndAt: input.scheduledEndAt ?? null,
      dispatchScope,
      matchedTradeId: tradeId,
      matchedTradeWasPrimary: candidate.primaryTradeMatch,
      tightestGeoAtDispatch: candidate.tightestGeoMatch,
      matchedGeoTypesAtDispatch: candidate.geoMatchTypes,
      complianceStatusAtDispatch: candidate.complianceStatus,
      chosenBranchCoveredTrade,
      createdByUserId: input.createdByUserId,
    });

    // 2. initial status-history row (null → DRAFT; changed_by = creator)
    await tx.insert(jobVendorAssignmentStatusHistory).values({
      tenantId: input.tenantId,
      assignmentId,
      fromStatusId: null,
      toStatusId: draftStatus.id,
      changedByUserId: input.createdByUserId,
    });

    // 3. audit — INSIDE the txn (R-4.5). NO job_events (R1: drafts off the timeline).
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.createdByUserId,
      action: "job_vendor_assignment.created",
      targetType: "job_vendor_assignment",
      targetId: assignmentId,
      metadata: {
        jobId: input.jobId,
        vendorId: input.vendorId,
        status: "DRAFT",
      },
    });
  });

  const row = await getAssignment(input.tenantId, assignmentId);
  if (!row)
    throw new Error("Assignment insert succeeded but row could not be reloaded.");
  return row;
}

// ---------------------------------------------------------------------------
// sendDispatch — dual-entity transactional. Moves the assignment DRAFT → SENT
// (always) and the JOB → DISPATCHED (only when advancing from NEW/SCHEDULED).
// Parent-before-child lock order: lock the job row FOR UPDATE, then the
// assignment, then re-check both under the locks (R-5.x canonical pattern).
// ---------------------------------------------------------------------------

export type SendDispatchInput = {
  tenantId: string;
  assignmentId: string;
  // Phase 23 23f-1 — THE AUTONOMY SEAM. Widened string → string | null: operators pass a
  // real user id (unchanged); the auto-advance path (23f-2) passes null = system actor. All
  // five sinks already accept NULL (assignment + job status-history changedByUserId, the two
  // audit userId rows, jobEvents actorUserId — all nullable, FK ON DELETE SET NULL). No sink
  // logic changes — they write whatever actorUserId is. Nothing auto-sends until 23f-2.
  actorUserId: string | null;
};

export type SendDispatchResult = {
  assignment: JobVendorAssignmentRow;
  jobStatusAdvanced: boolean;
};

/**
 * Throws: ASSIGNMENT_NOT_FOUND, ASSIGNMENT_NOT_DRAFT, JOB_NOT_FOUND,
 * JOB_NOT_DISPATCHABLE, JOB_BECAME_TERMINAL (lost a race after the pre-txn guard),
 * STATUS_NOT_FOUND (DRAFT/SENT/DISPATCHED missing — defensive).
 */
export async function sendDispatch(
  input: SendDispatchInput,
): Promise<SendDispatchResult> {
  // --- guards (read-only, before the txn) ---
  const assignment = await getAssignment(input.tenantId, input.assignmentId);
  if (!assignment) throw new Error("ASSIGNMENT_NOT_FOUND");

  const draftStatus = await getDispatchAssignmentStatusByCode("DRAFT");
  const sentStatus = await getDispatchAssignmentStatusByCode("SENT");
  if (!draftStatus || !sentStatus) throw new Error("STATUS_NOT_FOUND");
  if (assignment.currentStatusId !== draftStatus.id)
    throw new Error("ASSIGNMENT_NOT_DRAFT");

  const job = await getJob(input.tenantId, assignment.jobId);
  if (!job) throw new Error("JOB_NOT_FOUND");

  // id ⇄ code maps for the dispatchable / advance membership checks.
  const statusRows = await db
    .select({ id: jobStatuses.id, code: jobStatuses.code })
    .from(jobStatuses);
  const codeById = new Map(statusRows.map((r) => [r.id, r.code]));
  const idByCode = new Map(statusRows.map((r) => [r.code, r.id]));
  const dispatchedId = idByCode.get(DISPATCHED_JOB_CODE);
  if (!dispatchedId) throw new Error("STATUS_NOT_FOUND");

  const currentCode = codeById.get(job.currentStatusId);
  if (!currentCode || !DISPATCHABLE_JOB_CODES.includes(currentCode))
    throw new Error("JOB_NOT_DISPATCHABLE");

  // Vendor name for the human-readable timeline summary (read once, outside txn).
  const vendor = await getVendor(input.tenantId, assignment.vendorId);
  const vendorName = vendor?.name ?? "vendor";

  let jobStatusAdvanced = false;

  await db.transaction(async (tx) => {
    // 1. lock the PARENT (job) first — parent-before-child lock order (R-5.x).
    const lockedJob = await tx
      .select({ currentStatusId: jobs.currentStatusId })
      .from(jobs)
      .where(and(eq(jobs.tenantId, input.tenantId), eq(jobs.id, assignment.jobId)))
      .for("update");
    if (!lockedJob[0]) throw new Error("JOB_NOT_FOUND");
    const lockedStatusId = lockedJob[0].currentStatusId;
    const lockedCode = codeById.get(lockedStatusId);

    // 2. lock the CHILD (assignment); re-check still DRAFT (double-send race).
    const lockedAssignment = await tx
      .select({ currentStatusId: jobVendorAssignments.currentStatusId })
      .from(jobVendorAssignments)
      .where(
        and(
          eq(jobVendorAssignments.tenantId, input.tenantId),
          eq(jobVendorAssignments.id, input.assignmentId),
        ),
      )
      .for("update");
    if (!lockedAssignment[0]) throw new Error("ASSIGNMENT_NOT_FOUND");
    if (lockedAssignment[0].currentStatusId !== draftStatus.id)
      throw new Error("ASSIGNMENT_NOT_DRAFT");

    // 3. re-check the locked job is still dispatchable (race → became terminal).
    if (!lockedCode || !DISPATCHABLE_JOB_CODES.includes(lockedCode))
      throw new Error("JOB_BECAME_TERMINAL");

    // 4. assignment DRAFT → SENT.
    await tx
      .update(jobVendorAssignments)
      .set({ currentStatusId: sentStatus.id, sentAt: sql`now()` })
      .where(eq(jobVendorAssignments.id, input.assignmentId));

    // 5. assignment status-history (DRAFT → SENT).
    await tx.insert(jobVendorAssignmentStatusHistory).values({
      tenantId: input.tenantId,
      assignmentId: input.assignmentId,
      fromStatusId: draftStatus.id,
      toStatusId: sentStatus.id,
      changedByUserId: input.actorUserId,
    });

    // 6. audit: assignment sent — ALWAYS.
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "job_vendor_assignment.sent",
      targetType: "job_vendor_assignment",
      targetId: input.assignmentId,
      metadata: { jobId: assignment.jobId, vendorId: assignment.vendorId },
    });

    // 7. job timeline event: dispatched — ALWAYS (R3: fires every send).
    await tx.insert(jobEvents).values({
      tenantId: input.tenantId,
      jobId: assignment.jobId,
      eventType: "job.dispatched",
      actorUserId: input.actorUserId,
      summary: `Dispatched to ${vendorName}`,
      metadata: {
        assignmentId: input.assignmentId,
        vendorId: assignment.vendorId,
      },
    });

    // 8. CONDITIONAL job-side advance — only from {NEW, SCHEDULED} (R-2a). Never
    //    regresses IN_PROGRESS; ON_HOLD stays ON_HOLD (explicit-transitions rule).
    if (lockedCode && ADVANCE_FROM_JOB_CODES.includes(lockedCode)) {
      await tx
        .update(jobs)
        .set({ currentStatusId: dispatchedId })
        .where(
          and(eq(jobs.tenantId, input.tenantId), eq(jobs.id, assignment.jobId)),
        );

      await tx.insert(jobStatusHistory).values({
        tenantId: input.tenantId,
        jobId: assignment.jobId,
        fromStatusId: lockedStatusId,
        toStatusId: dispatchedId,
        changedByUserId: input.actorUserId,
      });

      await tx.insert(auditLogs).values({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "job.dispatched",
        targetType: "job",
        targetId: assignment.jobId,
        metadata: {
          fromStatusCode: lockedCode,
          toStatusCode: DISPATCHED_JOB_CODE,
          assignmentId: input.assignmentId,
        },
      });
      jobStatusAdvanced = true;
    }
  });

  const reloaded = await getAssignment(input.tenantId, input.assignmentId);
  if (!reloaded)
    throw new Error("Assignment send succeeded but row could not be reloaded.");
  return { assignment: reloaded, jobStatusAdvanced };
}
