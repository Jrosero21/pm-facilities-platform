import "server-only";

// ── Phase 24 track A — AGENT OBSERVABILITY READERS ────────────────────────────────────
// The read surface for the agent observability dashboard. Mirrors the 9c analytics-reader
// conventions (dispatch-timing.ts / pending-invoices.ts): tenantId-first signatures, per-call
// tenant-scoping (where eq(table.tenantId, …)), explicit exported result types, drizzle builder
// + sql fragments, Number(… ?? 0) coercion, never-throw zero-shapes. Permission gating stays at
// the PAGE layer (canSeeOperations) — these readers enforce tenant-scoping only.
//
// Synthetic dispatch runs (agent_id='dispatch_router_v1', trigger_source='auto_dispatch') write
// model NULL + tokens NULL: token SUMs COALESCE to 0 (correct — rule-based, no LLM spend), and
// the cost reader SKIPS NULL/unknown models (unmeasurable, not $0).

import Big from "big.js";
import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  agentDecisions,
  agentRuns,
  invoiceReviews,
  jobScopeReviews,
  updateRewriteReviews,
} from "@/server/schema";
import { priceFor } from "@/server/agents/config/pricing";
import { summarizeSeconds } from "@/server/analytics/percentile";
import { latestReviewPerDraft } from "@/server/analytics/correction-pairs";

const DISPATCH_AGENT_ID = "dispatch_router_v1";

// ── 1. Volume per agent ───────────────────────────────────────────────────────────────
export type AgentVolumeRow = {
  agentId: string;
  total: number;
  succeeded: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
};

/** Run volume + token sums per agent. Token SUMs COALESCE nulls to 0 (dispatch runs are NULL). */
export async function agentVolumeByAgent(tenantId: string): Promise<AgentVolumeRow[]> {
  const rows = await db
    .select({
      agentId: agentRuns.agentId,
      total: count(),
      succeeded: sql<number>`SUM(${agentRuns.status} = 'succeeded')`,
      failed: sql<number>`SUM(${agentRuns.status} = 'failed')`,
      inputTokens: sql<number>`COALESCE(SUM(COALESCE(${agentRuns.inputTokens}, 0)), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(COALESCE(${agentRuns.outputTokens}, 0)), 0)`,
    })
    .from(agentRuns)
    .where(eq(agentRuns.tenantId, tenantId))
    .groupBy(agentRuns.agentId);

  return rows.map((r) => ({
    agentId: r.agentId,
    total: Number(r.total ?? 0),
    succeeded: Number(r.succeeded ?? 0),
    failed: Number(r.failed ?? 0),
    inputTokens: Number(r.inputTokens ?? 0),
    outputTokens: Number(r.outputTokens ?? 0),
  }));
}

// ── 2. Disposition breakdown per agent ──────────────────────────────────────────────────
export type AgentDispositionRow = {
  agentId: string;
  queuedForReview: number;
  autoExecuted: number;
  policyBlocked: number;
};

/** Per-agent disposition counts (agent_decisions ⋈ agent_runs, grouped by agent_id). */
export async function agentDispositionBreakdown(tenantId: string): Promise<AgentDispositionRow[]> {
  const rows = await db
    .select({
      agentId: agentRuns.agentId,
      queuedForReview: sql<number>`SUM(${agentDecisions.disposition} = 'queued_for_review')`,
      autoExecuted: sql<number>`SUM(${agentDecisions.disposition} = 'auto_executed')`,
      policyBlocked: sql<number>`SUM(${agentDecisions.disposition} = 'policy_blocked')`,
    })
    .from(agentDecisions)
    .innerJoin(agentRuns, eq(agentDecisions.agentRunId, agentRuns.id))
    .where(eq(agentDecisions.tenantId, tenantId))
    .groupBy(agentRuns.agentId);

  return rows.map((r) => ({
    agentId: r.agentId,
    queuedForReview: Number(r.queuedForReview ?? 0),
    autoExecuted: Number(r.autoExecuted ?? 0),
    policyBlocked: Number(r.policyBlocked ?? 0),
  }));
}

// ── 3. Dispatch autonomy breakdown (the dispatch agent's signal; approve-as-is is N/A) ──
export type DispatchAutonomyBreakdown = {
  autoExecuted: number;
  policyBlocked: number;
  queuedForReview: number;
};

