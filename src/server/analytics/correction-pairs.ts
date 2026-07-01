import "server-only";

// ── Phase 25 track A — CORRECTION-PAIRS HARVESTING READER ──────────────────────────────
// The read surface for the feedback loop: classify operator corrections on the two LLM agents
// (update_rewriter_v1 = text, scope_generator_v1 = JSON longtext) into three buckets and surface
// the draft↔edited CONTENT PAIR — the actual correction signal a few-shot block is mined from.
//
// Relationship to Phase 24 (agent-observability.ts): that reader reads the REVIEWS table only and
// answers a yes/no (approve-as-is rate). This reader joins BACK to the draft to fetch draftContent
// and splits three ways (positive / gold / negative). The latest-review-per-draft dedupe is the
// ONE shared primitive (latestReviewPerDraft, below); agent-observability.ts imports it so the two
// readers can never drift on the dedupe rule. Dedupe ordering = createdAt (review row), matching
// the Phase-24 reader EXACTLY — diverging here would make the bucket counts disagree with the
// observability approve-as-is numbers.
//
// Compute-on-read: NO new table/column (25a §5). Tenant-scoped per call, mirroring the Phase-24
// reader conventions. JSON columns (scope) are returned as the RAW stored string (CAST AS CHAR to
// bypass drizzle's json() decoder) — parsing/transforming is the injection layer's concern (25c),
// not this reader's.

import type { ModelMessage } from "ai";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  agentRuns,
  invoiceDrafts,
  invoiceReviews,
  jobScopeDrafts,
  jobScopeReviews,
  proposalDrafts,
  proposalReviews,
  updateRewriteDrafts,
  updateRewriteReviews,
} from "@/server/schema";
import { normalizedLevenshtein } from "@/server/analytics/text-distance";
import {
  phrasingOnly,
  PROPOSAL_PHRASING_GOLD_MAX,
  PROPOSAL_PHRASING_NEGATIVE_MIN,
} from "@/server/analytics/proposal-phrasing";

const REWRITER_AGENT_ID = "update_rewriter_v1";
const SCOPE_AGENT_ID = "scope_generator_v1";
const INVOICE_AGENT_ID = "invoice_creator_v1";
const PROPOSAL_AGENT_ID = "proposal_generator_v1";

/**
 * Latest-review-per-draft dedupe (the ONE shared primitive — Phase-24 retention-extraction
 * precedent). A draft may carry multiple review rows (re-reviews; draft_id is non-unique). Sort
 * NEWEST FIRST by createdAt, then keep the first-seen per draftId = the latest review for that
 * draft. Ordering is createdAt to match agent-observability.ts exactly (do not change to
 * reviewedAt — the observability numbers would drift). Pure util, no DB, no phase identity.
 */
export function latestReviewPerDraft<T extends { draftId: string; createdAt: Date }>(
  reviews: T[],
): T[] {
  const sorted = [...reviews].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const latestByDraft = new Map<string, T>();
  for (const r of sorted) {
    if (!latestByDraft.has(r.draftId)) latestByDraft.set(r.draftId, r);
  }
  return [...latestByDraft.values()];
}

// ── correction pairs ────────────────────────────────────────────────────────────────────
export type CorrectionBucket = "positive" | "gold" | "negative";

/**
 * One classified operator correction with its content pair.
 * - positive: approve + NO edit (the draft shipped as-is — a "good draft" example)
 * - gold:     approve + edited  (draftContent vs editedContent diff = the human correction)
 * - negative: reject (banked for contrastive eval; NOT injected as few-shot in MVP)
 * draftContent / editedContent are the RAW stored strings (text for rewriter; JSON longtext for
 * scope, unparsed). editedContent is non-null only for gold.
 */
export type CorrectionPair = {
  agentId: string;
  draftId: string;
  agentRunId: string;
  bucket: CorrectionBucket;
  draftContent: string;
  editedContent: string | null;
  decision: "approve" | "reject";
  reviewedAt: Date;
  createdAt: Date;
};

// The shape every per-agent query produces, fed to the shared classifier. createdAt = review row
// createdAt (the dedupe key); draftContent/editedContent are raw strings.
type RawCorrectionRow = {
  draftId: string;
  agentRunId: string;
  draftContent: string;
  editedContent: string | null;
  decision: "approve" | "reject";
  reviewedAt: Date;
  createdAt: Date;
};

