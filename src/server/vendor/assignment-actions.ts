import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  jobVendorAssignments,
  jobVendorAssignmentStatusHistory,
  vendorEtaConfirmations,
  vendorCheckIns,
  vendorCheckOuts,
  auditLogs,
} from "@/server/schema";
import { getDispatchAssignmentStatusByCode } from "@/server/dispatch-reference";
import { applyDispatchJobFollow } from "@/server/job-status";
import { type VendorActor, LINKLESS_ACTOR_LABEL } from "@/server/vendor/types";

// ── Phase 10 batch 10k-actions — VENDOR ASSIGNMENT TRANSITIONS ──────────────
// Six vendor-driven status transitions, server-only. Each mirrors sendDispatch
// (dispatch.ts): pre-txn status resolution by code, a single transaction that
// locks the assignment FOR UPDATE, re-checks status under the lock, updates the
// assignment, dual-writes the status-history row AND an audit row, plus any
// per-transition side-effect (ETA / check-in / check-out).
//
// DoR-10k.1: job_vendor_assignment_status_history has NO source/actor_type
// column. Vendor provenance is recorded in auditLogs.metadata
// ({ actor: "vendor", via: "vendor_portal" }) — the codebase's existing
// provenance stream. The dual-write contract (DoR-10b.3) holds: history + audit
// on every transition; only the provenance discriminator moved to audit metadata.
//
// DoR-10k.2: no transition map exists; each action carries its explicit
// allowed-from status and throws ASSIGNMENT_NOT_IN_REQUIRED_STATUS otherwise.
//
// Defense-in-depth: every function re-checks vendorScope.has(assignment.vendorId)
// under the lock (mirrors canActOnAssignment), so a stale scope or a forged
// assignmentId can never mutate another vendor's assignment.
//
// Vendor actions deliberately do NOT advance the parent job status — operator
// review (via the timeline, DoR-10b.3) is the correct point for onward action.
// So only the assignment row is locked (no parent-job lock, unlike sendDispatch).

export type VendorAssignmentActionError =
  | "ASSIGNMENT_NOT_FOUND"
  | "ASSIGNMENT_NOT_IN_REQUIRED_STATUS"
  | "VENDOR_SCOPE_MISMATCH"
  | "STATUS_NOT_FOUND";

type BaseInput = {
  assignmentId: string;
  tenantId: string;
  vendorScope: Set<string>;
  actor: VendorActor;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AssignmentRow = typeof jobVendorAssignments.$inferSelect;

/**
 * Shared transition core. Resolves the from/to statuses by code, then in one
 * transaction: locks the assignment, enforces scope + required-from status,
 * updates the status (+ optional extra column set), writes the history row,
 * runs any side-effect insert, and writes the audit row.
 */
async function performTransition(
  input: BaseInput,
  fromCode: string,
  toCode: string,
  auditAction: string,
  opts: {
    note?: string | null;
    extraSet?: Partial<typeof jobVendorAssignments.$inferInsert>;
    sideEffect?: (tx: Tx, assignment: AssignmentRow) => Promise<void>;
    auditMetadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const from = await getDispatchAssignmentStatusByCode(fromCode);
  const to = await getDispatchAssignmentStatusByCode(toCode);
  if (!from || !to) throw new Error("STATUS_NOT_FOUND");

  await db.transaction(async (tx) => {
    const [assignment] = await tx
      .select()
      .from(jobVendorAssignments)
      .where(
        and(
          eq(jobVendorAssignments.id, input.assignmentId),
          eq(jobVendorAssignments.tenantId, input.tenantId),
        ),
      )
      .for("update");

    if (!assignment) throw new Error("ASSIGNMENT_NOT_FOUND");
    if (!input.vendorScope.has(assignment.vendorId))
      throw new Error("VENDOR_SCOPE_MISMATCH");
    if (assignment.currentStatusId !== from.id)
      throw new Error("ASSIGNMENT_NOT_IN_REQUIRED_STATUS");

    await tx
      .update(jobVendorAssignments)
      .set({ currentStatusId: to.id, ...(opts.extraSet ?? {}) })
      .where(eq(jobVendorAssignments.id, input.assignmentId));

    // Author/audit attribution: registered user carries the user id; a linkless (no-account)
    // vendor carries NULL author + the token (status_history is assignment-scoped, so it needs
    // no source_token_id — only notes/photos do).
    const changedByUserId = input.actor.kind === "user" ? input.actor.userId : null;

    await tx.insert(jobVendorAssignmentStatusHistory).values({
      tenantId: input.tenantId,
      assignmentId: input.assignmentId,
      fromStatusId: from.id,
      toStatusId: to.id,
      changedByUserId,
      note: opts.note ?? null,
    });

    if (opts.sideEffect) await opts.sideEffect(tx, assignment);

    // Single-vendor auto-follow — carry the job forward if this is the job's one active dispatch.
    // A linkless/magic-link vendor has no user id → a null-actor (system) job advance, intended.
    await applyDispatchJobFollow(tx, {
      tenantId: input.tenantId,
      jobId: assignment.jobId,
      dispatchToCode: to.code,
      actorUserId: changedByUserId,
    });

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.actor.kind === "user" ? input.actor.userId : null,
      actorLabel: input.actor.kind === "linkless" ? LINKLESS_ACTOR_LABEL : null,
      action: auditAction,
      targetType: "job_vendor_assignment",
      targetId: input.assignmentId,
      metadata: {
        jobId: assignment.jobId,
        vendorId: assignment.vendorId,
        actor: "vendor",
        via: input.actor.kind === "user" ? "vendor_portal" : "magic_link",
        ...(input.actor.kind === "linkless" ? { tokenId: input.actor.tokenId } : {}),
        ...(opts.auditMetadata ?? {}),
      },
    });
  });
}

