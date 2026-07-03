import "server-only";

import type { AgentTool } from "@/server/agents/runner";
import { getInboundEmailBlob, createIntakeDraft, type InboundEmailBlob, type IntakeDraft } from "./drafts";

// The intake parser's tools — read-NARROW (one read: the stored inbound_emails blob) and
// write-NARROW (one write: a partial draft @ pending_review). Registered through the runner
// (registerTool) so each call auto-logs to agent_tool_calls. The parser has NO path to jobs.

export const getInboundEmailTool: AgentTool<{ tenantId: string; inboundEmailId: string }, InboundEmailBlob | null> = {
  name: "getInboundEmail",
  kind: "read",
  run: ({ tenantId, inboundEmailId }) => getInboundEmailBlob(tenantId, inboundEmailId),
};

export const createIntakeDraftTool: AgentTool<Parameters<typeof createIntakeDraft>[0], IntakeDraft> = {
  name: "createIntakeDraft",
  kind: "write",
  run: (input) => createIntakeDraft(input),
};