function bucketOf(decision: "approve" | "reject", editedContent: string | null): CorrectionBucket {
  if (decision === "reject") return "negative";
  return editedContent == null ? "positive" : "gold";
}

/** Dedupe to latest-review-per-draft, then classify each into its bucket + content pair. */
function toPairs(agentId: string, rows: RawCorrectionRow[]): CorrectionPair[] {
  return latestReviewPerDraft(rows).map((r) => {
    const bucket = bucketOf(r.decision, r.editedContent);
    return {
      agentId,
      draftId: r.draftId,
      agentRunId: r.agentRunId,
      bucket,
      draftContent: r.draftContent,
      // contract: editedContent populated only for gold; null for positive (no edit) and
      // negative (reject — any stray edit text is not a correction signal).
      editedContent: bucket === "gold" ? r.editedContent : null,
      decision: r.decision,
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt,
    };
  });
}

/** Rewriter corrections: agent_runs → drafts → reviews. draft_content/edited_content are text. */
export async function rewriterCorrectionPairs(tenantId: string): Promise<CorrectionPair[]> {
  const rows = await db
    .select({
      draftId: updateRewriteDrafts.id,
      agentRunId: updateRewriteDrafts.agentRunId,
      draftContent: updateRewriteDrafts.draftContent,
      editedContent: updateRewriteReviews.editedContent,
      decision: updateRewriteReviews.decision,
      reviewedAt: updateRewriteReviews.reviewedAt,
      createdAt: updateRewriteReviews.createdAt,
    })
    .from(updateRewriteDrafts)
    .innerJoin(
      agentRuns,
      and(eq(agentRuns.id, updateRewriteDrafts.agentRunId), eq(agentRuns.agentId, REWRITER_AGENT_ID)),
    )
    .innerJoin(updateRewriteReviews, eq(updateRewriteReviews.draftId, updateRewriteDrafts.id))
    .where(eq(updateRewriteDrafts.tenantId, tenantId))
    .orderBy(desc(updateRewriteReviews.createdAt));
  return toPairs(REWRITER_AGENT_ID, rows);
}

/**
 * Scope corrections: agent_runs → drafts → reviews. proposed_steps/edited_steps are JSON longtext;
 * CAST AS CHAR returns the RAW stored string (bypassing drizzle's json() decoder) — no parsing here.
 */
export async function scopeCorrectionPairs(tenantId: string): Promise<CorrectionPair[]> {
  const rows = await db
    .select({
      draftId: jobScopeDrafts.id,
      agentRunId: jobScopeDrafts.agentRunId,
      draftContent: sql<string>`CAST(${jobScopeDrafts.proposedSteps} AS text)`,
      editedContent: sql<string | null>`CAST(${jobScopeReviews.editedSteps} AS text)`,
      decision: jobScopeReviews.decision,
      reviewedAt: jobScopeReviews.reviewedAt,
      createdAt: jobScopeReviews.createdAt,
    })
    .from(jobScopeDrafts)
    .innerJoin(
      agentRuns,
      and(eq(agentRuns.id, jobScopeDrafts.agentRunId), eq(agentRuns.agentId, SCOPE_AGENT_ID)),
    )
    .innerJoin(jobScopeReviews, eq(jobScopeReviews.draftId, jobScopeDrafts.id))
    .where(eq(jobScopeDrafts.tenantId, tenantId))
    .orderBy(desc(jobScopeReviews.createdAt));
  return toPairs(SCOPE_AGENT_ID, rows);
}

/**
 * Invoice corrections: agent_runs → drafts → reviews. proposed_invoice/edited_content are JSON
 * longtext; CAST AS CHAR returns the RAW stored string (bypassing drizzle's json() decoder) — no
 * parsing here (mirrors scopeCorrectionPairs; an invoice draft is structured, not plain text).
 */
