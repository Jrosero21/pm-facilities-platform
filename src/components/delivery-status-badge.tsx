// Delivery-status vocabulary + state machine + badge. Shared module (no directive):
// the data layer imports the transition logic for validation; the UI imports the badge
// + legal-transition helper to render the right buttons.
//
// State machine (R-6.x): outbound draft → {sent,queued}; queued → sent; sent →
// {delivered,failed}; failed → sent (manual retry). Terminals: delivered, bounced.
// Inbound: received (terminal). Monotonic forward; only backward path is failed→sent.
// Phase 6 = manual operator marking; Phase 13 automates. `read` is the read_at
// timestamp, NOT a status. Palette is R-5.13-consistent (amber = operator-action).

export type DeliveryStatus =
  | "draft"
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "bounced"
  | "received";

const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  draft: ["sent", "queued"],
  queued: ["sent"],
  sent: ["delivered", "failed"],
  failed: ["sent"],
  delivered: [],
  bounced: [],
  received: [],
};

export function legalDeliveryTransitions(status: string): DeliveryStatus[] {
  return DELIVERY_TRANSITIONS[status as DeliveryStatus] ?? [];
}
export function isLegalDeliveryTransition(from: string, to: string): boolean {
  return legalDeliveryTransitions(from).includes(to as DeliveryStatus);
}

const DELIVERY_META: Record<DeliveryStatus, { label: string; badge: string }> = {
  draft: { label: "Draft", badge: "bg-neutral-100 text-neutral-700" },
  queued: { label: "Queued", badge: "bg-blue-100 text-blue-800" },
  sent: { label: "Sent", badge: "bg-blue-100 text-blue-800" },
  delivered: { label: "Delivered", badge: "bg-green-100 text-green-800" },
  received: { label: "Received", badge: "bg-green-100 text-green-800" },
  failed: { label: "Failed", badge: "bg-amber-100 text-amber-800" },
  bounced: { label: "Bounced", badge: "bg-red-100 text-red-700" },
};

export function deliveryStatusLabel(s: string): string {
  return DELIVERY_META[s as DeliveryStatus]?.label ?? s;
}

// ── G2 polish — A LOGGED CALL IS NOT A TRANSMISSION ───────────────────────────────────
// logContact stores delivered (outbound) / received (inbound) because those are the two TERMINAL
// delivery states, which is what stops sendCommunication from ever picking a logged call up. That
// is the right DATA and the wrong WORD: "Delivered" on a phone call reads as though the platform
// mailed something. So the badge — and only the badge — special-cases the phone_call channel.
//
// DISPLAY ONLY. No delivery_status value changes, no row is rewritten, and every non-phone_call
// row takes the identical code path it took before (same DELIVERY_META lookup, same draft
// fallback), so email badges are byte-identical.
//
// The special-case lives HERE rather than at the two call sites (job page + job timeline) so
// there is one place to change, and any future reader of a comm row gets it for free.
//
// Palette: the neutral grey already used for Draft. Both mean "inert, nothing to act on" — a
// logged call has no next step, and grey is the vocabulary's existing word for that. Giving it a
// green delivery colour would re-assert the transmission reading this change exists to remove.
const CALL_BADGE = "bg-neutral-100 text-neutral-700";

/**
 * The badge a communication row should render. Pure — exported for unit tests.
 * `channel`/`direction` are optional so existing callers that pass only a status are unaffected.
 */
export function communicationBadgeMeta(
  status: string,
  channel?: string,
  direction?: string,
): { label: string; badge: string } {
  if (channel === "phone_call") {
    return {
      label: direction === "inbound" ? "Inbound call" : "Outbound call",
      badge: CALL_BADGE,
    };
  }
  return DELIVERY_META[status as DeliveryStatus] ?? DELIVERY_META.draft;
}

export function DeliveryStatusBadge({
  status,
  channel,
  direction,
}: {
  status: string;
  channel?: string;
  direction?: string;
}) {
  const meta = communicationBadgeMeta(status, channel, direction);
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${meta.badge}`}>
      {meta.label}
    </span>
  );
}
