// ── Phase 13 batch 13f — EMAIL-INGESTION FAMILY BARREL ────────────────────────────────
// Importing this module wires the whole email-ingestion reader family: importing the two
// reader index modules triggers their self-registration into the core seam (mirroring how
// the external family is wired by importing servicechannel/index). So a consumer that wants
// the readers available just imports this barrel once.
//
// IMPORTING THIS MODULE REGISTERS BOTH STUB READERS (deterministic, ai_assist).
//
// Also re-exports the core contract (types) + the registry fns so callers have one entry
// point for the email-ingestion seam.

// Side-effect imports — register the readers at import time.
import "./readers/deterministic/index";
import "./readers/ai-assist/index";

export * from "./core/types";
export {
  registerReader,
  getReader,
  hasReader,
  listRegisteredReaders,
} from "./core/registry";
