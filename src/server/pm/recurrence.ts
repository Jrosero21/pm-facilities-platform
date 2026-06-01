import { addDays, addWeeks, addMonths } from "date-fns";

// ── Phase 14 engine — PM RECURRENCE date math (F4) ────────────────────────────────────
// Pure, no DB. The interval recurrence model (14b F4): frequency × interval_count advances
// next_due_at. date-fns gives month-safe arithmetic (no hand-rolled month-length/DST bugs).
// Harness-unit-testable directly.

export type PmFrequency = "day" | "week" | "month";

/**
 * Advance a due date by `intervalCount` units of `freq` (every-N recurrence).
 * Defensive: intervalCount < 1 is treated as 1 (never throws — a malformed schedule still
 * advances by one period rather than stalling or going backwards).
 */
export function advanceDueDate(
  from: Date,
  freq: PmFrequency,
  intervalCount: number,
): Date {
  const n = intervalCount >= 1 ? Math.floor(intervalCount) : 1;
  switch (freq) {
    case "day":
      return addDays(from, n);
    case "week":
      return addWeeks(from, n);
    case "month":
      return addMonths(from, n);
  }
}
