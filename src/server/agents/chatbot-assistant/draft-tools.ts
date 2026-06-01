import "server-only";

import type { AgentTool } from "@/server/agents/runner";
import { getJobDetail, type JobDetail } from "@/server/jobs";
import { isJobStalled } from "@/server/analytics/stalled-jobs";
import { createRewriteDraft } from "@/server/agents/drafts";

// ── Phase 16 (16f) — the assistant's DRAFT tools (the phase's only writes) ────────────
// Two write tools that land a pending_review row in update_rewrite_drafts via the EXISTING
// createRewriteDraft writer (never a hand-rolled insert). The agent STOPS at pending_review
// — it has NO publish path: this module does NOT import publishRewriteDraft / createReview /
// client-updates / communication_logs. Review (human) and publish (human) are separate,
// gated actions; the §2.5 draft gate is enforced by createRewriteDraft forcing
// status='pending_review' (we never pass/force status).
//
// LOCKED bindings (16f-A): agent_run_id = the run's ctx.runId · source_id = jobId ·
// source_type job_note (client) / vendor_update (vendor) · draft_content = DETERMINISTIC
// prose from job facts (LLM phrasing deferred — B-16.5). Tenant isolation is structural:
// each factory captures the run's tenantId, so the caller supplies only jobId and can never
// draft against a foreign tenant (getJobDetail returns null cross-tenant → no draft created).

export type DraftToolResult =
  | { found: false; jobId: string; reason: "not_found_or_not_in_tenant" }
  | { found: true; jobId: string; draftId: string; status: string; sourceType: "job_note" | "vendor_update" };

function fmtDwell(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  if (h >= 24) return `${Math.floor(h / 24)} day(s)`;
  if (h >= 1) return `${h} hour(s)`;
  return `${Math.max(1, Math.floor(seconds / 60))} minute(s)`;
}

/** Deterministic, client-safe update prose (review-ready; no pricing/vendor-internal data). */
function composeClientUpdate(job: JobDetail, stalledDwellSeconds: number | null): string {
  const lines = [
    `Update on Job #${job.jobNumber} at ${job.locationName} (${job.clientName}).`,
    ``,
    `Reported issue: ${job.problemDescription}`,
    `Current status: ${job.statusName}.`,
  ];
  if (job.scheduledStartAt) {
    lines.push(`Scheduled to begin: ${job.scheduledStartAt.toISOString().slice(0, 10)}.`);
  }
  if (stalledDwellSeconds != null) {
    lines.push(
      `This job has been in its current status for ${fmtDwell(stalledDwellSeconds)}; we are actively following up to keep it moving.`,
    );
  }
  lines.push(``, `We will share the next update as work progresses.`);
  return lines.join("\n");
}

/** Deterministic vendor-facing follow-up prose (status/ETA chase). */
function composeVendorFollowUp(job: JobDetail, stalledDwellSeconds: number | null): string {
  const lines = [
    `Follow-up on Job #${job.jobNumber} at ${job.locationName}.`,
    `Trade: ${job.tradeName ?? "—"}. Current status: ${job.statusName}.`,
    ``,
    `Reported issue: ${job.problemDescription}`,
    `Please confirm your on-site ETA and update the assignment with current progress.`,
  ];
  if (stalledDwellSeconds != null) {
    lines.push(
      `This job has been awaiting progress for ${fmtDwell(stalledDwellSeconds)} — please prioritize and respond.`,
    );
  }
  return lines.join("\n");
}

/** draftClientUpdate(jobId) — lands a pending_review client-update draft (source_type='job_note'). */
export function draftClientUpdateTool(
  tenantId: string,
  agentRunId: string,
): AgentTool<{ jobId: string }, DraftToolResult> {
  return {
    name: "draftClientUpdate",
    kind: "write",
    run: async ({ jobId }) => {
      const job = await getJobDetail(tenantId, jobId);
      if (!job) return { found: false, jobId, reason: "not_found_or_not_in_tenant" };
      const stalled = await isJobStalled(tenantId, jobId);
      const draftContent = composeClientUpdate(job, stalled?.isStalled ? stalled.dwellSeconds : null);
      const draft = await createRewriteDraft({
        tenantId,
        jobId,
        agentRunId,
        sourceType: "job_note",
        sourceId: jobId,
        draftContent,
      });
      return { found: true, jobId, draftId: draft.id, status: draft.status, sourceType: "job_note" };
    },
  };
}

/** draftVendorFollowUp(jobId) — lands a pending_review vendor-follow-up draft (source_type='vendor_update'). */
export function draftVendorFollowUpTool(
  tenantId: string,
  agentRunId: string,
): AgentTool<{ jobId: string }, DraftToolResult> {
  return {
    name: "draftVendorFollowUp",
    kind: "write",
    run: async ({ jobId }) => {
      const job = await getJobDetail(tenantId, jobId);
      if (!job) return { found: false, jobId, reason: "not_found_or_not_in_tenant" };
      const stalled = await isJobStalled(tenantId, jobId);
      const draftContent = composeVendorFollowUp(job, stalled?.isStalled ? stalled.dwellSeconds : null);
      const draft = await createRewriteDraft({
        tenantId,
        jobId,
        agentRunId,
        sourceType: "vendor_update",
        sourceId: jobId,
        draftContent,
      });
      return { found: true, jobId, draftId: draft.id, status: draft.status, sourceType: "vendor_update" };
    },
  };
}