export async function invoiceCorrectionPairs(tenantId: string): Promise<CorrectionPair[]> {
  const rows = await db
    .select({
      draftId: invoiceDrafts.id,
      agentRunId: invoiceDrafts.agentRunId,
      draftContent: sql<string>`CAST(${invoiceDrafts.proposedInvoice} AS text)`,
      editedContent: sql<string | null>`CAST(${invoiceReviews.editedContent} AS text)`,
      decision: invoiceReviews.decision,
      reviewedAt: invoiceReviews.reviewedAt,
      createdAt: invoiceReviews.createdAt,
    })
    .from(invoiceDrafts)
    .innerJoin(
      agentRuns,
      and(eq(agentRuns.id, invoiceDrafts.agentRunId), eq(agentRuns.agentId, INVOICE_AGENT_ID)),
    )
    .innerJoin(invoiceReviews, eq(invoiceReviews.draftId, invoiceDrafts.id))
    .where(eq(invoiceDrafts.tenantId, tenantId))
    .orderBy(desc(invoiceReviews.createdAt));
  return toPairs(INVOICE_AGENT_ID, rows);
}

/**
 * Proposal corrections: agent_runs → drafts → reviews. DIVERGES from the other three agents: the
 * proposal draft is NUMBER-FREE, so the invoice "edited_content == null = approved-as-is" signal
 * does not apply (the operator always authors pricing → edited_content is never null on a valid
 * publish). Instead we classify by PHRASING edit-distance, and BOTH draftContent and editedContent
 * are the phrasing-only projection (numbers dropped) — so buildFewShotMessages stays number-free
 * with NO change to it (a gold pair's editedContent string contains no dollar figures).
 *
 * proposed_proposal/edited_content are JSON longtext; CAST AS CHAR returns the RAW stored string
 * (bypassing drizzle's json() decoder); phrasingOnly parses + projects.
 */
export async function proposalCorrectionPairs(tenantId: string): Promise<CorrectionPair[]> {
  const rows = await db
    .select({
      draftId: proposalDrafts.id, // satisfies latestReviewPerDraft<{ draftId, createdAt }>
      agentRunId: proposalDrafts.agentRunId,
      draftContent: sql<string>`CAST(${proposalDrafts.proposedProposal} AS text)`,
      editedContent: sql<string | null>`CAST(${proposalReviews.editedContent} AS text)`,
      decision: proposalReviews.decision,
      reviewedAt: proposalReviews.reviewedAt,
      createdAt: proposalReviews.createdAt,
    })
    .from(proposalDrafts)
    .innerJoin(
      agentRuns,
      and(eq(agentRuns.id, proposalDrafts.agentRunId), eq(agentRuns.agentId, PROPOSAL_AGENT_ID)),
    )
    .innerJoin(proposalReviews, eq(proposalReviews.proposalDraftId, proposalDrafts.id))
    .where(eq(proposalDrafts.tenantId, tenantId))
    .orderBy(desc(proposalReviews.createdAt));

  return latestReviewPerDraft(rows).map((r) => {
    const draftPhrasing = phrasingOnly(r.draftContent);
    // reject → negative (no phrasing comparison needed).
    if (r.decision === "reject") {
      return {
        agentId: PROPOSAL_AGENT_ID, draftId: r.draftId, agentRunId: r.agentRunId,
        bucket: "negative" as CorrectionBucket, draftContent: draftPhrasing, editedContent: null,
        decision: r.decision, reviewedAt: r.reviewedAt, createdAt: r.createdAt,
      };
    }
    // approve → classify by phrasing edit-distance (numbers already stripped on both sides).
    const editedPhrasing = phrasingOnly(r.editedContent ?? "");
    const d = normalizedLevenshtein(draftPhrasing, editedPhrasing);
    let bucket: CorrectionBucket;
    let editedContent: string | null;
    if (d <= PROPOSAL_PHRASING_GOLD_MAX) {
      bucket = "positive"; // kept ~as-is → assistant turn is the DRAFT (buildFewShotMessages: positive→draftContent)
      editedContent = null;
    } else if (d >= PROPOSAL_PHRASING_NEGATIVE_MIN) {
      bucket = "negative"; // heavy rewrite → excluded from few-shot
      editedContent = null;
    } else {
      bucket = "gold"; // refined → assistant turn is the EDITED phrasing (buildFewShotMessages: gold→editedContent)
      editedContent = editedPhrasing;
    }
    return {
      agentId: PROPOSAL_AGENT_ID, draftId: r.draftId, agentRunId: r.agentRunId,
      bucket, draftContent: draftPhrasing, editedContent,
      decision: r.decision, reviewedAt: r.reviewedAt, createdAt: r.createdAt,
    };
  });
}

