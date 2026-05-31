// ── Phase 13 batch 13f — EMAIL-INGESTION CORE: reader registry (the seam) ─────────────
// The parser_kind → reader lookup, mirroring src/lib/integrations/core/registry.ts (the
// external adapter registry). Readers SELF-REGISTER at their own import time — so this
// registry is a mutable map populated by readers calling registerReader(), not a literal.
//
// §2.1 INVARIANT (load-bearing): core NEVER imports a concrete reader. No parser_kind impl
// is named here. The deterministic + ai_assist readers (13f) each call
// registerReader("deterministic"|"ai_assist", …) from their own index.ts at import time.
// Adding a reader = a new reader folder + one self-registration call, with ZERO change to core.
//
// kind is the EmailParserKind union (mirrors email_parse_results.parser_kind, 0034) — the
// two registries differ deliberately: the external family keys on `provider` (varchar), the
// email family keys on `parser_kind` (a fixed 2-value union).

import type { EmailParserKind, EmailReader } from "./types";

const READERS = new Map<EmailParserKind, EmailReader>();

/** Register a reader under its parser_kind. Readers call this at import time. */
export function registerReader(kind: EmailParserKind, reader: EmailReader): void {
  READERS.set(kind, reader);
}

/**
 * Resolve the reader for a parser_kind. Throws UNKNOWN_PARSER_KIND if none is registered
 * (the reader module wasn't imported, or the kind is wrong).
 */
export function getReader(kind: EmailParserKind): EmailReader {
  const reader = READERS.get(kind);
  if (!reader) {
    throw new Error(
      `UNKNOWN_PARSER_KIND: no reader registered for "${kind}"`,
    );
  }
  return reader;
}

/** True iff a reader is registered for `kind`. */
export function hasReader(kind: EmailParserKind): boolean {
  return READERS.has(kind);
}

/** The registered parser kinds — the enumeration seam (Phase 16). */
export function listRegisteredReaders(): EmailParserKind[] {
  return [...READERS.keys()];
}
