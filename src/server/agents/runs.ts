import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { agentRuns, agentToolCalls, agentDecisions } from "@/server/schema";

export type AgentRunRow = typeof agentRuns.$inferSelect;
export type AgentToolCallRow = typeof agentToolCalls.$inferSelect;
export type AgentDecisionRow = typeof agentDecisions.$inferSelect;

/** One run by id, tenant-scoped. */
export async function getRun(tenantId: string, id: string): Promise<AgentRunRow | null> {
  const rows = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.tenantId, tenantId), eq(agentRuns.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

/** Runs for a job, newest first. */
export async function listRunsForJob(tenantId: string, jobId: string): Promise<AgentRunRow[]> {
  return db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.tenantId, tenantId), eq(agentRuns.jobId, jobId)))
    .orderBy(desc(agentRuns.createdAt));
}

/** Runs for an agent_id, newest first (analytics — groups behaviorally-equivalent runs). */
export async function listRunsForAgent(tenantId: string, agentId: string): Promise<AgentRunRow[]> {
  return db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.tenantId, tenantId), eq(agentRuns.agentId, agentId)))
    .orderBy(desc(agentRuns.createdAt));
}

/** The full audit trail of a run: its tool calls (in sequence) + decisions. */
export async function getRunTrace(
  tenantId: string,
  runId: string,
): Promise<{ toolCalls: AgentToolCallRow[]; decisions: AgentDecisionRow[] }> {
  const [toolCalls, decisions] = await Promise.all([
    db
      .select()
      .from(agentToolCalls)
      .where(and(eq(agentToolCalls.tenantId, tenantId), eq(agentToolCalls.agentRunId, runId)))
      .orderBy(agentToolCalls.sequence),
    db
      .select()
      .from(agentDecisions)
      .where(and(eq(agentDecisions.tenantId, tenantId), eq(agentDecisions.agentRunId, runId)))
      .orderBy(agentDecisions.createdAt),
  ]);
  return { toolCalls, decisions };
}
