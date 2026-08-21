// PURE re-dispatch-after-cancellation rules — NO "server-only", NO DB/env/IO, so vitest reaches
// it. Same rules-here / IO-there split the rest of the foundation work follows.

/**
 * ★ THE LIVE STATES A CANCELLATION CAN ARRIVE IN.
 *
 * Deliberately BROADER than approveRedispatch's SENT-only guard. That path exists for a vendor who
 * never answered, so SENT is the only state it can find. A cancellation is different: the vendor
 * DID answer, and they can withdraw at any point before work starts — right after we sent it, after
 * they accepted, after a date was agreed, even after they confirmed the day before. Restricting
 * this to SENT would refuse exactly the cases most worth capturing, because a vendor who cancels
 * after CONFIRMED has cost the most scheduling.
 *
 * ON_SITE and WORK_COMPLETE are excluded: once the vendor is on site the situation is a partial
 * job or a dispute, not a re-dispatch, and closing it as DECLINED would misdescribe work that was
 * actually begun.
 */
export const CANCELLABLE_ASSIGNMENT_STATUSES = [
  "SENT",
  "ACCEPTED",
  "SCHEDULED",
  "CONFIRMED",
] as const;

export type CancellableStatus = (typeof CANCELLABLE_ASSIGNMENT_STATUSES)[number];

/**
 * ★ THE HONEST CLOSE — DECLINED, NEVER GHOSTED.
 *
 * approveRedispatch closes the old assignment as GHOSTED, with the note "vendor did not respond".
 * For its own case that is true. For a cancellation it is a LIE, and an expensive one: GHOSTED is
 * the strongest negative reliability signal the platform has, and a vendor who phoned ahead to
 * cancel has behaved in the opposite way to one who went silent. Recording the first as the second
 * corrupts vendor-performance scoring and the vendor's standing on every future ranking.
 *
 * DECLINED is the honest word — the vendor responded and said no — and it already carries category
 * 'cancelled', so every existing reader that counts non-active assignments keeps working.
 *
 * ★ BANKED CAVEAT: DECLINED still conflates two genuinely different signals — "declined the
 * dispatch upfront" (cheap; we re-dispatch immediately) and "cancelled after accepting" (worse; we
 * held a slot, possibly told the client a date, and lost the time). A distinct VENDOR_CANCELLED
 * status is the precise end-state; it needs an enum migration and is NOT built here. Until it
 * exists, vendor-performance treats the two as one. Ties to the deferred "Vendor Declined" label
 * work.
 */
export const CANCELLATION_CLOSE_STATUS = "DECLINED" as const;

/** The status this must never use. Pinned so a future edit toward GHOSTED fails a test first. */
export const CANCELLATION_FORBIDDEN_CLOSE_STATUS = "GHOSTED" as const;

export type RedispatchCancellationError =
  | "ASSIGNMENT_NOT_FOUND"
  | "ASSIGNMENT_NOT_CANCELLABLE"
  | "CANCELLATION_NOTE_TOO_LONG";

export const CANCELLATION_NOTE_MAX = 500;

/** True when a cancellation can still be recorded against an assignment in this status. */
export function isCancellableStatus(statusCode: string): statusCode is CancellableStatus {
  return (CANCELLABLE_ASSIGNMENT_STATUSES as readonly string[]).includes(statusCode);
}

/**
 * Validate a cancellation before any write.
 *
 * Returns the first problem, or null when the input is usable. Pure — the caller supplies the
 * assignment's current status code rather than this module reading it.
 */
export function validateRedispatchCancellation(input: {
  currentStatusCode: string;
  note?: string | null;
}): RedispatchCancellationError | null {
  if (!isCancellableStatus(input.currentStatusCode)) return "ASSIGNMENT_NOT_CANCELLABLE";
  if ((input.note ?? "").length > CANCELLATION_NOTE_MAX) return "CANCELLATION_NOTE_TOO_LONG";
  return null;
}

/**
 * The note stored on the closed assignment. Always states WHO ended it and that the vendor
 * responded — so a later reader of the status history cannot mistake it for a silent drop-off even
 * if the status vocabulary is later reworked.
 */
export function buildCancellationNote(reason?: string | null): string {
  const trimmed = (reason ?? "").trim();
  return trimmed.length > 0
    ? `Vendor cancelled (recorded by coordinator): ${trimmed}`
    : "Vendor cancelled (recorded by coordinator).";
}
