// PURE contact-log rules — NO "server-only", NO DB/env/IO, so vitest covers it (vitest.config.ts
// runs the pure modules only). G2's decisions live here rather than inside the writer, because the
// interesting parts are all mappings and validation, and a mapping that is not unit-tested is a
// mapping nobody checks.

export type ContactDirection = "outbound" | "inbound";
export type ContactParty = "client" | "vendor";

/** Same excerpt rule shareNote uses for the timeline summary (500-char column, 200-char excerpt). */
export function contactSummaryExcerpt(notes: string): string {
  const trimmed = notes.trim();
  return trimmed.length > 200 ? `${trimmed.slice(0, 197)}…` : trimmed;
}

/**
 * ★ THE DELIVERY STATUS OF A CALL THAT ALREADY HAPPENED.
 *
 * There is no "logged" value in the delivery_status enum (draft·queued·sent·delivered·failed·
 * bounced·received) and this build does NOT invent one — a new enum value means a migration, and
 * the existing vocabulary already says what we need.
 *
 * The mapping is to the TWO TERMINAL states, and terminal is the whole point:
 *   inbound  → "received"  — the state machine's documented inbound terminal
 *   outbound → "delivered" — a call that took place WAS received by the person on the other end
 *
 * Both are terminal in DELIVERY_TRANSITIONS (delivered: [], received: []), which buys a real
 * safety property rather than just a label: sendCommunication's legal-transition guard refuses
 * every transition out of them, so a logged call can never be picked up and "sent" by the provider
 * path. A recorded fact cannot be turned into a transmission by any later operator click.
 *
 * "sent" was rejected deliberately: it is reachable onward to delivered/failed, so a logged call
 * would offer a "mark failed" affordance for a conversation that demonstrably happened.
 */
export function contactLogDeliveryStatus(direction: ContactDirection): "received" | "delivered" {
  return direction === "inbound" ? "received" : "delivered";
}

/**
 * communication_logs.source_type + source_id are BOTH NOT NULL — every spine row must point at a
 * content row. A call therefore stores its notes in the matching channel-detail table, exactly as
 * every other channel does, rather than being a spine row with nothing behind it.
 *   outbound → outbound_messages (body = the call notes)
 *   inbound  → inbound_messages  (raw_body = the call notes, received_at = when the call happened)
 * inbound_messages was built for precisely this ("Phase 6: an operator manually logs an inbound
 * message"), so G2 reuses it rather than adding a table.
 */
export function contactLogSourceType(
  direction: ContactDirection,
): "outbound_message" | "inbound_message" {
  return direction === "inbound" ? "inbound_message" : "outbound_message";
}

/** A logged call is an internal record of an off-system contact — never client- or vendor-facing. */
export const CONTACT_LOG_VISIBILITY = "internal_only" as const;

/** phone_call has been in the channel enum since Phase 6 with no writer; G2 is that writer. */
export const CONTACT_LOG_CHANNEL = "phone_call" as const;

export type ContactLogValidationError =
  | "CONTACT_NOTES_REQUIRED"
  | "CONTACT_NOTES_TOO_LONG"
  | "CONTACT_OCCURRED_AT_INVALID"
  | "CONTACT_OCCURRED_AT_FUTURE";

export type ContactLogFields = {
  notes: string;
  occurredAt: Date;
};

/**
 * Validate the operator's input. Returns the first problem, or null when the input is usable.
 * `now` is a parameter, not Date.now(), so the future check is deterministic under test.
 *
 * A log records something that ALREADY happened, so a future occurredAt is rejected rather than
 * stored — a "call" dated tomorrow is not a record, it is a mistake or a reminder, and the log is
 * not the place for either. One minute of slack absorbs clock skew between the operator's browser
 * and the server without opening the door to a genuinely future date.
 */
export const CONTACT_NOTES_MAX = 5000;
const FUTURE_SLACK_MS = 60_000;

export function validateContactLog(
  fields: ContactLogFields,
  now: Date,
): ContactLogValidationError | null {
  if (fields.notes.trim().length === 0) return "CONTACT_NOTES_REQUIRED";
  if (fields.notes.trim().length > CONTACT_NOTES_MAX) return "CONTACT_NOTES_TOO_LONG";
  if (Number.isNaN(fields.occurredAt.getTime())) return "CONTACT_OCCURRED_AT_INVALID";
  if (fields.occurredAt.getTime() > now.getTime() + FUTURE_SLACK_MS) {
    return "CONTACT_OCCURRED_AT_FUTURE";
  }
  return null;
}
