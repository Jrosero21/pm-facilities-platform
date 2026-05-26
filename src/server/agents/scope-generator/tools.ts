import "server-only";

import type { AgentTool } from "@/server/agents/runner";
import { getJobDetail, type JobDetail } from "@/server/jobs";
import { createScopeDraft, type ScopeDraft } from "./drafts";

// The scope generator's tools — read-NARROW (one read: current-job context only, OQ #6),
// write-NARROW (one write: a draft at pending_review, the agent's only operational-adjacent
// write). Registered through the runner (registerTool) so each call auto-logs to
// agent_tool_calls. getJobDetail already joins client/location/trade/priority names — the
// full context surface the scope generator is allowed to read in Phase 7 (no historical
// scopes, no client/location detail, no templates — OQ #6).

export const getJobDetailTool: AgentTool<{ tenantId: string; jobId: string }, JobDetail | null> = {
  name: "getJobDetail",
  kind: "read",
  run: ({ tenantId, jobId }) => getJobDetail(tenantId, jobId),
};

export const createScopeDraftTool: AgentTool<Parameters<typeof createScopeDraft>[0], ScopeDraft> = {
  name: "createScopeDraft",
  kind: "write",
  run: (input) => createScopeDraft(input),
};
