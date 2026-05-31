// ── Phase 13 batch 13f — DETERMINISTIC READER REGISTRATION ────────────────────────────
// Importing this module registers the deterministic reader into the core seam. This is THE
// one line that wires a reader — no core change was needed to add it (§2.1): a new reader =
// a new folder (reader.ts) + this self-registration. The kind 'deterministic' matches
// email_parse_results.parser_kind (0034). Mirrors servicechannel/index.ts exactly.

import { registerReader } from "../../core/registry";
import { deterministicReader } from "./reader";

registerReader("deterministic", deterministicReader);

export { deterministicReader };
