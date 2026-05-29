// ── Phase 9 batch 9c — STALLED-JOB RULES + URGENCY TIERS (pure data + predicate) ───────
// PURE module — NO "server-only", NO DB, NO env, NO IO. The threshold constants + urgency-tier
// vocabulary + the `isStalled` classifier predicate the dashboard's stalled-jobs reader and
// operational-queue reader both consume (9c manifest §6). The single definition of "what stalled
// means" lives here (9c.6: extracted from stalled-jobs.ts when the queue became the 2nd consumer);
// kept pure so it is trivially unit-testable (mirrors the billing/role-gates.ts pure-predicate
// precedent). The caller resolves the authoritative scheduled-start (via resolveScheduledStartAt)
// and passes it in — this predicate stays free of DB/date-resolution concerns.
//
// Stalled is a READ-TIME classification, never a stored status — recomputed on every render from
// the threshold map below + the job's dwell time. The map covers EXACTLY the five non-terminal
// job_statuses codes; terminal statuses (COMPLETED/CANCELLED/CLOSED/CLOSED_BILLED) are outside the
// classifier by construction (design proposal §5). MVP form is a literal map (one threshold-seconds
// value per status); it lifts cleanly to a richer structure / a stalled_thresholds table later if
// rules grow beyond a single duration per status.
//
// The SCHEDULED rule additionally requires "no on-site check-in past the resolved scheduled-start";
// that on-site predicate lives in the reader query logic, not here — this map holds only the duration.

/** Per-status stall thresholds in seconds, keyed by job_statuses.code (non-terminal statuses only). */
export const STALLED_THRESHOLDS_SECONDS = {
  NEW: 4 * 3600, // 4h — untriaged
  SCHEDULED: 2 * 3600, // 2h past resolved scheduled-start with no on-site
  DISPATCHED: 24 * 3600, // 24h — vendor not progressing
  IN_PROGRESS: 72 * 3600, // 72h — work dragging
  ON_HOLD: 7 * 24 * 3600, // 7d — hold gone cold
} as const satisfies Record<string, number>;

/** Composite-urgency tiers, HIGHEST precedence first (design proposal §5). */
export const URGENCY_TIER_ORDER = [
  "stalled",
  "overdue",
  "unassigned-high-priority",
  "aged",
] as const;

export type UrgencyTier = (typeof URGENCY_TIER_ORDER)[number];

/** priorities.rank <= this cutoff counts as "high priority" (rank 1 = EMERGENCY, 2 = URGENT). */
export const HIGH_PRIORITY_RANK_CUTOFF = 2;

/**
 * Is an open job stalled RIGHT NOW? Pure classifier — the caller supplies the DB-derived inputs
 * (current dwell, the already-resolved scheduled-start, the on-site check-in count, and `nowMs`).
 *   - non-SCHEDULED statuses: stalled iff current dwell exceeds the per-status threshold.
 *   - SCHEDULED: stalled iff a resolved scheduled-start exists AND is > threshold (2h) in the past
 *     AND there is no on-site check-in (checkInCount === 0). A null scheduled-start → not stalled
 *     (the rule requires a scheduled start to be past).
 *   - a status with no threshold entry (e.g. a terminal status, defensively) → not stalled.
 */
export function isStalled(input: {
  statusCode: string;
  dwellSeconds: number;
  scheduledStartAt: Date | null;
  checkInCount: number;
  nowMs: number;
}): boolean {
  const threshold = (STALLED_THRESHOLDS_SECONDS as Record<string, number>)[input.statusCode];
  if (threshold === undefined) return false;
  if (input.statusCode === "SCHEDULED") {
    if (input.scheduledStartAt === null) return false;
    const secondsPastStart = (input.nowMs - input.scheduledStartAt.getTime()) / 1000;
    return secondsPastStart > threshold && input.checkInCount === 0;
  }
  return input.dwellSeconds > threshold;
}
