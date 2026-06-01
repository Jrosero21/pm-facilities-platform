import "server-only";

import { openRun, closeRun, registerTool, type RunContext } from "@/server/agents/runner";
import { searchKnowledgeTool, readDocTool } from "./tools";
import type { SearchKnowledgeResult, ReadDocResult } from "./knowledge";
import {
  summarizeJobTool,
  identifyStalledJobsTool,
  identifySlaRisksTool,
  flagInvoiceAnomaliesTool,
  summarizeVendorPerformanceTool,
  recommendNextActionTool,
  type JobSummary,
  type StalledJobsResult,
  type SlaRisksResult,
  type InvoiceAnomaliesResult,
  type VendorSummary,
  type NextActionRecommendation,
} from "./operational-tools";

// chatbot_assistant_v1 — the read/draft operations assistant (Phase 16). The agent registers
// in AGENT_REGISTRY (registry.ts) and runs through the frozen shared runner
// (openRun → registerTool(each tool) → … → closeRun), producing one agent_runs row per turn
// and one agent_tool_calls row per tool call.
//
// 16c: identity + run shell. 16d (this slice): the two PLATFORM-level knowledge tools
// (searchKnowledge + readDoc, docs/-allowlisted via the resolveDocPath guard). Operational,
// tenant-scoped read tools (16e) and draft tools (16f) come later. The conversational/LLM
// turn is a later slice; this exposes the tools bound to a logged run.
export const AGENT_ID = "chatbot_assistant_v1";

/** The assistant's tools bound to a run — each call auto-logs to agent_tool_calls. The
 *  knowledge tools are platform-level; the operational tools are tenant-scoped (tenantId
 *  captured from ctx at bind time — the caller never supplies it). All are kind:"read". */
export type AssistantTools = {
  // platform-level knowledge (16d)
  searchKnowledge: (input: { query: string }) => Promise<SearchKnowledgeResult>;
  readDoc: (input: { path: string }) => Promise<ReadDocResult>;
  // tenant-scoped operational reads (16e)
  summarizeJob: (input: { jobId: string }) => Promise<JobSummary>;
  identifyStalledJobs: (input: Record<string, never>) => Promise<StalledJobsResult>;
  identifySlaRisks: (input: Record<string, never>) => Promise<SlaRisksResult>;
  flagInvoiceAnomalies: (input: { jobId?: string }) => Promise<InvoiceAnomaliesResult>;
  summarizeVendorPerformance: (input: { vendorId: string }) => Promise<VendorSummary>;
  recommendNextAction: (input: { jobId: string }) => Promise<NextActionRecommendation>;
};

/** Bind all assistant tools to a run context (registerTool wraps each for auto-logging).
 *  Operational tools capture ctx.tenantId in a closure → structural tenant isolation. */
export function bindTools(ctx: RunContext): AssistantTools {
  return {
    searchKnowledge: registerTool(ctx, searchKnowledgeTool),
    readDoc: registerTool(ctx, readDocTool),
    summarizeJob: registerTool(ctx, summarizeJobTool(ctx.tenantId)),
    identifyStalledJobs: registerTool(ctx, identifyStalledJobsTool(ctx.tenantId)),
    identifySlaRisks: registerTool(ctx, identifySlaRisksTool(ctx.tenantId)),
    flagInvoiceAnomalies: registerTool(ctx, flagInvoiceAnomaliesTool(ctx.tenantId)),
    summarizeVendorPerformance: registerTool(ctx, summarizeVendorPerformanceTool(ctx.tenantId)),
    recommendNextAction: registerTool(ctx, recommendNextActionTool(ctx.tenantId)),
  };
}

/**
 * Open a run for the assistant and hand the bound knowledge tools to `work`, then close the
 * run (succeeded, or failed on throw). The run shell from 16c, now with the knowledge tools
 * wired. `work` returns an optional output summary for the run row.
 */
export async function runChatbotAssistant(input: {
  tenantId: string;
  triggeredByUserId?: string | null;
  inputSummary?: string | null;
  work?: (tools: AssistantTools) => Promise<string | void>;
}): Promise<{ runId: string }> {
  const ctx = await openRun({
    tenantId: input.tenantId,
    agentId: AGENT_ID,
    triggeredByUserId: input.triggeredByUserId ?? null,
    jobId: null, // non-job agent — the assistant is not bound to a single job
    triggerSource: "operator_manual",
    inputSummary: input.inputSummary ?? "Assistant run",
  });

  try {
    const tools = bindTools(ctx);
    const summary = input.work ? await input.work(tools) : undefined;
    await closeRun(ctx, {
      status: "succeeded",
      outputSummary: typeof summary === "string" ? summary : "Assistant run completed.",
    });
    return { runId: ctx.runId };
  } catch (err) {
    await closeRun(ctx, { status: "failed", errorMessage: (err as Error).message });
    throw err;
  }
}
