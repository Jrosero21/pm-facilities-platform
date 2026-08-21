import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  jobEvents,
  jobVendorAssignments,
  vendorCheckIns,
  vendorCheckOuts,
  vendorEtaConfirmations,
} from "@/server/schema";
import { getAssignmentDetail } from "@/server/dispatch";
import { writeAuditLog } from "@/server/audit";
import {
  OPERATOR_PRESENCE_AUDIT_ACTIONS,
  OPERATOR_PRESENCE_EVENT_TYPES,
  shouldUpdateScheduledStart,
  validateEtaRecord,
  validatePresenceRecord,
} from "@/server/operator-presence-rules";

// ── FOUNDATION Gap 1 — THE OPERATOR PRESENCE DOOR ─────────────────────────────────────
// vendor_eta_confirmations / vendor_check_ins / vendor_check_outs have existed since Phase 6 with
// writers — confirmEta, markOnSite, markWorkComplete in vendor/assignment-actions.ts — but every
// one takes a `vendorScope: Set<string>` and throws VENDOR_SCOPE_MISMATCH without it. A
// coordinator has no vendor scope, so those tables were STRUCTURALLY unreachable from the operator
// console, not merely un-surfaced. When a vendor phoned in "I'll be there at 2" or "I'm on site",
// there was nowhere to put it and the tables stayed empty.
//
// This is the same shape as G2's log-a-call: the vocabulary and the storage existed, the operator
// path did not. These three functions are that path.
//
// ★ PRESENCE-ONLY — THEY DO NOT TOUCH ASSIGNMENT STATUS (decision a). No status write, no
// applyDispatchJobFollow. The presence tables are occurred_at-stamped FACT LOGS; the assignment
// status is a STATE MACHINE, and coupling them would stop a coordinator recording "the vendor says
// they arrived at 2" against an assignment already moved on — which is exactly the late-arriving
// note this door exists to capture. The operator advances status with the existing
// DispatchStatusPicker when they mean to. The vendor path already proves the two can diverge:
// markWorkComplete writes a check-out without advancing the parent job.
//
// ★ THE ONE EXCEPTION IS OPT-IN: operatorRecordEta({updateSchedule: true}) also sets
// scheduledStartAt. See shouldUpdateScheduledStart for why that is a choice and not automatic.
//
// ★ PROVENANCE is carried by the audit action name (.operator_relayed) — see the rules module,
// including the stated analytics cost of not having a source column on the rows.
//
// Authorization is enforced at the action layer (canSeeOperations), mirroring every other
// operator-side dispatch write; these take a tenantId and scope every read and write by it.

export type OperatorPresenceResult = { id: string };

/** Thrown for a missing/cross-tenant assignment, plus the validation codes from the rules module. */
async function requireAssignment(tenantId: string, assignmentId: string) {
  const assignment = await getAssignmentDetail(tenantId, assignmentId);
  if (!assignment) throw new Error("ASSIGNMENT_NOT_FOUND");
  return assignment;
}

/**
 * Record an ETA the vendor gave the coordinator (typically by phone).
 *
 * Appends to vendor_eta_confirmations, which is append-only: the newest row is the current ETA and
 * the earlier ones are the schedule audit trail. A revised ETA is a new row, never an edit.
 *
 * `etaStartAt` may be in the future — that is what an ETA is.
 *
 * Throws: ASSIGNMENT_NOT_FOUND, PRESENCE_OCCURRED_AT_INVALID, PRESENCE_ETA_END_BEFORE_START,
 * PRESENCE_NOTE_TOO_LONG.
 */
