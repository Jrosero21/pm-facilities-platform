import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { jobStatusHistory } from "@/server/schema";
import { listJobs, type JobListItem } from "@/server/jobs";
import { getJobStatusByCode } from "@/server/job-reference";
import { getJobMargin } from "@/server/billing/margin";
import { listAssignmentsForJob } from "@/server/dispatch";

// ── CF-27.16 Piece 2 — "Ready to invoice" worklist reader ──────────────────────────────
// Jobs at PENDING_INVOICE (ops handed off → accounting bills), optionally narrowed by client (the
// per-client batch axis), each enriched with the billing columns the queue shows. Lives in
// analytics/ (the dashboard-reader home, like pending-invoices.ts) — NOT billing/, because it
// reuses listJobs (jobs.ts) and billing modules must never import jobs.ts (acyclic, 9e). Read-only;
// the worklist surfaces jobs, it never gates billing (any job is billable regardless of status).

export type ReadyToBillRow = JobListItem & {
  /** When ops handed the job to accounting — latest job_status_history → PENDING_INVOICE. */
  handoffAt: Date | null;
  /** Σ approved vendor-invoice cost (getJobMargin.cost). */
  cost: string;
  /** Σ issued (sent) client-invoice revenue so far (getJobMargin.revenue). 0.00 = not yet billed. */
  billedSoFar: string;
  /** revenue − cost (getJobMargin.margin). */
  margin: string;
  /** count of the job's dispatches (vendors on the job). */
  vendorCount: number;
};

/**
 * Jobs ready to invoice (status PENDING_INVOICE), optionally for one client. Per-row enrichment.
 *
 * PERF (CF-27.16-opt1): this is O(N) per-row — for each PENDING_INVOICE job it runs a handoff query,
 * getJobMargin (2 sum queries), and an assignment count. Fine for v1 (the PENDING_INVOICE worklist is
 * small); when these lists grow, replace the per-row loop with batched `GROUP BY job_id` rollups
 * (handoff MAX(created_at), AR/AP sums, assignment counts) joined to the base rows.
 */
export async function getReadyToBillRows(
  tenantId: string,
  opts?: { clientId?: string },
): Promise<ReadyToBillRow[]> {
  const pendingInvoice = await getJobStatusByCode("PENDING_INVOICE");
  if (!pendingInvoice) return []; // status not seeded → nothing to surface

  const base = await listJobs(tenantId, { statusId: pendingInvoice.id, clientId: opts?.clientId });

  return Promise.all(
    base.map(async (job): Promise<ReadyToBillRow> => {
      const [handoffRow] = await db
        .select({ at: jobStatusHistory.createdAt })
        .from(jobStatusHistory)
        .where(
          and(
            eq(jobStatusHistory.tenantId, tenantId),
            eq(jobStatusHistory.jobId, job.id),
            eq(jobStatusHistory.toStatusId, pendingInvoice.id),
          ),
        )
        .orderBy(desc(jobStatusHistory.createdAt))
        .limit(1);

      const margin = await getJobMargin(tenantId, job.id);
      const assignments = await listAssignmentsForJob(tenantId, job.id);

      return {
        ...job,
        handoffAt: handoffRow?.at ?? null,
        cost: margin.cost,
        billedSoFar: margin.revenue,
        margin: margin.margin,
        vendorCount: assignments.length,
      };
    }),
  );
}
