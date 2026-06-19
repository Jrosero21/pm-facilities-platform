import "server-only";

import type { AgentTool } from "@/server/agents/runner";
import { getJobDetail } from "@/server/jobs";
import { getVendor } from "@/server/vendors";
import { getVendorPerformanceScores } from "@/server/analytics/vendor-performance";
import { isJobStalled } from "@/server/analytics/stalled-jobs";
import { countStalledJobs } from "@/server/analytics/stalled-jobs";
import { operationalQueue, type QueueEntry } from "@/server/analytics/operational-queue";
import { getJobMargin } from "@/server/billing/margin";
import { sumApprovedVendorInvoiceTotals } from "@/server/billing/vendor-invoices";
import { listVendorInvoicesForJob } from "@/server/billing/vendor-invoices";
import { listClientInvoicesForJob } from "@/server/billing/client-invoices";

// ── Phase 16 (16e) — tenant-scoped operational read tools ─────────────────────────────
// Six READ-ONLY tools that COMPOSE existing Phase-8/9 readers — NO new SQL, NO new readers
// (WP-16.1). Tenant isolation is STRUCTURAL: each tool is a factory that captures the run's
// tenantId in a closure at bind time, so the (model-driven) caller supplies only the
// entity id — it can NEVER pass a foreign tenantId. Every underlying reader is already
// `(tenantId, …)`-scoped and returns null/empty for a cross-tenant id, so a tenant-A run
// referencing a tenant-B id gets "not found", never tenant-B data (harness group E).
//
// LOCKED 16e-A resolutions:
//   • summarizeVendorPerformance → SCOPE-CUT to vendor profile (no per-vendor activity
//     reader exists; vendor_performance_scores untouched/empty → banked B-16.4).
//   • flagInvoiceAnomalies → exactly TWO rules: (A) negative margin, (B) NTE breach.
//     Invoice aging is EXCLUDED (banked CF-16.2).

// ── 1. summarizeJob ────────────────────────────────────────────────────────────────────
export type JobSummary =
  | { found: false; jobId: string; reason: "not_found_or_not_in_tenant" }
  | {
      found: true;
      jobId: string;
      jobNumber: number;
      clientName: string;
      locationName: string;
      tradeName: string | null;
      priorityName: string | null;
      statusName: string;
      problemDescription: string;
      dueAt: Date | null;
      stalled: { isStalled: boolean; statusCode: string; dwellSeconds: number } | null;
      margin: { revenue: string; cost: string; margin: string };
      invoiceCounts: { vendorInvoices: number; clientInvoices: number };
    };

export function summarizeJobTool(tenantId: string): AgentTool<{ jobId: string }, JobSummary> {
  return {
    name: "summarizeJob",
    kind: "read",
    run: async ({ jobId }) => {
      const job = await getJobDetail(tenantId, jobId);
      if (!job) return { found: false, jobId, reason: "not_found_or_not_in_tenant" };
      const [stalled, margin, vInvoices, cInvoices] = await Promise.all([
        isJobStalled(tenantId, jobId),
        getJobMargin(tenantId, jobId),
        listVendorInvoicesForJob(tenantId, jobId),
        listClientInvoicesForJob(tenantId, jobId),
      ]);
      return {
        found: true,
        jobId: job.id,
        jobNumber: job.jobNumber,
        clientName: job.clientName,
        locationName: job.locationName,
        tradeName: job.tradeName,
        priorityName: job.priorityName,
        statusName: job.statusName,
        problemDescription: job.problemDescription,
        dueAt: job.dueAt,
        stalled,
        margin,
        invoiceCounts: { vendorInvoices: vInvoices.length, clientInvoices: cInvoices.length },
      };
    },
  };
}

// ── 2. identifyStalledJobs ───────────────────────────────────────────────────────────────
export type StalledJobsResult = {
  total: number;
  byStatus: Array<{ statusCode: string; count: number }>;
  stalledJobs: Array<{
    jobId: string;
    jobNumber: number;
    clientName: string;
    statusLabel: string;
    ageInCurrentStatusSeconds: number;
  }>;
};

export function identifyStalledJobsTool(tenantId: string): AgentTool<Record<string, never>, StalledJobsResult> {
  return {
    name: "identifyStalledJobs",
    kind: "read",
    run: async () => {
      const [agg, queue] = await Promise.all([
        countStalledJobs(tenantId),
        operationalQueue(tenantId),
      ]);
      const stalledJobs = queue
        .filter((q) => q.urgencyTier === "stalled")
        .map((q) => ({
          jobId: q.jobId,
          jobNumber: q.jobNumber,
          clientName: q.clientName,
          statusLabel: q.statusLabel,
          ageInCurrentStatusSeconds: q.ageInCurrentStatusSeconds,
        }));
      return { total: agg.total, byStatus: agg.byStatus, stalledJobs };
    },
  };
}

