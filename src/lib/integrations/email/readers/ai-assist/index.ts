// ── Phase 13 batch 13f — AI-ASSIST READER REGISTRATION ────────────────────────────────
// Importing this module registers the ai-assist reader into the core seam (§2.1: a new
// reader = a new folder + this one self-registration, zero core change). The kind
// 'ai_assist' matches email_parse_results.parser_kind (0034). Mirrors servicechannel/index.ts.

import { registerReader } from "../../core/registry";
import { aiAssistReader } from "./reader";

registerReader("ai_assist", aiAssistReader);

export { aiAssistReader };
