import "server-only";

import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { auditLogs, jobScopeDrafts, jobScopeSteps, jobs } from "@/server/schema";
import { getJob } from "@/server/jobs";
import { getScopeDraft, type ScopeStep } from "./drafts";
import { getApproveReviewForScopeDraft } from "./reviews";
import { DraftNotApproved, ScopeAlreadyPublished } from "./errors";

// ── Phase 7 batch 7c — publishScopeDraft ──────────────────────────────────────────────
// The human-gated, ONLY draft -> job_scope_steps path (the agent can never reach this —
// §2.9 / R-6.15). Multi-row txn -> audit INSIDE (R-6.7). Parent-before-child lock order
// (R-5.7 / R-6.21): lock the JOB (parent) FOR UPDATE, then the DRAFT (child), re-check both.
//
// Effective steps = the approving review's edited_steps ?? the draft's immutable
// proposed_steps. Publish writes BOTH job text columns from the draft (D5(b) corrected):
//   generated_scope_of_work = flatten(proposed_steps)   — the raw AI artifact
//   approved_scope_of_work  = flatten(effective steps)  — the operator-approved final
// The flattened text is the human-readable MIRROR for consumers that can't read structured
// data (dispatch display, future vendor email, external portal sync) — INSTRUCTION ONLY,
// numbered, no [category] tags / photo markers (D5(a) / Dec-5). job_scope_steps is the
// canonical structured record; any consumer needing category/expectsPhoto reads it directly.

function sortByOrder(steps: ScopeStep[]): ScopeStep[] {
  return [...steps].sort((a, b) => a.order - b.order);
}

/** Instruction-only, sequentially numbered prose (Dec-5). No structure encoded in text. */
function flatten(steps: ScopeStep[]): string {
  return sortByOrder(steps)
    .map((s, i) => `${i + 1}. ${s.instruction}`)
    .join("\n");
}

export type PublishScopeResult = { stepIds: string[]; stepCount: number };

/**
 * Publish an APPROVED scope draft to the job. Throws DRAFT_NOT_FOUND, DRAFT_NOT_APPROVED,
 * JOB_NOT_FOUND.
 */
export async function publishScopeDraft(input: {
  tenantId: string;
  draftId: string;
  actorUserId: string;
}): Promise<PublishScopeResult> {
  // --- guards (read-only, before the txn) ---
  const draft = await getScopeDraft(input.tenantId, input.draftId);
  if (!draft) throw new Error("DRAFT_NOT_FOUND");
  if (draft.status !== "approved") throw new DraftNotApproved(input.draftId);

  const job = await getJob(input.tenantId, draft.jobId);
  if (!job) throw new Error("JOB_NOT_FOUND");

  const approveReview = await getApproveReviewForScopeDraft(input.tenantId, input.draftId);
  const edited = approveReview?.editedSteps ?? null;
  const effective = sortByOrder(edited ?? draft.proposedSteps);
  const source: "edited" | "ai_generated" = edited != null ? "edited" : "ai_generated";

  const generatedFlat = flatten(draft.proposedSteps); // raw AI artifact
  const approvedFlat = flatten(effective); // operator-approved final

  const stepRows = effective.map((s, i) => ({
    id: uuidv7(),
    tenantId: input.tenantId,
    jobId: draft.jobId,
    stepOrder: i + 1, // contiguous 1..N regardless of the model's `order` values
    instruction: s.instruction,
    category: s.category ?? null,
    expectsPhoto: s.expectsPhoto ?? false,
    source,
    sourceDraftId: input.draftId,
  }));

  await db.transaction(async (tx) => {
    // 1. lock the PARENT (job) first — parent-before-child (R-5.7).
    const lockedJob = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.tenantId, input.tenantId), eq(jobs.id, draft.jobId)))
      .for("update");
    if (!lockedJob[0]) throw new Error("JOB_NOT_FOUND");

    // 2. lock the CHILD (draft); re-check still approved (double-publish race).
    const lockedDraft = await tx
      .select({ status: jobScopeDrafts.status })
      .from(jobScopeDrafts)
      .where(and(eq(jobScopeDrafts.tenantId, input.tenantId), eq(jobScopeDrafts.id, input.draftId)))
      .for("update");
    if (!lockedDraft[0]) throw new Error("DRAFT_NOT_FOUND");
    if (lockedDraft[0].status !== "approved") throw new DraftNotApproved(input.draftId);

    // 2b. gate (KL-7.g / DEC-B): refuse a 2nd publish into an already-scoped job — checked
    // UNDER the job lock so concurrent publishes serialize. publishScopeDraft APPENDS, so
    // without this a sibling draft would duplicate the scope. One scope per job in Phase 7;
    // re-scope is a future workflow that would need replace-semantics here. This is the
    // write-boundary invariant any future writer inherits.
    const existingSteps = await tx
      .select({ id: jobScopeSteps.id })
      .from(jobScopeSteps)
      .where(
        and(
          eq(jobScopeSteps.tenantId, input.tenantId),
          eq(jobScopeSteps.jobId, draft.jobId),
          eq(jobScopeSteps.status, "active"),
        ),
      )
      .limit(1);
    if (existingSteps[0]) throw new ScopeAlreadyPublished(draft.jobId);

    // 3. the canonical structured steps (the ONLY write to job_scope_steps).
    if (stepRows.length > 0) await tx.insert(jobScopeSteps).values(stepRows);

    // 4. the job's denormalized text mirrors + lifecycle rollup.
    await tx
      .update(jobs)
      .set({
        generatedScopeOfWork: generatedFlat,
        approvedScopeOfWork: approvedFlat,
        scopeGenerationStatus: "approved",
      })
      .where(eq(jobs.id, draft.jobId));

    // 5. advance the draft -> published.
    await tx
      .update(jobScopeDrafts)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(jobScopeDrafts.id, input.draftId));

    // 6. audit — INSIDE the txn (R-6.7).
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "scope_draft.published",
      targetType: "job_scope_draft",
      targetId: input.draftId,
      metadata: { jobId: draft.jobId, stepCount: stepRows.length, source },
    });
  });

  return { stepIds: stepRows.map((r) => r.id), stepCount: stepRows.length };
}