export async function operatorRecordEta(input: {
  tenantId: string;
  assignmentId: string;
  etaStartAt: Date;
  etaEndAt?: Date | null;
  note?: string | null;
  /** Opt-in: also move the assignment's scheduledStartAt. Default false — presence-only. */
  updateSchedule?: boolean;
  actorUserId: string | null;
  /** Injected for determinism in tests; defaults to now. */
  now?: Date;
}): Promise<OperatorPresenceResult> {
  const invalid = validateEtaRecord({
    etaStartAt: input.etaStartAt,
    etaEndAt: input.etaEndAt,
    note: input.note,
  });
  if (invalid) throw new Error(invalid);

  const assignment = await requireAssignment(input.tenantId, input.assignmentId);
  const reschedule = shouldUpdateScheduledStart(input.updateSchedule);

  let rowId = "";
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(vendorEtaConfirmations)
      .values({
        tenantId: input.tenantId,
        assignmentId: input.assignmentId,
        etaStartAt: input.etaStartAt,
        etaEndAt: input.etaEndAt ?? null,
        note: input.note ?? null,
        confirmedByUserId: input.actorUserId,
      })
      .returning({ id: vendorEtaConfirmations.id });
    rowId = row.id;

    // ★ THE ONLY NON-PRESENCE WRITE IN THIS MODULE, and only when asked for.
    if (reschedule) {
      await tx
        .update(jobVendorAssignments)
        .set({ scheduledStartAt: input.etaStartAt })
        .where(
          and(
            eq(jobVendorAssignments.tenantId, input.tenantId),
            eq(jobVendorAssignments.id, input.assignmentId),
          ),
        );
    }

    await tx.insert(jobEvents).values({
      tenantId: input.tenantId,
      jobId: assignment.jobId,
      eventType: OPERATOR_PRESENCE_EVENT_TYPES.eta,
      actorUserId: input.actorUserId,
      summary: `Vendor ETA recorded for ${assignment.vendorName}${reschedule ? " (scheduled time updated)" : ""}`,
      metadata: {
        assignmentId: input.assignmentId,
        vendorId: assignment.vendorId,
        etaStartAt: input.etaStartAt.toISOString(),
        scheduleUpdated: reschedule,
        relayedByOperator: true,
      },
    });
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.actorUserId,
    action: OPERATOR_PRESENCE_AUDIT_ACTIONS.eta,
    targetType: "job_vendor_assignment",
    targetId: input.assignmentId,
    metadata: {
      jobId: assignment.jobId,
      vendorId: assignment.vendorId,
      etaStartAt: input.etaStartAt.toISOString(),
      scheduleUpdated: reschedule,
    },
  });

  return { id: rowId };
}

/** Shared writer for the two symmetric presence events. */
async function recordPresence(
  kind: "check_in" | "check_out",
  input: {
    tenantId: string;
    assignmentId: string;
    occurredAt?: Date;
    note?: string | null;
    actorUserId: string | null;
    now?: Date;
  },
): Promise<OperatorPresenceResult> {
  const now = input.now ?? new Date();
  // Defaults to now — the common case is recording a call that just ended — but the operator can
  // set it back, because a 3pm note about a 2pm arrival must say 2pm (the G2 log-a-call rule).
  const occurredAt = input.occurredAt ?? now;

  const invalid = validatePresenceRecord({ occurredAt, note: input.note }, now);
  if (invalid) throw new Error(invalid);

  const assignment = await requireAssignment(input.tenantId, input.assignmentId);
  const table = kind === "check_in" ? vendorCheckIns : vendorCheckOuts;
  const verb = kind === "check_in" ? "arrived on site" : "left site";

  let rowId = "";
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(table)
      .values({
        tenantId: input.tenantId,
        assignmentId: input.assignmentId,
        occurredAt,
        note: input.note ?? null,
        recordedByUserId: input.actorUserId,
      })
      .returning({ id: table.id });
    rowId = row.id;

    await tx.insert(jobEvents).values({
      tenantId: input.tenantId,
      jobId: assignment.jobId,
      eventType: OPERATOR_PRESENCE_EVENT_TYPES[kind],
      actorUserId: input.actorUserId,
      summary: `${assignment.vendorName} ${verb} (recorded by coordinator)`,
      metadata: {
        assignmentId: input.assignmentId,
        vendorId: assignment.vendorId,
        occurredAt: occurredAt.toISOString(),
        relayedByOperator: true,
      },
    });
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.actorUserId,
    action: OPERATOR_PRESENCE_AUDIT_ACTIONS[kind],
    targetType: "job_vendor_assignment",
    targetId: input.assignmentId,
    metadata: {
      jobId: assignment.jobId,
      vendorId: assignment.vendorId,
      occurredAt: occurredAt.toISOString(),
    },
  });

  return { id: rowId };
}

/**
 * Record that the vendor arrived on site, as relayed to the coordinator.
 * Does NOT advance the assignment to ON_SITE — see the module header.
 *
 * Throws: ASSIGNMENT_NOT_FOUND, PRESENCE_OCCURRED_AT_INVALID, PRESENCE_OCCURRED_AT_FUTURE,
 * PRESENCE_NOTE_TOO_LONG.
 */
export async function operatorRecordCheckIn(input: {
  tenantId: string;
  assignmentId: string;
  occurredAt?: Date;
  note?: string | null;
  actorUserId: string | null;
  now?: Date;
}): Promise<OperatorPresenceResult> {
  return recordPresence("check_in", input);
}

/**
 * Record that the vendor left site, as relayed to the coordinator.
 *
 * ★ THIS IS NOT COMPLETION VERIFICATION (decision c). "The vendor left at 4:15" is a duration
 * fact; "I accept this work as done and billable" is a judgment. Given the work order's protective
 * language, those must not be one click. Completion-verification is a separate gap.
 *
 * Throws: as operatorRecordCheckIn.
 */
export async function operatorRecordCheckOut(input: {
  tenantId: string;
  assignmentId: string;
  occurredAt?: Date;
  note?: string | null;
  actorUserId: string | null;
  now?: Date;
}): Promise<OperatorPresenceResult> {
  return recordPresence("check_out", input);
}
