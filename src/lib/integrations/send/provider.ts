// ── Phase 19 — SEND PROVIDER SEAM (interface + types) ─────────────────────────────────
// The outbound-send adapter contract. Channel-agnostic by design: `to`/`body` carry an
// email today; an SMS provider (banked CF-19.2) reuses the same shape with `to`=phone and
// an empty subject. Mirrors the servicechannel PortalAdapter pattern — a types-only module
// that depends on NOTHING in the server layer; concrete impls (resend/capture) live beside
// it and the server calls the factory in ./index. The provider NEVER touches the DB — it
// only sends and reports; the caller (sendCommunication) owns all state writes.

// ── G1 batch 1 — ATTACHMENTS (additive) ───────────────────────────────────────────────
// Added so an invoice email can carry its PDF. STRICTLY OPTIONAL: a SendRequest without the
// field produces byte-for-byte the request the provider sent before this existed. No existing
// caller passes it, so no existing send changes.
//
// `content` is base64 TEXT or RAW BYTES. Uint8Array (not Buffer) is the declared byte type so
// this module stays platform-neutral and depends on nothing — Buffer extends Uint8Array, so a
// caller holding a Buffer (e.g. renderClientInvoicePdf's bytes) satisfies it with no cast.
// Normalizing raw bytes → base64 is the concrete provider's job, not the caller's.
export type SendAttachment = {
  /** The name the recipient sees, e.g. "INV-000019.pdf". */
  filename: string;
  /** Base64 string, or raw bytes the provider will base64-encode. */
  content: string | Uint8Array;
  /** MIME type, e.g. "application/pdf". Omitted ⇒ the provider/recipient infers from filename. */
  contentType?: string;
};

/** What the caller hands the provider. `commId` is the idempotency key (= communication_logs.id). */
export type SendRequest = {
  to: string;
  subject: string;
  body: string;
  commId: string;
  /** OPTIONAL. Absent ⇒ unchanged legacy behaviour; the field is not sent to the provider. */
  attachments?: SendAttachment[];
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
