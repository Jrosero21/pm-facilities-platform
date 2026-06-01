import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { pmVisits, pmSchedules, pmPrograms } from "@/server/schema";
import { createJob } from "@/server/jobs";
import { writeAuditLog } from "@/server/audit";

// ── Phase 14 engine — BATCH-APPROVE (F1 review path) ──────────────────────────────────
// Turns a run's pending_review visits into jobs. Mirrors approveEmailDraft: lock+recheck the
// visit is still pending_review, then (OUTSIDE the lock, IF-4) createJob in its own txn, then
// a re-check-guarded link-back. Skip-and-flag applies here too (F2 — one bad visit doesn't
// abort the batch). reviewed-by/actor = the approving OPERATOR (the authz gate lives in the
// deferred action wrapper, the CF-13.7 analog — NOT here).
//
// THE §2.5 HUMAN GATE IS THE EXISTENCE OF THIS FUNCTION: the auto path (generateVisitsForSchedule
// mode='auto') never calls it; the review path (mode='review') REQUIRES it.

export async function approvePmVisits(
  runId: string,
  opts: { actorUserId: string },
): Promise<{ approved: number; skipped: number; alreadyResolved: number }> {
  // ALL of the run's visits — partition them: pending_review are approvable; already-'generated'
  // count as alreadyResolved (a re-call of approve on a fully-processed run reports them, the
  // re-check guard at run scale); 'skipped' visits are not approvable (ignored here).
  const candidates = await db
    .select()
    .from(pmVisits)
    .where(eq(pmVisits.pmGenerationRunId, runId));

  let approved = 0;
  let skipped = 0;
  let alreadyResolved = 0;

  for (const visit of candidates) {
    const tenantId = visit.tenantId;

    if (visit.generationStatus === "generated") {
      alreadyResolved += 1;
      continue;
    }
    if (visit.generationStatus !== "pending_review") {
      // 'skipped' (or any non-pending state) — not approvable.
      continue;
    }

    // 1. Lock + recheck still pending_review, then release (createJob needs its own txn).
    const locked = await db.transaction(async (tx) => {
      const row = (
        await tx
          .select({ generationStatus: pmVisits.generationStatus })
          .from(pmVisits)
          .where(and(eq(pmVisits.tenantId, tenantId), eq(pmVisits.id, visit.id)))
          .for("update")
      )[0];
      return row?.generationStatus === "pending_review";
    });
    if (!locked) {
      alreadyResolved += 1;
      continue;
    }

    // 2. Resolve the program (via the visit's schedule) for the job mapping.
    const schedule = (
      await db
        .select({ pmProgramId: pmSchedules.pmProgramId })
        .from(pmSchedules)
        .where(eq(pmSchedules.id, visit.pmScheduleId))
        .limit(1)
    )[0];
    const program = schedule
      ? (
          await db
            .select()
            .from(pmPrograms)
            .where(eq(pmPrograms.id, schedule.pmProgramId))
            .limit(1)
        )[0]
      : undefined;

    if (!program) {
      // Treat a missing program as a skip-and-flag (the visit can't be turned into a job).
      const reason = "PROGRAM_NOT_FOUND";
      await db
        .update(pmVisits)
        .set({ generationStatus: "skipped", skipReason: reason })
        .where(eq(pmVisits.id, visit.id));
      await writeAuditLog({
        tenantId,
        userId: opts.actorUserId,
        action: "pm_visit_generation_skipped",
        targetType: "pm_visit",
        targetId: visit.id,
        metadata: { runId, reason },
      });
      skipped += 1;
      continue;
    }

    // 3. createJob (its OWN txn — IF-4) + re-check-guarded link-back.
    try {
      const job = await createJob({
        tenantId,
        clientId: program.clientId,
        clientLocationId: visit.clientLocationId,
        primaryTradeId: program.primaryTradeId,
        priorityId: program.priorityId,
        sourceType: "preventative_maintenance",
        sourceExternalId: `pm:${visit.pmScheduleId}:${runId}:${visit.clientLocationId}`,
        problemDescription: program.name,
        scopeOfWork: program.scopeOfWork,
        createdByUserId: opts.actorUserId, // operator-approved (review path)
      });

      const linkRes = await db
        .update(pmVisits)
        .set({ jobId: job.id, generationStatus: "generated" })
        .where(
          and(
            eq(pmVisits.id, visit.id),
            eq(pmVisits.generationStatus, "pending_review"),
          ),
        );
      if (linkRes[0].affectedRows === 0) {
        await writeAuditLog({
          tenantId,
          userId: opts.actorUserId,
          action: "pm_visit_link_orphan",
          targetType: "pm_visit",
          targetId: visit.id,
          metadata: { jobId: job.id, runId },
        });
      }
      approved += 1;
    } catch (err) {
      const reason = String(err instanceof Error ? err.message : err).slice(0, 500);
      await db
        .update(pmVisits)
        .set({ generationStatus: "skipped", skipReason: reason })
        .where(eq(pmVisits.id, visit.id));
      await writeAuditLog({
        tenantId,
        userId: opts.actorUserId,
        action: "pm_visit_generation_skipped",
        targetType: "pm_visit",
        targetId: visit.id,
        metadata: { runId, reason },
      });
      skipped += 1;
    }
  }

  // Batch summary audit (uses the run's tenant via any candidate visit, if any).
  if (candidates[0]) {
    await writeAuditLog({
      tenantId: candidates[0].tenantId,
      userId: opts.actorUserId,
      action: "pm_visits_batch_approved",
      targetType: "pm_generation_run",
      targetId: runId,
      metadata: { runId, approved, skipped, alreadyResolved },
    });
  }

  return { approved, skipped, alreadyResolved };
}
