import "server-only";

import type { AgentTool } from "@/server/agents/runner";
import { getFollowupContext, createFollowupDraft, type FollowupContextRow, type FollowupDraft } from "./drafts";

// The chase agent's tools — read-NARROW (one read: the assignment's dispatch context) and
// write-NARROW (one write: a chase draft @ pending_review). Runner-registered so each call
// auto-logs to agent_tool_calls. No path to dispatch_messages / the assignment (never sends).

export const getFollowupContextTool: AgentTool<{ tenantId: string; assignmentId: string }, FollowupContextRow | null> = {
  name: "getFollowupContext",
  kind: "read",
  run: ({ tenantId, assignmentId }) => getFollowupContext(tenantId, assignmentId),
};

export const createFollowupDraftTool: AgentTool<Parameters<typeof createFollowupDraft>[0], FollowupDraft> = {
  name: "createFollowupDraft",
  kind: "write",
  run: (input) => createFollowupDraft(input),
};