/** dispatch_router_v1 disposition counts. Zero-shape when no synthetic runs exist yet. */
export async function dispatchAutonomyBreakdown(tenantId: string): Promise<DispatchAutonomyBreakdown> {
  const rows = await db
    .select({
      autoExecuted: sql<number>`SUM(${agentDecisions.disposition} = 'auto_executed')`,
      policyBlocked: sql<number>`SUM(${agentDecisions.disposition} = 'policy_blocked')`,
      queuedForReview: sql<number>`SUM(${agentDecisions.disposition} = 'queued_for_review')`,
    })
    .from(agentDecisions)
    .innerJoin(agentRuns, eq(agentDecisions.agentRunId, agentRuns.id))
    .where(and(eq(agentDecisions.tenantId, tenantId), eq(agentRuns.agentId, DISPATCH_AGENT_ID)));

  const r = rows[0];
  return {
    autoExecuted: Number(r?.autoExecuted ?? 0),
    policyBlocked: Number(r?.policyBlocked ?? 0),
    queuedForReview: Number(r?.queuedForReview ?? 0),
  };
}

// ── 4. Approve-as-is (per-agent adapters + unified view) ────────────────────────────────
export type ApproveAsIsCounts = { reviewed: number; approvedAsIs: number; rate: number };
export type AgentApproveAsIsRow = { agentId: string; applicable: boolean } & ApproveAsIsCounts;

/**
 * LATEST-review-per-draft dedupe (rule 1): a draft may have multiple review rows (re-reviews).
 * We keep only the newest review per draft, then classify. `reviewed` = drafts with ≥1 review;
 * `approvedAsIs` = drafts whose LATEST review is approve with NO edit; rate = approvedAsIs/reviewed.
 * `editIsNull(row)` reads the agent-specific edit column (rule 2).
 */
function classifyLatestReviews<T extends { draftId: string; decision: string; createdAt: Date }>(
  reviews: T[],
  editIsNull: (row: T) => boolean,
): ApproveAsIsCounts {
  // latest-review-per-draft dedupe is the shared primitive (Phase 25 correction-pairs.ts) so the
  // two readers can't drift on the rule; ordering is createdAt, owned there.
  const latest = latestReviewPerDraft(reviews);
  let approvedAsIs = 0;
  for (const r of latest) {
    if (r.decision === "approve" && editIsNull(r)) approvedAsIs += 1;
  }
  const reviewed = latest.length;
  return { reviewed, approvedAsIs, rate: reviewed === 0 ? 0 : approvedAsIs / reviewed };
}

/** Rewriter approve-as-is: approve AND edited_content IS NULL, latest review per draft. */
export async function rewriterApproveAsIs(tenantId: string): Promise<ApproveAsIsCounts> {
  const rows = await db
    .select({
      draftId: updateRewriteReviews.draftId,
      decision: updateRewriteReviews.decision,
      editedContent: updateRewriteReviews.editedContent,
      createdAt: updateRewriteReviews.createdAt,
    })
    .from(updateRewriteReviews)
    .where(eq(updateRewriteReviews.tenantId, tenantId))
    .orderBy(desc(updateRewriteReviews.createdAt));
  return classifyLatestReviews(rows, (r) => r.editedContent == null);
}

/** Scope approve-as-is: approve AND edited_steps IS NULL, latest review per draft. */
export async function scopeApproveAsIs(tenantId: string): Promise<ApproveAsIsCounts> {
  const rows = await db
    .select({
      draftId: jobScopeReviews.draftId,
      decision: jobScopeReviews.decision,
      editedSteps: jobScopeReviews.editedSteps,
      createdAt: jobScopeReviews.createdAt,
    })
    .from(jobScopeReviews)
    .where(eq(jobScopeReviews.tenantId, tenantId))
    .orderBy(desc(jobScopeReviews.createdAt));
  return classifyLatestReviews(rows, (r) => r.editedSteps == null);
}

/** Invoice approve-as-is: approve AND edited_content IS NULL, latest review per draft. */
export async function invoiceApproveAsIs(tenantId: string): Promise<ApproveAsIsCounts> {
  const rows = await db
    .select({
      draftId: invoiceReviews.draftId,
      decision: invoiceReviews.decision,
      editedContent: invoiceReviews.editedContent,
      createdAt: invoiceReviews.createdAt,
    })
    .from(invoiceReviews)
    .where(eq(invoiceReviews.tenantId, tenantId))
    .orderBy(desc(invoiceReviews.createdAt));
  return classifyLatestReviews(rows, (r) => r.editedContent == null);
}

/**
 * Unified approve-as-is across agents. Agents with a draft/review table report their rate;
 * dispatch_router_v1 (and any agent without a review surface) reports applicable:false / zeros.
 */
