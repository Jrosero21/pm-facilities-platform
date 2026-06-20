/**
 * Thread A (CF-19.1a) — wall-clock dispatch-SLA detection.
 * Pure module: per-(dispatch-status, priority) "stuck > X" thresholds.
 * Mirrors stalled-rules.ts but at the assignment grain and priority-VARYING.
 * DETECTION ONLY — no reaction (Phase 28). Wall-clock dwell, NOT business-hours.
 *
 * Shape is nested status->priority->seconds so the banked all-statuses follow-on
 * (ACCEPTED/SCHEDULED/CONFIRMED/ON_SITE) is drop-in: fill more status rows, no
 * restructure. Today only SENT is populated (SENT-only rung).
 *
 * Keyed by priority CODE (priorities are per-tenant; code is the stable key).
 * DEFAULT covers null/unknown/unmapped priority (~35% of non-manual jobs) —
 * treated as ROUTINE. Without DEFAULT a no-priority dispatch would never flag.
 */

const HOUR = 3600;

export const DISPATCH_STUCK_THRESHOLDS_SECONDS = {
  SENT: {
    EMERGENCY: 2 * HOUR,
    URGENT: 4 * HOUR,
    HIGH: 8 * HOUR,
    ROUTINE: 24 * HOUR,
    SCHEDULED: 48 * HOUR,   // priority code SCHEDULED — NOT the dispatch status
    DEFAULT: 24 * HOUR,     // null / unknown / unmapped priority -> routine
  },
} as const satisfies Record<string, Record<string, number>>;

export type DispatchStuckInput = {
  statusCode: string;            // dispatch_assignment_statuses.code, e.g. "SENT"
  priorityCode: string | null;  // priorities.code, or null when job has no priority
  dwellSeconds: number;         // wall-clock dwell in current dispatch status
};

/**
 * Resolve the threshold for a (status, priority) pair, or undefined if the status
 * isn't tracked (e.g. terminal / not-yet-filled). Null/unmapped priority -> DEFAULT.
 */
export function dispatchStuckThresholdSeconds(
  statusCode: string,
  priorityCode: string | null,
): number | undefined {
  const byPriority = (DISPATCH_STUCK_THRESHOLDS_SECONDS as Record<string, Record<string, number>>)[statusCode];
  if (byPriority === undefined) return undefined;           // status not tracked -> never stuck
  const key = priorityCode != null && priorityCode in byPriority ? priorityCode : "DEFAULT";
  return byPriority[key];
}

/**
 * True when the dispatch has dwelled in its current status longer than the
 * (status, priority) threshold allows. Untracked status -> false (not stuck).
 */
export function isDispatchStuck(input: DispatchStuckInput): boolean {
  const threshold = dispatchStuckThresholdSeconds(input.statusCode, input.priorityCode);
  if (threshold === undefined) return false;
  return input.dwellSeconds > threshold;
}
