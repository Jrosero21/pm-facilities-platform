import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { agentDecisions, jobScopeDrafts } from "@/server/schema";
import { writeAuditLog } from "@/server/audit";

// ── Phase 7 batch 7c — job_scope_drafts data layer ────────────────────────────────────
// The scope generator's draft I/O — the scope equivalent of agents/drafts.ts. The agent
// writes ONLY here, at status='pending_review' (§2.9 / R-6.15); it has NO path to
// job_scope_steps / job columns. proposed_steps is IMMUTABLE (the "what the AI produced"
// audit); operator edits live on job_scope_reviews.edited_steps.

// The canonical persisted step shape (matches the LLM zod schema in llm.ts and the
// job_scope_steps columns). category/expectsPhoto are optional per step.
export type ScopeStep = {
  order: number;
  instruction: string;
  category?: "assess" | "perform" | "cleanup" | "verify" | "document";
  expectsPhoto?: boolean;
};

type JobScopeDraftRow = typeof jobScopeDrafts.$inferSelect;
export type ScopeDraftStatus = JobScopeDraftRow["status"];

// The domain row, with proposed_steps PARSED. proposed_steps is a JSON (longtext) column;
// MariaDB/mysql2 returns it as a STRING and Drizzle does not parse on read — parse at the
// boundary (R-6.19) so consumers get a real ScopeStep[], not a string.
export type ScopeDraft = {
  id: string;
  tenantId: string;
  jobId: string;
  agentRunId: string;
  proposedSteps: ScopeStep[];
  status: ScopeDraftStatus;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function parseSteps(v: unknown): ScopeStep[] {
  // R-6.19: json() round-trips as a string on MariaDB; parse here.
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as ScopeStep[];
    } catch {
      return [];
    }
  }
  return (v as ScopeStep[] | null) ?? [];
}