export async function agentApproveAsIs(tenantId: string): Promise<AgentApproveAsIsRow[]> {
  const [rewriter, scope, invoice] = await Promise.all([
    rewriterApproveAsIs(tenantId),
    scopeApproveAsIs(tenantId),
    invoiceApproveAsIs(tenantId),
  ]);
  return [
    { agentId: "update_rewriter_v1", applicable: true, ...rewriter },
    { agentId: "scope_generator_v1", applicable: true, ...scope },
    { agentId: DISPATCH_AGENT_ID, applicable: false, reviewed: 0, approvedAsIs: 0, rate: 0 },
    { agentId: "invoice_creator_v1", applicable: true, ...invoice },
  ];
}

// ── 5. Failure points ───────────────────────────────────────────────────────────────────
export type AgentFailureRow = { agentId: string; failedCount: number; recentErrors: string[] };

const MAX_RECENT_ERRORS = 5;
const ERROR_TRUNCATE = 200;

/** Failed runs per agent + the last 5 error messages each (truncated 200 chars; operator triage). */
export async function agentFailurePoints(tenantId: string): Promise<AgentFailureRow[]> {
  const rows = await db
    .select({
      agentId: agentRuns.agentId,
      errorMessage: agentRuns.errorMessage,
      createdAt: agentRuns.createdAt,
    })
    .from(agentRuns)
    .where(and(eq(agentRuns.tenantId, tenantId), eq(agentRuns.status, "failed")))
    .orderBy(desc(agentRuns.createdAt));

  const byAgent = new Map<string, { failedCount: number; recentErrors: string[] }>();
  for (const r of rows) {
    let entry = byAgent.get(r.agentId);
    if (!entry) {
      entry = { failedCount: 0, recentErrors: [] };
      byAgent.set(r.agentId, entry);
    }
    entry.failedCount += 1;
    if (entry.recentErrors.length < MAX_RECENT_ERRORS) {
      const msg = r.errorMessage && r.errorMessage.trim() ? r.errorMessage : "(no message)";
      entry.recentErrors.push(msg.slice(0, ERROR_TRUNCATE));
    }
  }
  return [...byAgent.entries()].map(([agentId, e]) => ({ agentId, ...e }));
}

// ── 6. Cost per (agent, model) — compute-on-read, Big.js, decimal strings ───────────────
export type AgentCostRow = {
  agentId: string;
  model: string;
  inputCost: string;
  outputCost: string;
  totalCost: string;
};

const COST_DP = 6; // microdollar precision — per-token costs are fractions of a cent

/**
 * Cost per (agentId, model) (rule 4: price varies by model — never sum tokens across models then
 * price once). Rows with NULL model are SKIPPED in SQL; rows with an unknown model (priceFor null)
 * are excluded app-side — both unmeasurable, NOT $0 (rule 3). Returns decimal strings.
 */
export async function agentCostByAgent(tenantId: string): Promise<AgentCostRow[]> {
  const rows = await db
    .select({
      agentId: agentRuns.agentId,
      model: agentRuns.model,
      inputTokens: sql<number>`COALESCE(SUM(COALESCE(${agentRuns.inputTokens}, 0)), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(COALESCE(${agentRuns.outputTokens}, 0)), 0)`,
    })
    .from(agentRuns)
    .where(and(eq(agentRuns.tenantId, tenantId), isNotNull(agentRuns.model)))
    .groupBy(agentRuns.agentId, agentRuns.model);

  const out: AgentCostRow[] = [];
  for (const r of rows) {
    const price = priceFor(r.model);
    if (!price) continue; // unknown model → unmeasurable, exclude (never silently cost at $0)
    const inputCost = new Big(Number(r.inputTokens ?? 0)).times(price.inputPerToken);
    const outputCost = new Big(Number(r.outputTokens ?? 0)).times(price.outputPerToken);
    out.push({
      agentId: r.agentId,
      model: r.model as string,
      inputCost: inputCost.toFixed(COST_DP),
      outputCost: outputCost.toFixed(COST_DP),
      totalCost: inputCost.plus(outputCost).toFixed(COST_DP),
    });
  }
  return out;
}

// ── 7. Run latency distribution (reuses summarizeSeconds) ───────────────────────────────
/** Run latency (started_at → completed_at, completed runs only) → {count, p50, p90, mean} seconds. */
export async function agentLatencyDistribution(
  tenantId: string,
): Promise<ReturnType<typeof summarizeSeconds>> {
  const rows = await db
    .select({
      seconds: sql<number | null>`TIMESTAMPDIFF(SECOND, ${agentRuns.startedAt}, ${agentRuns.completedAt})`,
    })
    .from(agentRuns)
    .where(and(eq(agentRuns.tenantId, tenantId), isNotNull(agentRuns.completedAt)));

  const values = rows.map((r) => Number(r.seconds)).filter((s) => Number.isFinite(s));
  return summarizeSeconds(values);
}