export type AgentId =
  | typeof REWRITER_AGENT_ID
  | typeof SCOPE_AGENT_ID
  | typeof INVOICE_AGENT_ID
  | typeof PROPOSAL_AGENT_ID;

/** Correction pairs for one agent (rewriter = text, scope + invoice = JSON, proposal = phrasing). */
export async function correctionPairsForAgent(
  tenantId: string,
  agentId: AgentId,
): Promise<CorrectionPair[]> {
  return agentId === INVOICE_AGENT_ID
    ? invoiceCorrectionPairs(tenantId)
    : agentId === PROPOSAL_AGENT_ID
      ? proposalCorrectionPairs(tenantId)
      : agentId === SCOPE_AGENT_ID
        ? scopeCorrectionPairs(tenantId)
        : rewriterCorrectionPairs(tenantId);
}

/** All correction pairs across the in-scope LLM agents. */
export async function allCorrectionPairs(tenantId: string): Promise<CorrectionPair[]> {
  const [rewriter, scope, invoice, proposal] = await Promise.all([
    rewriterCorrectionPairs(tenantId),
    scopeCorrectionPairs(tenantId),
    invoiceCorrectionPairs(tenantId),
    proposalCorrectionPairs(tenantId),
  ]);
  return [...rewriter, ...scope, ...invoice, ...proposal];
}

const DEFAULT_FEW_SHOT_CAP = 20;

/**
 * Select the best pairs to inject as few-shot examples: GOLD first (real human corrections), then
 * POSITIVE (good drafts shipped as-is), capped (default 20). NEGATIVE (rejects) are EXCLUDED from
 * the injectable set in MVP — they are banked by the main reader for contrastive eval later, but a
 * reject is not a "here is a good correction" example. Input order is preserved within each bucket
 * (the readers return newest-first per draft), so the cap keeps the most recent.
 */
export function selectFewShotPairs(
  pairs: CorrectionPair[],
  cap: number = DEFAULT_FEW_SHOT_CAP,
): CorrectionPair[] {
  const gold = pairs.filter((p) => p.bucket === "gold");
  const positive = pairs.filter((p) => p.bucket === "positive");
  return [...gold, ...positive].slice(0, cap);
}

/**
 * Convert selected correction pairs into a messages-array fragment of prior conversational turns,
 * to be slotted BEFORE the real user prompt (system prompt stays unchanged — the locked injection
 * mechanism is messages-array, not system-append). Per pair, two turns:
 *   - user      → the draft that was reviewed (draftContent), the input-side of the example
 *   - assistant → the operator-APPROVED output: editedContent for GOLD (the human fix), or the
 *                 draftContent itself for POSITIVE (approved as-is = a confirmed-good exemplar)
 * The assistant content is the RAW stored string verbatim — for scope that is the JSON-string from
 * the 25b reader, presented as the assistant's structured answer with NO re-stringify (avoids
 * double-encoding); for rewriter it is the plain client-facing text. This builder is purely
 * mechanical (it moves strings) so it stays agent-agnostic across text and JSON agents.
 *
 * NOTE (MVP framing): a pair carries only the produced draft + its approved form (25b surfaces no
 * source note/problem context), so an example turn is draft→approved, not source-input→output.
 * It teaches output style/corrections, not the full input→output mapping. 25d measures this on a
 * seeded corpus. Empty pairs → empty array, which drives the call-site single-shot fallback.
 */
export function buildFewShotMessages(pairs: CorrectionPair[]): ModelMessage[] {
  const messages: ModelMessage[] = [];
  for (const p of pairs) {
    const approved = p.bucket === "gold" ? p.editedContent : p.draftContent;
    if (approved == null) continue; // defensive: a gold pair without editedContent is unusable
    messages.push({ role: "user", content: p.draftContent });
    messages.push({ role: "assistant", content: approved });
  }
  return messages;
}
