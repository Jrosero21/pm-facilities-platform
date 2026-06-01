import "server-only";

import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import {
  pmSchedules,
  pmPrograms,
  pmScheduleLocations,
  pmGenerationRuns,
  pmVisits,
} from "@/server/schema";
import { createJob } from "@/server/jobs";
import { getSystemUserId } from "@/server/integrations/system-user";
import { writeAuditLog } from "@/server/audit";
import { advanceDueDate, type PmFrequency } from "./recurrence";

// ── Phase 14 engine — PM VISIT GENERATOR (the CF-13.1 inner workhorse) ────────────────
// Fans a due schedule out over its member locations → one pm_visits row per location → (auto
// mode) a job per visit via the frozen createJob. Mirrors createJobFromDraft's job-build +
// the email run/link discipline at BATCH scale.
//
// RECORD-DON'T-APPLY + PER-ITEM ISOLATION (F2): each createJob owns its own txn (IF-4 — NOT
// nested). The run-open, per-visit insert, link update, count update, and recurrence advance
// are individual writes — the whole fan-out is DELIBERATELY not one txn, so one bad location
// (skip-and-flag) cannot roll back the rest. A per-visit failure flags that visit + a skip
// audit, and the batch continues.
//
// IF-4 / CF-13.6 orphan discipline: createJob commits, THEN a re-check-guarded link-back sets
// pm_visits.job_id + generation_status='generated'. If the guard matches 0 rows (the visit
// changed under us), the job is real → audit the orphan, do not throw.

export type GenerateVisitsResult = {
  runId: string;
  requested: number;
  generated: number;
  skipped: number;
  visits: Array<{
    visitId: string;
    locationId: string;
    status: "generated" | "skipped" | "pending_review";
    jobId?: string;
    skipReason?: string;
  }>;
};

export async function generateVisitsForSchedule(
  scheduleId: string,
  opts: { mode: "auto" | "review"; actorUserId?: string },
): Promise<GenerateVisitsResult> {
  // 1. Load the schedule (tenant scope comes FROM the row, like ingestEmail).
  const schedule = (
    await db.select().from(pmSchedules).where(eq(pmSchedules.id, scheduleId)).limit(1)
  )[0];
  if (!schedule) throw new Error("SCHEDULE_NOT_FOUND");
  if (!schedule.isActive) throw new Error("SCHEDULE_INACTIVE");
  const tenantId = schedule.tenantId;

  const program = (
    await db.select().from(pmPrograms).where(eq(pmPrograms.id, schedule.pmProgramId)).limit(1)
  )[0];
  if (!program) throw new Error("PROGRAM_NOT_FOUND");

  // 2. Actor: explicit operator (review path) or the system user (auto path).
  const actor = opts.actorUserId ?? (await getSystemUserId());

  // 3. ACTIVE membership — queried LIVE (do not assume a count; Part A flagged the stray stub).
  const members = await db
    .select({ id: pmScheduleLocations.clientLocationId })
    .from(pmScheduleLocations)
    .where(
      and(
        eq(pmScheduleLocations.tenantId, tenantId),
        eq(pmScheduleLocations.pmScheduleId, scheduleId),
        eq(pmScheduleLocations.isActive, true),
      ),
    );
  const requested = members.length;

  // 4. Open ONE generation run (the F2 batch-event record).
  const runId = uuidv7();
  const runAt = new Date();
  await db.insert(pmGenerationRuns).values({
    id: runId,
    tenantId,
    pmScheduleId: scheduleId,
    requestedCount: requested,
    generatedCount: 0,
    skippedCount: 0,
    runAt,
    createdByUserId: actor,
  });

  const result: GenerateVisitsResult = {
    runId,
    requested,
    generated: 0,
    skipped: 0,
    visits: [],
  };

  // 5. Fan out — SEQUENTIAL, per-item isolation (no wrapping txn).
  for (const member of members) {
    const visitId = uuidv7();
    await db.insert(pmVisits).values({
      id: visitId,
      tenantId,
      pmScheduleId: scheduleId,
      clientLocationId: member.id,
      pmGenerationRunId: runId,
      dueAt: schedule.nextDueAt,
      // review → park; auto → set to 'generated' after the job links. Insert as the safe
      // pending_review state; the auto branch advances it.
      generationStatus: "pending_review",
      jobId: null,
    });

    if (opts.mode === "review") {
      // F1 gate path — leave pending_review, no job now.
      result.visits.push({
        visitId,
        locationId: member.id,
        status: "pending_review",
      });
      continue;
    }

    // mode === 'auto'
    try {
      const job = await createJob({
        tenantId,
        clientId: program.clientId,
        clientLocationId: member.id,
        primaryTradeId: program.primaryTradeId,
        priorityId: program.priorityId,
        sourceType: "preventative_maintenance",
        sourceExternalId: `pm:${scheduleId}:${runId}:${member.id}`,
        problemDescription: program.name, // the PM program name as the WO problem line
        scopeOfWork: program.scopeOfWork, // program-level template scope (locked)
        createdByUserId: actor,
      });

      // createJob committed its OWN txn. Re-check-guarded link-back (CF-13.6).
      const linkRes = await db
        .update(pmVisits)
        .set({ jobId: job.id, generationStatus: "generated" })
        .where(
          and(
            eq(pmVisits.id, visitId),
            eq(pmVisits.generationStatus, "pending_review"),
          ),
        );
      const affected = linkRes[0].affectedRows;
      if (affected === 0) {
        // The visit changed under us after the job committed. The job is real; audit, don't throw.
        await writeAuditLog({
          tenantId,
          actorLabel: "system:pm-generation",
          action: "pm_visit_link_orphan",
          targetType: "pm_visit",
          targetId: visitId,
          metadata: { jobId: job.id, runId },
        });
      }
      result.generated += 1;
      result.visits.push({
        visitId,
        locationId: member.id,
        status: "generated",
        jobId: job.id,
      });
    } catch (err) {
      // skip-and-flag (F2): the batch CONTINUES.
      const reason = String(err instanceof Error ? err.message : err).slice(0, 500);
      await db
        .update(pmVisits)
        .set({ generationStatus: "skipped", skipReason: reason })
        .where(eq(pmVisits.id, visitId));
      await writeAuditLog({
        tenantId,
        actorLabel: "system:pm-generation",
        action: "pm_visit_generation_skipped",
        targetType: "pm_visit",
        targetId: visitId,
        metadata: { runId, locationId: member.id, reason },
      });
      result.skipped += 1;
      result.visits.push({
        visitId,
        locationId: member.id,
        status: "skipped",
        skipReason: reason,
      });
    }
  }

  // 6. Finalize the run counts.
  await db
    .update(pmGenerationRuns)
    .set({ generatedCount: result.generated, skippedCount: result.skipped })
    .where(eq(pmGenerationRuns.id, runId));

  // 7. Advance recurrence ONCE (idempotent re-fire: a second call sees the advanced due date).
  const nextDueAt = advanceDueDate(
    schedule.nextDueAt,
    schedule.frequency as PmFrequency,
    schedule.intervalCount,
  );
  await db
    .update(pmSchedules)
    .set({ nextDueAt, lastGeneratedAt: runAt })
    .where(eq(pmSchedules.id, scheduleId));

  // 8. Run event.
  await writeAuditLog({
    tenantId,
    actorLabel: "system:pm-generation",
    action: "pm_generation_run",
    targetType: "pm_generation_run",
    targetId: runId,
    metadata: {
      scheduleId,
      mode: opts.mode,
      requested,
      generated: result.generated,
      skipped: result.skipped,
    },
  });

  return result;
}