// ── 3. identifySlaRisks ──────────────────────────────────────────────────────────────────
type RiskRow = {
  jobId: string;
  jobNumber: number;
  clientName: string;
  statusLabel: string;
  dueAt: Date | null;
  urgencyTier: QueueEntry["urgencyTier"];
};
export type SlaRisksResult = {
  overdue: RiskRow[];
  unassignedHighPriority: RiskRow[];
};

export function identifySlaRisksTool(tenantId: string): AgentTool<Record<string, never>, SlaRisksResult> {
  return {
    name: "identifySlaRisks",
    kind: "read",
    run: async () => {
      const queue = await operationalQueue(tenantId);
      const toRow = (q: QueueEntry): RiskRow => ({
        jobId: q.jobId,
        jobNumber: q.jobNumber,
        clientName: q.clientName,
        statusLabel: q.statusLabel,
        dueAt: q.dueAt,
        urgencyTier: q.urgencyTier,
      });
      // Select over the queue's EXISTING computed flags — no new threshold logic.
      return {
        overdue: queue.filter((q) => q.isOverdue).map(toRow),
        unassignedHighPriority: queue.filter((q) => q.isUnassignedHighPriority).map(toRow),
      };
    },
  };
}

// ── 4. flagInvoiceAnomalies (rules A + B only) ──────────────────────────────────────────
export type InvoiceAnomaly = {
  jobId: string;
  jobNumber: number | null;
  rules: Array<"negative_margin" | "nte_breach">;
  margin: string;
  approvedVendorTotal: string;
  notToExceedAmount: string | null;
};
export type InvoiceAnomaliesResult = {
  scanned: number;
  scope: "single_job" | "operational_queue";
  flagged: InvoiceAnomaly[];
};

/** Evaluate the two anomaly rules for one job. Returns null if the job is not in tenant. */
async function evaluateJobAnomalies(
  tenantId: string,
  jobId: string,
): Promise<InvoiceAnomaly | null> {
  const job = await getJobDetail(tenantId, jobId);
  if (!job) return null; // cross-tenant / missing → contributes nothing
  const [margin, approvedVendorTotal] = await Promise.all([
    getJobMargin(tenantId, jobId),
    sumApprovedVendorInvoiceTotals(tenantId, jobId),
  ]);
  const rules: Array<"negative_margin" | "nte_breach"> = [];
  // Rule A: negative margin.
  if (Number(margin.margin) < 0) rules.push("negative_margin");
  // Rule B: NTE breach — approved vendor cost exceeds the job's not-to-exceed cap (if set).
  if (job.notToExceedAmount != null && Number(approvedVendorTotal) > Number(job.notToExceedAmount)) {
    rules.push("nte_breach");
  }
  if (rules.length === 0) return null;
  return {
    jobId,
    jobNumber: job.jobNumber,
    rules,
    margin: margin.margin,
    approvedVendorTotal,
    notToExceedAmount: job.notToExceedAmount,
  };
}

export function flagInvoiceAnomaliesTool(
  tenantId: string,
): AgentTool<{ jobId?: string }, InvoiceAnomaliesResult> {
  return {
    name: "flagInvoiceAnomalies",
    kind: "read",
    run: async ({ jobId }) => {
      if (jobId) {
        const flag = await evaluateJobAnomalies(tenantId, jobId);
        return { scanned: 1, scope: "single_job", flagged: flag ? [flag] : [] };
      }
      // No jobId → bounded scan over the operational queue's job ids (NOT all jobs).
      const queue = await operationalQueue(tenantId);
      const results = await Promise.all(queue.map((q) => evaluateJobAnomalies(tenantId, q.jobId)));
      return {
        scanned: queue.length,
        scope: "operational_queue",
        flagged: results.filter((r): r is InvoiceAnomaly => r !== null),
      };
    },
  };
}

// ── 5. summarizeVendorPerformance (B-16.4: real scores when computed, profile-only fallback) ──
// Dispatch-weighted rollup across the vendor's per-(vendor,trade) score rows + the per-trade
// breakdown. Null when no scores have been computed for the vendor yet.
export type VendorPerformanceSummary = {
  overallScore: number;
  completionRate: number;
  onTimeRate: number;
  totalDispatches: number;
  byTrade: {
    tradeId: string | null;
    score: number;
    completionRate: number;
    onTimeRate: number;
    totalDispatches: number;
  }[];
} | null;

