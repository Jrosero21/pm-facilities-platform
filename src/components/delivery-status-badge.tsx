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

export function DeliveryStatusBadge({ status }: { status: string }) {
  const meta = DELIVERY_META[status as DeliveryStatus] ?? DELIVERY_META.draft;
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${meta.badge}`}>
      {meta.label}
    </span>
  );
}
