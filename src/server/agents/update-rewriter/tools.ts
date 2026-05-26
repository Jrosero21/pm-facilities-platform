import "server-only";

import type { AgentTool } from "@/server/agents/runner";
import { getJobNote, type JobNoteRow } from "@/server/job-notes";
import { getJobDetail, type JobDetail } from "@/server/jobs";
import { listAssignmentsForJob, type AssignmentListItem } from "@/server/dispatch";
import { createRewriteDraft, type UpdateRewriteDraftRow } from "@/server/agents/drafts";

// The rewriter's tools — read-BROAD (3 reads for context), write-NARROW (1 write: a draft
// at pending_review, the agent's only operational-adjacent write). Registered through the
// runner (registerTool) so each call auto-logs to agent_tool_calls. getClientForJob is NOT
// needed — getJobDetail already joins clientName (LOCK 3).

export const getJobNoteTool: AgentTool<{ tenantId: string; noteId: string }, JobNoteRow | null> = {
  name: "getJobNote",
  kind: "read",
  run: ({ tenantId, noteId }) => getJobNote(tenantId, noteId),
};

export const getJobDetailTool: AgentTool<{ tenantId: string; jobId: string }, JobDetail | null> = {
  name: "getJobDetail",
  kind: "read",
  run: ({ tenantId, jobId }) => getJobDetail(tenantId, jobId),
};

export const listAssignmentsTool: AgentTool<{ tenantId: string; jobId: string }, AssignmentListItem[]> = {
  name: "listAssignmentsForJob",
  kind: "read",
  run: ({ tenantId, jobId }) => listAssignmentsForJob(tenantId, jobId),
};

export const createRewriteDraftTool: AgentTool<
  Parameters<typeof createRewriteDraft>[0],
  UpdateRewriteDraftRow
> = {
  name: "createRewriteDraft",
  kind: "write",
  run: (input) => createRewriteDraft(input),
};