/** Vendor accepts a dispatched assignment. SENT → ACCEPTED. */
export async function acceptDispatch(input: BaseInput): Promise<void> {
  await performTransition(
    input,
    "SENT",
    "ACCEPTED",
    "job_vendor_assignment.accepted",
  );
}

/** Vendor declines a dispatched assignment. SENT → DECLINED (terminal).
 *  Optional reason is recorded on the history row's note. */
export async function declineDispatch(
  input: BaseInput & { reason?: string | null },
): Promise<void> {
  await performTransition(
    input,
    "SENT",
    "DECLINED",
    "job_vendor_assignment.declined",
    { note: input.reason ?? null },
  );
}

/** Vendor confirms an ETA. ACCEPTED → SCHEDULED (DoR-10k.3: the ETA IS the
 *  scheduling act). Sets scheduledStartAt and appends a vendor_eta_confirmations
 *  row in the same transaction. */
export async function confirmEta(
  input: BaseInput & {
    etaStartAt: Date;
    etaEndAt?: Date | null;
    note?: string | null;
  },
): Promise<void> {
  await performTransition(
    input,
    "ACCEPTED",
    "SCHEDULED",
    "job_vendor_assignment.eta_confirmed",
    {
      extraSet: { scheduledStartAt: input.etaStartAt },
      auditMetadata: { etaStartAt: input.etaStartAt.toISOString() },
      sideEffect: async (tx) => {
        await tx.insert(vendorEtaConfirmations).values({
          tenantId: input.tenantId,
          assignmentId: input.assignmentId,
          etaStartAt: input.etaStartAt,
          etaEndAt: input.etaEndAt ?? null,
          note: input.note ?? null,
          confirmedByUserId: input.actor.kind === "user" ? input.actor.userId : null,
        });
      },
    },
  );
}

/** Vendor confirms the scheduled visit. SCHEDULED → CONFIRMED. */
export async function confirmSchedule(input: BaseInput): Promise<void> {
  await performTransition(
    input,
    "SCHEDULED",
    "CONFIRMED",
    "job_vendor_assignment.schedule_confirmed",
  );
}

/** Vendor marks arrival on site. CONFIRMED → ON_SITE. Appends a
 *  vendor_check_ins row (occurred_at = now). */
export async function markOnSite(
  input: BaseInput & { note?: string | null },
): Promise<void> {
  await performTransition(
    input,
    "CONFIRMED",
    "ON_SITE",
    "job_vendor_assignment.on_site",
    {
      sideEffect: async (tx) => {
        await tx.insert(vendorCheckIns).values({
          tenantId: input.tenantId,
          assignmentId: input.assignmentId,
          occurredAt: sql`now()`,
          note: input.note ?? null,
          recordedByUserId: input.actor.kind === "user" ? input.actor.userId : null,
        });
      },
    },
  );
}

/** Vendor marks work complete. ON_SITE → WORK_COMPLETE (terminal). Appends a
 *  vendor_check_outs row (occurred_at = now). Does NOT advance the parent job
 *  status — operator review is the onward-action point. */
export async function markWorkComplete(
  input: BaseInput & { note?: string | null },
): Promise<void> {
  await performTransition(
    input,
    "ON_SITE",
    "WORK_COMPLETE",
    "job_vendor_assignment.work_complete",
    {
      sideEffect: async (tx) => {
        await tx.insert(vendorCheckOuts).values({
          tenantId: input.tenantId,
          assignmentId: input.assignmentId,
          occurredAt: sql`now()`,
          note: input.note ?? null,
          recordedByUserId: input.actor.kind === "user" ? input.actor.userId : null,
        });
      },
    },
  );
}
