import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { jobScopeSteps } from "@/server/schema";

// ── Phase 7 batch 7d — job_scope_steps read layer ─────────────────────────────────────
// The published, canonical scope of a job (written only by publishScopeDraft). Read-only
// here; the operator UI renders these as the job's "Scope of work" once published. Active
// rows only (soft-delete status), ordered by step_order.

export type JobScopeStepRow = typeof jobScopeSteps.$inferSelect;

export async function listScopeStepsForJob(tenantId: string, jobId: string): Promise<JobScopeStepRow[]> {
  return db
    .select()
    .from(jobScopeSteps)
    .where(
      and(
        eq(jobScopeSteps.tenantId, tenantId),
        eq(jobScopeSteps.jobId, jobId),
        eq(jobScopeSteps.status, "active"),
      ),
    )
    .orderBy(asc(jobScopeSteps.stepOrder));
}
