// ── Phase 13 batch 13f — DETERMINISTIC EMAIL READER (STUB) ────────────────────────────
// The FIRST reader. Conforms to EmailReader; depends on core ONLY (../../core/types) —
// never the reverse, never a sibling reader, never the server layer (§2.1: the platform is
// source-agnostic; email is one intake channel among many).
//
// STUB — CF-13.3: real per-format field extraction lands when sample emails exist to tune
// against. parse() returns a failed/0-confidence draft so EVERY email routes to operator
// review until real format rules are registered (the never-throws review-routing contract).
// It reads NO real rules and does NO extraction this phase — it only passes through the
// provenance + raw, exactly as the ServiceChannel adapter's deferred stubs return inert data.

import type { EmailReader, EmailParseDraft, EmailReaderInput } from "../../core/types";

class DeterministicReader implements EmailReader {
  /**
   * STUB parse — returns a fixed failed/0 draft (CF-13.3). Never throws: an unreadable or
   * un-ruled email is a 'failed' draft routed to review, not an exception. Passes through
   * the provenance (sourceType) and the original message (raw); extracts nothing yet.
   */
  parse(input: EmailReaderInput): EmailParseDraft {
    return {
      parserKind: "deterministic",
      parseOutcome: "failed",
      confidence: 0,
      sourceType: input.sourceType,
      raw: input.raw,
    };
  }
}

export const deterministicReader: EmailReader = new DeterministicReader();
