// ── Phase 19 — RESEND PROVIDER (real impl) ────────────────────────────────────────────
// The live email sender. Dependency-light: raw fetch against Resend's HTTP API, no SDK
// package (matches the no-extra-package lean). Reads RESEND_API_KEY at construction and
// throws if absent — it must NEVER exist without a key; the factory (./index) only ever
// constructs it when RESEND_API_KEY is present and SEND_CAPTURE!=1. The harness never builds
// this (it forces the CaptureProvider), so api.resend.com is never reached under test.

import type { SendAttachment, SendProvider, SendRequest, SendResult } from "./provider";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * G1 batch 1 — map our channel-agnostic attachment to Resend's REST shape.
 * Resend's HTTP API takes an `attachments` array of { filename, content, content_type? } where
 * `content` is a base64 STRING (the Node SDK accepts a Buffer; the raw REST endpoint does not,
 * so raw bytes are encoded here — the caller never has to think about it). content_type is
 * snake_case on the REST API (the SDK's camelCase `contentType` is a different surface).
 */
function toResendAttachment(a: SendAttachment): Record<string, string> {
  const content =
    typeof a.content === "string" ? a.content : Buffer.from(a.content).toString("base64");
  return {
    filename: a.filename,
    content,
    ...(a.contentType ? { content_type: a.contentType } : {}),
  };
}

export class ResendProvider implements SendProvider {
  readonly name = "resend";
  private readonly apiKey: string;
  private readonly fromAddress: string;

  constructor() {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      // Fail-closed: the factory guards this, but never let a keyless instance exist.
      throw new Error("RESEND_API_KEY_MISSING");
    }
    this.apiKey = key;
    // The verified sender. Configurable; falls back to a placeholder that Resend will reject
    // loudly rather than silently mis-send.
    this.fromAddress = process.env.RESEND_FROM ?? "no-reply@pm-facilities.invalid";
  }

  async send(req: SendRequest): Promise<SendResult> {
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          // Resend honours an idempotency key — a retry with the same commId will not
          // deliver twice even if our pre-call guard is bypassed by a race.
          "Idempotency-Key": req.commId,
        },
        // The `attachments` key is SPREAD IN ONLY when there is at least one — an absent or
        // empty array leaves the payload byte-for-byte what it was before G1 batch 1.
        body: JSON.stringify({
          from: this.fromAddress,
          to: req.to,
          subject: req.subject,
          text: req.body,
          ...(req.attachments && req.attachments.length > 0
            ? { attachments: req.attachments.map(toResendAttachment) }
            : {}),
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return { status: "failed", error: `resend ${res.status}: ${detail.slice(0, 300)}` };
      }
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      if (!data.id) {
        return { status: "failed", error: "resend: 2xx without a message id" };
      }
      return { status: "sent", providerMessageId: data.id };
    } catch (err) {
      return { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  }
}
