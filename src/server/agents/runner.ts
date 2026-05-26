import "server-only";

import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { agentRuns, agentToolCalls, agentDecisions } from "@/server/schema";

// ── The shared agent runner (Phase 6 6g.a) ───────────────────────────────────────────
// The reusable abstraction every agent runs through (§2.9). Introduced for the update
// rewriter; INHERITED by Phase 7 (scope generator), 8 (NTE negotiator), 13 (email
// parser), 16 (chatbot). An agent: openRun → (read/write tools, each auto-logged) →
// logDecision → closeRun. The runner owns the audit chain (agent_runs / agent_tool_calls
// / agent_decisions); the agent owns its tools + reasoning. v1 agents use a FIXED pipeline
// (the rewriter); the substrate also supports LLM-native tool-use (Phase 8) unchanged —
// registerTool wraps any function with auto-logging regardless of who decides to call it.

export type ToolKind = "read" | "write";
export type Confidence = "high" | "medium" | "low";
export type Disposition = "queued_for_review" | "auto_executed" | "policy_blocked";

// A run's mutable context — carries the run id + an in-run sequence counter so tool calls
// log in order. Passed to every runner helper.
export type RunContext = {
  runId: string;
  tenantId: string;
  agentId: string;
  jobId: string | null;
  seq: { n: number };
};

// A declarable tool. `run` does the real work; `name`/`kind` drive the audit log.
export type AgentTool<I, O> = {
  name: string;
  kind: ToolKind;
  run: (input: I) => Promise<O>;
};

/** Open a run (status='running'). One row per agent invocation. */
export async function openRun(input: {
  tenantId: string;
  agentId: string;
  triggeredByUserId?: string | null;
  jobId?: string | null;
  triggerSource?: string;
  inputSummary?: string | null;
}): Promise<RunContext> {
  const runId = uuidv7();
  await db.insert(agentRuns).values({
    id: runId,
    tenantId: input.tenantId,
    agentId: input.agentId,
    status: "running",
    triggerSource: input.triggerSource ?? "operator_manual",
    triggeredByUserId: input.triggeredByUserId ?? null,
    jobId: input.jobId ?? null,
    inputSummary: input.inputSummary ?? null,
    startedAt: new Date(),
  });
  return {
    runId,
    tenantId: input.tenantId,
    agentId: input.agentId,
    jobId: input.jobId ?? null,
    seq: { n: 0 },
  };
}

/** Append one agent_tool_calls row (auto-incrementing sequence within the run). */
export async function logToolCall(
  ctx: RunContext,
  input: {
    toolName: string;
    toolKind: ToolKind;
    toolInput?: unknown;
    toolOutput?: unknown;
    status?: "ok" | "error";
    errorMessage?: string | null;
  },
): Promise<void> {
  ctx.seq.n += 1;
  await db.insert(agentToolCalls).values({
    id: uuidv7(),
    tenantId: ctx.tenantId,
    agentRunId: ctx.runId,
    sequence: ctx.seq.n,
    toolName: input.toolName,
    toolKind: input.toolKind,
    toolInput: input.toolInput ?? null,
    toolOutput: input.toolOutput ?? null,
    status: input.status ?? "ok",
    errorMessage: input.errorMessage ?? null,
  });
}

/** Append one agent_decisions row (§2.9 proposal + reasoning + confidence + disposition). */
export async function logDecision(
  ctx: RunContext,
  input: {
    decisionType: string;
    proposedAction?: string | null;
    reasoning?: string | null;
    confidence?: Confidence | null;
    policyCheck?: string | null;
    disposition: Disposition;
    metadata?: unknown;
  },
): Promise<void> {
  await db.insert(agentDecisions).values({
    id: uuidv7(),
    tenantId: ctx.tenantId,
    agentRunId: ctx.runId,
    decisionType: input.decisionType,
    proposedAction: input.proposedAction ?? null,
    reasoning: input.reasoning ?? null,
    confidence: input.confidence ?? null,
    policyCheck: input.policyCheck ?? null,
    disposition: input.disposition,
    metadata: input.metadata ?? null,
  });
}

/** Close a run (succeeded/failed) + record provenance (model, prompt_version, tokens). */
export async function closeRun(
  ctx: RunContext,
  input: {
    status: "succeeded" | "failed";
    outputSummary?: string | null;
    errorMessage?: string | null;
    model?: string | null;
    promptVersion?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
  },
): Promise<void> {
  const set: Partial<typeof agentRuns.$inferInsert> = {
    status: input.status,
    completedAt: new Date(),
  };
  if (input.outputSummary !== undefined) set.outputSummary = input.outputSummary;
  if (input.errorMessage !== undefined) set.errorMessage = input.errorMessage;
  if (input.model !== undefined) set.model = input.model;
  if (input.promptVersion !== undefined) set.promptVersion = input.promptVersion;
  if (input.inputTokens !== undefined) set.inputTokens = input.inputTokens;
  if (input.outputTokens !== undefined) set.outputTokens = input.outputTokens;
  await db.update(agentRuns).set(set).where(eq(agentRuns.id, ctx.runId));
}

/**
 * Wrap a tool so every invocation auto-logs to agent_tool_calls (success records the
 * output; failure records the error and re-throws). This is how an agent gets the
 * read-broad/write-narrow audit "for free" — declare a tool, register it, call the
 * returned function. The runner does not police read-vs-write; the agent declares each
 * tool's `kind`, and the contract (write tools touch only the agent's own drafts) is an
 * agent-implementation discipline, enforced by which tools the agent registers.
 */
export function registerTool<I, O>(
  ctx: RunContext,
  tool: AgentTool<I, O>,
): (input: I) => Promise<O> {
  return async (input: I) => {
    try {
      const output = await tool.run(input);
      await logToolCall(ctx, {
        toolName: tool.name,
        toolKind: tool.kind,
        toolInput: input,
        toolOutput: output,
        status: "ok",
      });
      return output;
    } catch (err) {
      await logToolCall(ctx, {
        toolName: tool.name,
        toolKind: tool.kind,
        toolInput: input,
        toolOutput: null,
        status: "error",
        errorMessage: (err as Error).message,
      });
      throw err;
    }
  };
}
