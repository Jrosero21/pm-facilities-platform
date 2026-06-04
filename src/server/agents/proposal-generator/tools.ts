import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { jobStatuses, jobs } from "@/server/schema";
import type { AgentTool } from "@/server/agents/runner";
import { getJobDetail, type JobDetail } from "@/server/jobs";
import { createProposalDraft, type ProposalDraft } from "./drafts";

// The proposal generator's tools — read-BROAD (job context + the job's status CODE for the
// eligibility gate), write-NARROW (one write: a draft at pending_review, the agent's only
// operational-adjacent write). Registered through the runner (registerTool) so each call
// auto-logs to agent_tool_calls. Mirrors invoice-creator/tools.ts (minus the vendor reads —
// the proposal has no AP source).

export const getJobDetailTool: AgentTool<{ tenantId: string; jobId: string }, JobDetail | null> = {
  name: "getJobDetail",
  kind: "read",
  run: ({ tenantId, jobId }) => getJobDetail(tenantId, jobId),
};

/**
 * Resolve a job's current status CODE (stable join key, e.g. "IN_PROGRESS" — distinct from the
 * tenant-editable status NAME). JobDetail exposes only statusName, so this focused read backs the
 * eligibility gate (active/billable job). Tenant-scoped.
 */
async function getJobStatusCode(tenantId: string, jobId: string): Promise<string | null> {
  const rows = await db
    .select({ code: jobStatuses.code })
    .from(jobs)
    .innerJoin(jobStatuses, eq(jobs.currentStatusId, jobStatuses.id))
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId)))
    .limit(1);
  return rows[0]?.code ?? null;
}

export const getJobStatusCodeTool: AgentTool<{ tenantId: string; jobId: string }, string | null> = {
  name: "getJobStatusCode",
  kind: "read",
  run: ({ tenantId, jobId }) => getJobStatusCode(tenantId, jobId),
};

export const createProposalDraftTool: AgentTool<Parameters<typeof createProposalDraft>[0], ProposalDraft> = {
  name: "createProposalDraft",
  kind: "write",
  run: (input) => createProposalDraft(input),
};
