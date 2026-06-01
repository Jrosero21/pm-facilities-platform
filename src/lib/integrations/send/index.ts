// ── Phase 19 — SEND SEAM (factory + public surface) ───────────────────────────────────
// getSendProvider() selects the impl by env, mirroring the llm-routing presence-check shape
// (mock unless a key is present). THE HONESTY GUARANTOR: when SEND_CAPTURE=1 OR RESEND_API_KEY
// is absent, the CaptureProvider is returned and **ResendProvider is NEVER constructed** — so
// the harness (which sets SEND_CAPTURE=1) cannot reach api.resend.com. ResendProvider is only
// built when a real key is present and capture is not forced.

import type { SendProvider } from "./provider";
import { CaptureProvider } from "./capture-provider";
import { ResendProvider } from "./resend-provider";

export type { SendProvider, SendRequest, SendResult } from "./provider";
export { CaptureProvider, getCaptured, resetCaptured } from "./capture-provider";
export { ResendProvider } from "./resend-provider";

/**
 * Resolve the active send provider.
 * - SEND_CAPTURE=1 (the harness flag) → CaptureProvider (no network, ResendProvider not built).
 * - RESEND_API_KEY absent → CaptureProvider (fail-safe: no key, no real send).
 * - otherwise → ResendProvider (live).
 */
export function getSendProvider(): SendProvider {
  if (process.env.SEND_CAPTURE === "1" || !process.env.RESEND_API_KEY) {
    return new CaptureProvider();
  }
  return new ResendProvider();
}
