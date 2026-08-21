// PURE operator-presence rules — NO "server-only", NO DB/env/IO, so vitest reaches it
// (vitest.config.ts covers the pure modules only). Same split G1/G2/G3 and the dispatch template
// follow: rules here, IO in operator-presence.ts.

export type PresenceKind = "eta" | "check_in" | "check_out";

/**
 * ★ PROVENANCE LIVES IN THE AUDIT ACTION NAME (decision b).
 *
 * The presence ROWS carry only recorded_by_user_id / confirmed_by_user_id — a plain user FK with
 * no channel or source column. A row a coordinator wrote while relaying a phone call is therefore
 * INDISTINGUISHABLE, at the row level, from one a vendor self-reported through their portal.
 *
 * Rather than migrate a column in this batch, the distinction is carried by the audit action:
 * the vendor path audits job_vendor_assignment.eta_confirmed / .on_site / .work_complete, while
 * the operator path audits the ".operator_relayed" names below. The audit log can always answer
 * "who said this, and through which door".
 *
 * ★ THE COST, STATED PLAINLY: vendor-performance analytics reads the presence TABLES, not the
 * audit log, so today it CANNOT distinguish operator-relayed from vendor-self-reported and must
 * treat every presence row as same-weight. That matters because "the vendor checked itself in on
 * time" and "the coordinator phoned the vendor and was told they had arrived" are different
 * evidence about vendor reliability. A `source` enum column on all three tables is the
 * analytics-honest end-state and is BANKED, not built here.
 */
export const OPERATOR_PRESENCE_AUDIT_ACTIONS: Record<PresenceKind, string> = {
  eta: "assignment.eta_recorded.operator_relayed",
  check_in: "assignment.checkin_recorded.operator_relayed",
  check_out: "assignment.checkout_recorded.operator_relayed",
};

/** job_events type for the timeline. Distinct per kind so the timeline reads as a sequence. */
export const OPERATOR_PRESENCE_EVENT_TYPES: Record<PresenceKind, string> = {
  eta: "assignment.eta_recorded",
  check_in: "assignment.checkin_recorded",
  check_out: "assignment.checkout_recorded",
};

export const PRESENCE_NOTE_MAX = 500; // matches the note column on all three presence tables

export type PresenceValidationError =
  | "PRESENCE_OCCURRED_AT_INVALID"
  | "PRESENCE_OCCURRED_AT_FUTURE"
  | "PRESENCE_NOTE_TOO_LONG"
  | "PRESENCE_ETA_END_BEFORE_START";

/**
 * A minute of slack absorbs clock skew between the operator's browser and the server without
 * admitting a genuinely future timestamp. Same rule and same reasoning as G2's contact log.
 */
const FUTURE_SLACK_MS = 60_000;

/**
 * Validate a check-in / check-out record.
 *
 * ★ occurredAt MAY NOT BE IN THE FUTURE. A check-in records that the vendor HAS arrived — a
 * future arrival is an ETA, which is a different table and a different verb. Rejecting it here is
 * what keeps the two from blurring.
 *
 * `now` is a parameter, not Date.now(), so the future check is deterministic under test.
 */
export function validatePresenceRecord(
  fields: { occurredAt: Date; note?: string | null },
  now: Date,
): PresenceValidationError | null {
  if (Number.isNaN(fields.occurredAt.getTime())) return "PRESENCE_OCCURRED_AT_INVALID";
  if (fields.occurredAt.getTime() > now.getTime() + FUTURE_SLACK_MS) {
    return "PRESENCE_OCCURRED_AT_FUTURE";
  }
  if ((fields.note ?? "").length > PRESENCE_NOTE_MAX) return "PRESENCE_NOTE_TOO_LONG";
  return null;
}

/**
 * Validate an ETA record.
 *
 * ★ AN ETA IS DELIBERATELY ALLOWED TO BE IN THE FUTURE — that is the entire point of one, and it
 * is the rule that separates this from validatePresenceRecord. What is NOT allowed is a window
 * that ends before it starts.
 */
export function validateEtaRecord(
  fields: { etaStartAt: Date; etaEndAt?: Date | null; note?: string | null },
): PresenceValidationError | null {
  if (Number.isNaN(fields.etaStartAt.getTime())) return "PRESENCE_OCCURRED_AT_INVALID";
  if (fields.etaEndAt != null) {
    if (Number.isNaN(fields.etaEndAt.getTime())) return "PRESENCE_OCCURRED_AT_INVALID";
    if (fields.etaEndAt.getTime() < fields.etaStartAt.getTime()) {
      return "PRESENCE_ETA_END_BEFORE_START";
    }
  }
  if ((fields.note ?? "").length > PRESENCE_NOTE_MAX) return "PRESENCE_NOTE_TOO_LONG";
  return null;
}

/**
 * ★ THE ONE NON-PRESENCE WRITE, AND WHY IT IS OPT-IN.
 *
 * scheduledStartAt has exactly two writers today: createDispatch, and the VENDOR's confirmEta as a
 * side effect of its ACCEPTED→SCHEDULED transition. There is NO operator reschedule path at all —
 * so when a vendor phones in "I'm coming at 4 instead", a coordinator has no way to move the
 * scheduled time, and the work order PDF goes on printing the stale "Scheduled start".
 *
 * operatorRecordEta can close that, but it must be a CHOICE. Recording what the vendor said and
 * changing what we have committed to are different acts: an operator noting "they now say 4pm"
 * while a 2pm slot is still contractually held is a real situation. Default false keeps the module
 * presence-only; true is the deliberate reschedule.
 */
export function shouldUpdateScheduledStart(updateSchedule: boolean | undefined): boolean {
  return updateSchedule === true;
}
