// ── Phase 19 — RESEND PROVIDER (real impl) ────────────────────────────────────────────
// The live email sender. Dependency-light: raw fetch against Resend's HTTP API, no SDK
// package (matches the no-extra-package lean). Reads RESEND_API_KEY at construction and
// throws if absent — it must NEVER exist without a key; the factory (./index) only ever
// constructs it when RESEND_API_KEY is present and SEND_CAPTURE!=1. The harness never builds
// this (it forces the CaptureProvider), so api.resend.com is never reached under test.

import type { SendProvider, SendRequest, SendResult } from "./provider";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

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
        body: JSON.stringify({
          from: this.fromAddress,
          to: req.to,
          subject: req.subject,
          text: req.body,
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
