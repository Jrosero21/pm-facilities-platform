import "server-only";

import { and, eq, lte } from "drizzle-orm";
import { db } from "@/server/db";
import { pmSchedules, pmPrograms } from "@/server/schema";
import {
  generateVisitsForSchedule,
  type GenerateVisitsResult,
} from "./generate-visits";

// ── Phase 14 engine — TRIGGERED DUE-SCHEDULE SCAN (generator-not-cron, F4) ────────────
// Finds active schedules whose next_due_at has passed and fans each out. This is the
// HARNESS-INVOKABLE trigger; the LIVE cron that calls it on a timer is DEFERRED (B-14.2) —
// exactly the P12/P13 deferred-live-fetch precedent.
//
// F1 BRANCH (the §2.5 gate, one line): each schedule's program.auto_generate decides
// mode — 'auto' spawns jobs without a gate, 'review' parks pending_review visits for
// approvePmVisits.

export async function runDueSchedules(opts?: {
  now?: Date;
  tenantId?: string;
}): Promise<GenerateVisitsResult[]> {
  const now = opts?.now ?? new Date();

  const conditions = [
    eq(pmSchedules.isActive, true),
    lte(pmSchedules.nextDueAt, now),
  ];
  if (opts?.tenantId) conditions.push(eq(pmSchedules.tenantId, opts.tenantId));

  const due = await db
    .select({ id: pmSchedules.id, pmProgramId: pmSchedules.pmProgramId })
    .from(pmSchedules)
    .where(and(...conditions));

  const results: GenerateVisitsResult[] = [];
  for (const sched of due) {
    const program = (
      await db
        .select({ autoGenerate: pmPrograms.autoGenerate })
        .from(pmPrograms)
        .where(eq(pmPrograms.id, sched.pmProgramId))
        .limit(1)
    )[0];
    // The F1 gate: auto-create vs review path, per program.
    const mode = program?.autoGenerate ? "auto" : "review";
    const r = await generateVisitsForSchedule(sched.id, { mode });
    results.push(r);
  }
  return results;
}
