// ── Phase 13 batch 13f — AI-ASSIST EMAIL READER (STUB) ────────────────────────────────
// The second reader. Conforms to EmailReader; depends on core ONLY (../../core/types) —
// never the reverse, never a sibling reader, never the server layer (§2.1).
//
// STUB — CF-13.3: NO LLM call this phase. AI-assist is an operator-invoked draft helper
// INSIDE the review queue (§2.5 — AI output is a draft a human confirms; it NEVER
// auto-creates a job). The real prompt + agent-runner call (mirroring the Phase-6/7 agent
// substrate) lands once sample emails exist to tune against. parse() returns a failed/0
// draft so nothing auto-proceeds — the operator invokes this only to get a suggestion to
// confirm/correct, never an automatic result.

import type { EmailReader, EmailParseDraft, EmailReaderInput } from "../../core/types";

class AiAssistReader implements EmailReader {
  /**
   * STUB parse — returns a fixed failed/0 draft (CF-13.3). No LLM is called. Never throws.
   * Passes through provenance + raw; extracts nothing yet. When activated, this becomes the
   * operator-invoked draft-assist (§2.5 human-confirms), never an auto-parser.
   */
  parse(input: EmailReaderInput): EmailParseDraft {
    return {
      parserKind: "ai_assist",
      parseOutcome: "failed",
      confidence: 0,
      sourceType: input.sourceType,
      raw: input.raw,
    };
  }
}

export const aiAssistReader: EmailReader = new AiAssistReader();
