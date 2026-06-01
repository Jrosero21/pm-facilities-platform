// ── Phase 19 — CAPTURE PROVIDER (harness / no-op) ─────────────────────────────────────
// Sends NOTHING. Records each SendRequest in an in-memory buffer and returns a synthetic
// providerMessageId. The phase-blocking harness forces this (SEND_CAPTURE=1) so the full
// send path — compose → provider.send() → flip to sent + store provider id — is exercised
// end-to-end without touching the network. The buffer (getCaptured/resetCaptured) is the
// harness's assertion surface: "exactly N payloads captured, ResendProvider never built".

import type { SendProvider, SendRequest, SendResult } from "./provider";

const captured: SendRequest[] = [];

/** All payloads the CaptureProvider has "sent" this process. Harness reads this. */
export function getCaptured(): readonly SendRequest[] {
  return captured;
}

/** Clear the capture buffer (harness setup/teardown). */
export function resetCaptured(): void {
  captured.length = 0;
}

export class CaptureProvider implements SendProvider {
  readonly name = "capture";

  async send(req: SendRequest): Promise<SendResult> {
    captured.push(req);
    // Synthetic id — unique per call; sends nothing, reaches no network.
    return { status: "sent", providerMessageId: `cap_${req.commId}_${captured.length}` };
  }
}
