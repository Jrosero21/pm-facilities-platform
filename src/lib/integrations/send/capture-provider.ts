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

// ── G1 batch 1 — ATTACHMENT HONESTY ───────────────────────────────────────────────────
// The capture buffer already holds the whole SendRequest, attachments included, so existing
// assertions (getCaptured().length, entry fields) are untouched. What was missing is a way to
// assert on attachments WITHOUT reading bytes: a harness that only checked subject/body would
// pass a send that silently dropped or duplicated a PDF. This summarizes what WOULD have been
// transmitted — names, declared type, and byte size — while the provider still transmits nothing.

export type CapturedAttachment = {
  filename: string;
  contentType?: string;
  /** Size of the payload as captured: decoded length for base64, byteLength for raw bytes. */
  size: number;
};

/** Per-send attachment summary, in capture order. A send with none yields an empty array. */
export function getCapturedAttachments(): readonly CapturedAttachment[][] {
  return captured.map((req) =>
    (req.attachments ?? []).map((a) => ({
      filename: a.filename,
      ...(a.contentType ? { contentType: a.contentType } : {}),
      size:
        typeof a.content === "string"
          ? Buffer.from(a.content, "base64").byteLength
          : a.content.byteLength,
    })),
  );
}

/** Total attachments across every captured send — the one-number "did anything attach?" check. */
export function countCapturedAttachments(): number {
  return captured.reduce((n, req) => n + (req.attachments?.length ?? 0), 0);
}

export class CaptureProvider implements SendProvider {
  readonly name = "capture";

  async send(req: SendRequest): Promise<SendResult> {
    captured.push(req);
    // Synthetic id — unique per call; sends nothing, reaches no network.
    return { status: "sent", providerMessageId: `cap_${req.commId}_${captured.length}` };
  }
}
