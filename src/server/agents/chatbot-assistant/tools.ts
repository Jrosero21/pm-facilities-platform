import "server-only";

import type { AgentTool } from "@/server/agents/runner";
import {
  searchKnowledge,
  readDoc,
  type SearchKnowledgeResult,
  type ReadDocResult,
} from "./knowledge";

// ── Phase 16 (16d) — the assistant's knowledge tools ──────────────────────────────────
// Both are read-NARROW and route through the resolveDocPath guard (knowledge.ts). Registered
// through the shared runner (registerTool) so each call auto-logs to agent_tool_calls.
// Knowledge is platform-level — these tools take NO tenantId (docs/ is shared product
// knowledge, not tenant data). Operational, tenant-scoped read tools land in 16e.

export const searchKnowledgeTool: AgentTool<{ query: string }, SearchKnowledgeResult> = {
  name: "searchKnowledge",
  kind: "read",
  run: ({ query }) => Promise.resolve(searchKnowledge(query)),
};

export const readDocTool: AgentTool<{ path: string }, ReadDocResult> = {
  name: "readDoc",
  kind: "read",
  run: ({ path }) => Promise.resolve(readDoc(path)),
};