export type VendorSummary =
  | { found: false; vendorId: string; reason: "not_found_or_not_in_tenant" }
  | {
      found: true;
      vendorId: string;
      name: string;
      vendorCode: string | null;
      vendorType: string | null;
      mainPhone: string | null;
      mainEmail: string | null;
      status: string;
      // Computed from dispatch history (vendor_performance_scores); null until the scorer
      // has run for this vendor. note carries the fallback message when null.
      performance: VendorPerformanceSummary;
      note: string;
    };

export function summarizeVendorPerformanceTool(
  tenantId: string,
): AgentTool<{ vendorId: string }, VendorSummary> {
  return {
    name: "summarizeVendorPerformance",
    kind: "read",
    run: async ({ vendorId }) => {
      const v = await getVendor(tenantId, vendorId);
      if (!v) return { found: false, vendorId, reason: "not_found_or_not_in_tenant" };

      // Dispatch-weighted rollup over the vendor's per-(vendor,trade) score rows (decimals
      // come back as string|null — num() coerces, matching the scorer harness).
      const scoreRows = await getVendorPerformanceScores(tenantId, vendorId);
      let performance: VendorPerformanceSummary = null;
      if (scoreRows.length > 0) {
        const num = (s: string | null) => Number(s ?? 0);
        let wSum = 0, sScore = 0, sComp = 0, sOnTime = 0;
        for (const r of scoreRows) {
          const w = r.totalDispatches ?? 0;
          wSum += w;
          sScore += num(r.score) * w;
          sComp += num(r.completionRate) * w;
          sOnTime += num(r.onTimeRate) * w;
        }
        performance = wSum > 0 ? {
          overallScore: Math.round((sScore / wSum) * 10) / 10,
          completionRate: Math.round((sComp / wSum) * 10) / 10,
          onTimeRate: Math.round((sOnTime / wSum) * 10) / 10,
          totalDispatches: wSum,
          byTrade: scoreRows.map((r) => ({
            tradeId: r.tradeId,
            score: num(r.score),
            completionRate: num(r.completionRate),
            onTimeRate: num(r.onTimeRate),
            totalDispatches: r.totalDispatches ?? 0,
          })),
        } : null;
      }

      return {
        found: true,
        vendorId: v.id,
        name: v.name,
        vendorCode: v.vendorCode ?? null,
        vendorType: v.vendorType ?? null,
        mainPhone: v.mainPhone ?? null,
        mainEmail: v.mainEmail ?? null,
        status: v.status,
        performance,
        note: performance
          ? "Performance computed from dispatch history (completion-weighted; thin history shrunk toward average)."
          : "Profile only — per-vendor activity/performance scoring not yet available (banked).",
      };
    },
  };
}

// ── 6. recommendNextAction (deterministic, read-only advice) ────────────────────────────
export type NextActionRecommendation =
  | { found: false; jobId: string; reason: "not_found_or_not_in_tenant" }
  | {
      found: true;
      jobId: string;
      recommendation: string;
      facts: {
        statusName: string;
        stalled: boolean;
        dwellSeconds: number | null;
        margin: string;
        dueAt: Date | null;
      };
    };

export function recommendNextActionTool(
  tenantId: string,
): AgentTool<{ jobId: string }, NextActionRecommendation> {
  return {
    name: "recommendNextAction",
    kind: "read",
    run: async ({ jobId }) => {
      const job = await getJobDetail(tenantId, jobId);
      if (!job) return { found: false, jobId, reason: "not_found_or_not_in_tenant" };
      const [stalled, margin] = await Promise.all([
        isJobStalled(tenantId, jobId),
        getJobMargin(tenantId, jobId),
      ]);

      // Deterministic, rule-based recommendation (LLM phrasing can layer on later). Read-only.
      let recommendation: string;
      const now = Date.now();
      if (stalled?.isStalled) {
        recommendation = `Job is stalled in "${job.statusName}" — follow up with the assigned vendor or re-dispatch.`;
      } else if (job.dueAt != null && job.dueAt.getTime() < now) {
        recommendation = `Job is past its due date in "${job.statusName}" — expedite to recover the SLA.`;
      } else if (Number(margin.margin) < 0) {
        recommendation = `Job margin is negative (${margin.margin}) — review pricing/costs before closing.`;
      } else {
        recommendation = `No urgent action — job is progressing normally in "${job.statusName}".`;
      }

      return {
        found: true,
        jobId,
        recommendation,
        facts: {
          statusName: job.statusName,
          stalled: stalled?.isStalled ?? false,
          dwellSeconds: stalled?.dwellSeconds ?? null,
          margin: margin.margin,
          dueAt: job.dueAt,
        },
      };
    },
  };
}
