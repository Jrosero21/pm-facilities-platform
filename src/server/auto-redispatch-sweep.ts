import "server-only";

// ── Phase 29 — the session-free auto-redispatch SWEEP core ─────────────────────────────────
// Extracted verbatim from autoRedispatchSweepAction's loop body so that the operator button and
// the scheduled trigger run THE SAME code. The action keeps requireTenant + revalidatePath (its
// request-scoped concerns); everything that decides WHAT to act on lives here.
//
// ★ WHY THE EXTRACTION MATTERS (the Test-3 constraint):
// autoRedispatchForStuckAssignment (T1) has NO staleness check — its only precondition is "this
// assignment is currently SENT". The isDispatchStuck filter lives entirely in the CANDIDATE
// SELECTION below. A trigger that called T1 directly over SENT assignments would re-dispatch
// perfectly healthy jobs. Keeping the filter in this shared core is what makes that impossible:
// there is no path to T1 from the cron that skips it.
//
// TWO INDEPENDENT BOUNDS, both required:
//   • COUNT  — REDISPATCH_MAX_ATTEMPTS (3), already enforced twice (candidate exclusion via
//     redispatchState 'exhausted_max_attempts', and decideRedispatchCore). Bounds the TOTAL.
//   • RATE   — the per-job cooldown added here. Bounds RE-ENTRY FREQUENCY. Without it, an
//     unattended trigger re-enters the same job on every tick the moment its replacement goes
//     stale; a human clicking a button paced that naturally, a cron does not.

import { and, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { jobVendorAssignments } from "@/server/schema";
import { getExceptions } from "@/server/analytics/exceptions";
import { autoRedispatchForStuckAssignment } from "@/server/auto-redispatch";

/** Minimum hours between autonomous re-dispatches of the SAME job. Conservative by default. */
export const REDISPATCH_COOLDOWN_HOURS = 4;

export type SweepSummary = {
  swept: number;
  autoSent: number;
  heldForReview: number;
  skipped: number;
  byReason: Record<string, number>;
};

/**
 * Sweep one tenant's stuck dispatches through the gate-governed T1 core.
 *
 * SESSION-FREE — no requireTenant, no revalidatePath, no request scope. Safe to call from a cron
 * route, a script, or the operator action. Adds NO permission: T1 re-resolves policy, ceilings,
 * conditions, quality and client consent per job, and can only ever HOLD.
 *
 * `cooldownHours` is a real parameter (not a test backdoor) so a caller can tune the rate bound;
 * it defaults to REDISPATCH_COOLDOWN_HOURS, which is what the cron route uses.
 */
export async function runAutoRedispatchSweep(input: {
  tenantId: string;
  now?: Date;
  cooldownHours?: number;
}): Promise<SweepSummary> {
  const { tenantId } = input;
  const now = input.now ?? new Date();
  const cooldownHours = input.cooldownHours ?? REDISPATCH_COOLDOWN_HOURS;

  // ── CANDIDATE SELECTION (the stuck-filter; identical to the operator sweep) ───────────────
  const exceptions = await getExceptions(tenantId);
  const candidates = exceptions.filter(
    (e): e is Extract<typeof e, { kind: "vendor_not_accepted" }> =>
      e.kind === "vendor_not_accepted" && e.redispatchState === "can_suggest",
  );

  // ── COOLDOWN LOOKUP ──────────────────────────────────────────────────────────────────────
  // "When did the system last auto-act on this job?" = the newest CREATED_AT among the job's
  // replacement assignments (replaces_assignment_id IS NOT NULL). Deliberately created_at, NOT
  // sent_at: sent_at is a CONTACT timestamp that gets adjusted/backdated, whereas created_at is
  // when the re-dispatch was actually generated — which is the thing being rate-limited.
  const jobIds = [...new Set(candidates.map((c) => c.jobId))];
  const lastAutoByJob = new Map<string, Date>();
  if (jobIds.length > 0) {
    const rows = await db
      .select({ jobId: jobVendorAssignments.jobId, lastAt: sql<Date>`MAX(${jobVendorAssignments.createdAt})` })
      .from(jobVendorAssignments)
      .where(and(inArray(jobVendorAssignments.jobId, jobIds), isNotNull(jobVendorAssignments.replacesAssignmentId)))
      .groupBy(jobVendorAssignments.jobId);
    for (const r of rows) if (r.lastAt) lastAutoByJob.set(r.jobId, new Date(r.lastAt));
  }
  const cooldownMs = cooldownHours * 3600_000;

  let swept = 0, autoSent = 0, heldForReview = 0, skipped = 0;
  const byReason: Record<string, number> = {};

  // SEQUENTIAL — await EACH before the next (NEVER Promise.all). Spend-aggregate safety: each T1
  // calls withinSpendCeilings, so sequential firing means each sees the prior's committed spend →
  // the per-day/tenant ceiling halts a burst. Parallel would let two read the same pre-commit total.
  for (const e of candidates) {
    const lastAuto = lastAutoByJob.get(e.jobId);
    if (lastAuto && now.getTime() - lastAuto.getTime() < cooldownMs) {
      swept++;
      skipped++;
      byReason.cooldown = (byReason.cooldown ?? 0) + 1;
      continue;
    }
    swept++;
    try {
      const r = await autoRedispatchForStuckAssignment({ tenantId, stuckAssignmentId: e.assignmentId });
      if (r.kind === "auto_sent") {
        autoSent++;
      } else if (r.kind === "prepared_blocked") {
        heldForReview++;
        byReason[r.blockedBy] = (byReason[r.blockedBy] ?? 0) + 1;
      } else {
        skipped++;
        byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
      }
    } catch {
      // One job's failure must not abort the sweep — T1 already closed its run failed; tally + continue.
      skipped++;
      byReason.error = (byReason.error ?? 0) + 1;
    }
  }

  return { swept, autoSent, heldForReview, skipped, byReason };
}
