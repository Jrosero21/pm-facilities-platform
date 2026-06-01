// ── Phase 19 — SEND PROVIDER SEAM (interface + types) ─────────────────────────────────
// The outbound-send adapter contract. Channel-agnostic by design: `to`/`body` carry an
// email today; an SMS provider (banked CF-19.2) reuses the same shape with `to`=phone and
// an empty subject. Mirrors the servicechannel PortalAdapter pattern — a types-only module
// that depends on NOTHING in the server layer; concrete impls (resend/capture) live beside
// it and the server calls the factory in ./index. The provider NEVER touches the DB — it
// only sends and reports; the caller (sendCommunication) owns all state writes.

/** What the caller hands the provider. `commId` is the idempotency key (= communication_logs.id). */
export type SendRequest = {
  to: string;
  subject: string;
  body: string;
  commId: string;
};

/** A discriminated result — success carries the provider's message id; failure carries the error. */
export type SendResult =
  | { status: "sent"; providerMessageId: string }
  | { status: "failed"; error: string };

/** The send contract. `name` is recorded in the audit row ('resend' | 'capture'). */
export interface SendProvider {
  readonly name: string;
  send(req: SendRequest): Promise<SendResult>;
}
