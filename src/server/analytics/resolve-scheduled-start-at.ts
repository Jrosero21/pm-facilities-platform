// ── Phase 9 batch 9c — RESOLVE AUTHORITATIVE SCHEDULED-START (pure util) ───────────────
// PURE util — NO "server-only", NO DB, NO env, NO IO. Narrow structural parameter types (no
// drizzle $inferSelect coupling) so it is unit-testable in isolation (9c manifest §7).
//
// Single source of truth for "what is the authoritative scheduled-start timestamp for a job",
// shared by the SCHEDULED-stalled rule and the (future) time-to-scheduled metric so the two can
// never diverge (design proposal §5/§7). The job-level intent wins; assignment-level scheduling is
// the fallback when the operator hasn't set a job-level scheduled start.

/**
 * Authoritative scheduled-start for a job:
 *   1. `job.scheduledStartAt` if set (operator intent at the job level), else
 *   2. the EARLIEST non-null `assignments[].scheduledStartAt` (assignment-level fallback), else
 *   3. `null` (no scheduled start known — the data-blocked case).
 */
export function resolveScheduledStartAt(
  job: { scheduledStartAt: Date | null },
  assignments: ReadonlyArray<{ scheduledStartAt: Date | null }>,
): Date | null {
  if (job.scheduledStartAt !== null) return job.scheduledStartAt;

  let earliest: Date | null = null;
  for (const a of assignments) {
    if (a.scheduledStartAt !== null && (earliest === null || a.scheduledStartAt < earliest)) {
      earliest = a.scheduledStartAt;
    }
  }
  return earliest;
}