function toDomain(row: JobScopeDraftRow): ScopeDraft {
  return {
    id: row.id,
    tenantId: row.tenantId,
    jobId: row.jobId,
    agentRunId: row.agentRunId,
    proposedSteps: parseSteps(row.proposedSteps),
    status: row.status,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** One draft by id, tenant-scoped (proposed_steps parsed). */
export async function getScopeDraft(tenantId: string, id: string): Promise<ScopeDraft | null> {
  const rows = await db
    .select()
    .from(jobScopeDrafts)
    .where(and(eq(jobScopeDrafts.tenantId, tenantId), eq(jobScopeDrafts.id, id)))
    .limit(1);
  return rows[0] ? toDomain(rows[0]) : null;
}

/** Drafts for a job, newest first. */
export async function listScopeDraftsForJob(tenantId: string, jobId: string): Promise<ScopeDraft[]> {
  const rows = await db
    .select()
    .from(jobScopeDrafts)
    .where(and(eq(jobScopeDrafts.tenantId, tenantId), eq(jobScopeDrafts.jobId, jobId)))
    .orderBy(desc(jobScopeDrafts.createdAt));
  return rows.map(toDomain);
}

/**
 * Create a scope draft at status='pending_review' — the agent's ONLY write
 * (createScopeDraftTool). proposed_steps is stored as JSON. NOT audited to audit_logs (the
 * agent's write is captured in agent_tool_calls; audit_logs records the HUMAN actions —
 * R-6.12). Single-row insert.
 */
export async function createScopeDraft(input: {
  tenantId: string;
  jobId: string;
  agentRunId: string;
  proposedSteps: ScopeStep[];
}): Promise<ScopeDraft> {
  const id = uuidv7();
  await db.insert(jobScopeDrafts).values({
    id,
    tenantId: input.tenantId,
    jobId: input.jobId,
    agentRunId: input.agentRunId,
    proposedSteps: input.proposedSteps,
    status: "pending_review",
  });
  const row = await getScopeDraft(input.tenantId, id);
  if (!row) throw new Error("Scope draft insert succeeded but row could not be reloaded.");
  return row;
}

/**
 * Discard a draft (operator dismissal — no review row, unlike reject). Allowed from
 * pending_review OR approved (H1 / D-7.h): a stranded APPROVED sibling on an already-published
 * job (KL-7.g gate) can't publish, so it needs a disposal path. Terminal states
 * (rejected/discarded/published) are not discardable. This is the scope-generator's state
 * machine; the rewriter's discard stays pending-only (its approved drafts are always
 * publishable — no stranding). Single-row update + writeAuditLog OUTSIDE (R-6.7).
 *
 * Throws: DRAFT_NOT_FOUND, DRAFT_NOT_DISCARDABLE.
 */
export async function discardScopeDraft(tenantId: string, id: string, actorUserId: string): Promise<void> {
  const draft = await getScopeDraft(tenantId, id);
  if (!draft) throw new Error("DRAFT_NOT_FOUND");
  if (draft.status !== "pending_review" && draft.status !== "approved") throw new Error("DRAFT_NOT_DISCARDABLE");

  await db
    .update(jobScopeDrafts)
    .set({ status: "discarded" })
    .where(and(eq(jobScopeDrafts.tenantId, tenantId), eq(jobScopeDrafts.id, id)));

  await writeAuditLog({
    tenantId,
    userId: actorUserId,
    action: "scope_draft.discarded",
    targetType: "job_scope_draft",
    targetId: id,
    metadata: { jobId: draft.jobId },
  });
}

// R-6.19: agent_decisions.metadata is json (longtext on MariaDB) — parse at the boundary,
// then extract the assumptions array for the review UI.
function parseAssumptions(v: unknown): string[] {
  let parsed: unknown = v;
  if (typeof v === "string") {
    try {
      parsed = JSON.parse(v);
    } catch {
      return [];
    }
  }
  const a = (parsed as { assumptions?: unknown } | null)?.assumptions;
  return Array.isArray(a) ? (a as string[]) : [];
}

// A draft joined to its scope_proposal decision (confidence / rationale / assumptions) for
// the review UI — the scope analog of listDraftsForJobDetailed. The decision lives on
// agent_decisions via the shared agent_run_id. Newest first.
export type ScopeDraftDetailed = ScopeDraft & {
  confidence: string | null;
  rationale: string | null;
  assumptions: string[];
};

export async function listScopeDraftsForJobDetailed(
  tenantId: string,
  jobId: string,
): Promise<ScopeDraftDetailed[]> {
  const rows = await db
    .select({
      id: jobScopeDrafts.id,
      tenantId: jobScopeDrafts.tenantId,
      jobId: jobScopeDrafts.jobId,
      agentRunId: jobScopeDrafts.agentRunId,
      proposedSteps: jobScopeDrafts.proposedSteps,
      status: jobScopeDrafts.status,
      publishedAt: jobScopeDrafts.publishedAt,
      createdAt: jobScopeDrafts.createdAt,
      updatedAt: jobScopeDrafts.updatedAt,
      confidence: agentDecisions.confidence,
      rationale: agentDecisions.reasoning,
      decisionMetadata: agentDecisions.metadata,
    })
    .from(jobScopeDrafts)
    .leftJoin(
      agentDecisions,
      and(
        eq(agentDecisions.agentRunId, jobScopeDrafts.agentRunId),
        eq(agentDecisions.decisionType, "scope_proposal"),
      ),
    )
    .where(and(eq(jobScopeDrafts.tenantId, tenantId), eq(jobScopeDrafts.jobId, jobId)))
    .orderBy(desc(jobScopeDrafts.createdAt));

  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    jobId: r.jobId,
    agentRunId: r.agentRunId,
    proposedSteps: parseSteps(r.proposedSteps),
    status: r.status,
    publishedAt: r.publishedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    confidence: r.confidence,
    rationale: r.rationale,
    assumptions: parseAssumptions(r.decisionMetadata),
  }));
}
