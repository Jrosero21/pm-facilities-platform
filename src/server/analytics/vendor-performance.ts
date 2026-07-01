import "server-only";
import { db } from "@/server/db";
import {
  jobVendorAssignments,
  jobVendorAssignmentStatusHistory,
  vendorCheckIns,
  dispatchAssignmentStatuses,
  vendorPerformanceScores,
} from "@/server/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * B-16.4 — vendor performance scorer (populator + reader).
 *
 * Locked scoring model:
 *   completion_rate = completed / total_dispatches   (declines + cancels count AGAINST — they
 *                     sit in the denominator but not the numerator: "if I dispatch, will it get done?")
 *   on_time_rate    = on_time   / completed          (arrival <= scheduled_start_at, over completed only)
 *   raw composite   = 0.7 * completion + 0.3 * on_time   (completion-dominant, operator's call)
 *   shrinkage       = (n*raw + K*popMean) / (n + K)  toward the population mean, K=5
 *                     (thin-history vendors pulled to the average until they've proven it)
 *   score           = shrunk composite * 100  (0..100, into decimal(6,2))
 *   avg_rating      = null (no rating-capture path exists yet)
 *
 * Per (vendor x trade). Idempotent: delete-then-insert the tenant's rows in a tx.
 * Status resolution by CODE (stable; survives display-name changes e.g. "Declined" -> "Vendor Declined").
 */

const SHRINKAGE_K = 5;          // prior strength: ~K average-jobs assumed before trusting own record
const W_COMPLETION = 0.7;       // completion dominates
const W_ON_TIME = 0.3;

type StatusCodeMap = { workComplete: string; onSite: string };

async function resolveStatusIds(): Promise<StatusCodeMap> {
  const rows = await db
    .select({ id: dispatchAssignmentStatuses.id, code: dispatchAssignmentStatuses.code })
    .from(dispatchAssignmentStatuses);
  const byCode = new Map(rows.map((r) => [r.code, r.id]));
  const workComplete = byCode.get("WORK_COMPLETE");
  const onSite = byCode.get("ON_SITE");
  if (!workComplete || !onSite) {
    throw new Error("vendor-performance: missing WORK_COMPLETE / ON_SITE status codes");
  }
  return { workComplete, onSite };
}

type GroupAccumulator = {
  vendorId: string;
  tradeId: string;
  total: number;
  completed: number;
  onTime: number;
};

export type VendorPerformanceRollupResult = {
  groupsWritten: number;
  vendorsCovered: number;
  populationMeanCompletion: number;
  populationMeanOnTime: number;
};

/**
 * Compute and persist vendor performance scores for a tenant.
 * Two-pass: (1) per-group raw rates, (2) population-mean shrinkage -> score.
 */
export async function computeVendorPerformanceScores(
  tenantId: string,
): Promise<VendorPerformanceRollupResult> {
  const status = await resolveStatusIds();

  // ---- read all assignments for the tenant ----
  const assignments = await db
    .select({
      id: jobVendorAssignments.id,
      vendorId: jobVendorAssignments.vendorId,
      tradeId: jobVendorAssignments.matchedTradeId,
      currentStatusId: jobVendorAssignments.currentStatusId,
      scheduledStartAt: jobVendorAssignments.scheduledStartAt,
    })
    .from(jobVendorAssignments)
    .where(eq(jobVendorAssignments.tenantId, tenantId));

  if (assignments.length === 0) {
    // nothing to score; clear any stale rows and return
    await db.delete(vendorPerformanceScores).where(eq(vendorPerformanceScores.tenantId, tenantId));
    return { groupsWritten: 0, vendorsCovered: 0, populationMeanCompletion: 0, populationMeanOnTime: 0 };
  }

  const completedIds = assignments
    .filter((a) => a.currentStatusId === status.workComplete)
    .map((a) => a.id);

  // ---- arrival timestamps for completed assignments: check-in first, On-Site transition fallback ----
  const arrivalByAssignment = new Map<string, Date>();

  if (completedIds.length > 0) {
    // check-ins (earliest per assignment)
    const checkIns = await db
      .select({ assignmentId: vendorCheckIns.assignmentId, occurredAt: vendorCheckIns.occurredAt })
      .from(vendorCheckIns)
      .where(inArray(vendorCheckIns.assignmentId, completedIds));
    for (const c of checkIns) {
      const prev = arrivalByAssignment.get(c.assignmentId);
      if (!prev || c.occurredAt < prev) arrivalByAssignment.set(c.assignmentId, c.occurredAt);
    }

    // On-Site transition fallback for any completed assignment with no check-in
    const missing = completedIds.filter((id) => !arrivalByAssignment.has(id));
    if (missing.length > 0) {
      const onSiteRows = await db
        .select({
          assignmentId: jobVendorAssignmentStatusHistory.assignmentId,
          createdAt: jobVendorAssignmentStatusHistory.createdAt,
        })
        .from(jobVendorAssignmentStatusHistory)
        .where(
          and(
            inArray(jobVendorAssignmentStatusHistory.assignmentId, missing),
            eq(jobVendorAssignmentStatusHistory.toStatusId, status.onSite),
          ),
        );
      for (const r of onSiteRows) {
        const prev = arrivalByAssignment.get(r.assignmentId);
        if (!prev || r.createdAt < prev) arrivalByAssignment.set(r.assignmentId, r.createdAt);
      }
    }
  }

  // ---- PASS 1: per-(vendor,trade) accumulation ----
  const groups = new Map<string, GroupAccumulator>();

  for (const a of assignments) {
    if (!a.tradeId) continue; // matched_trade_id is the per-trade key; skip if absent
    const key = `${a.vendorId}::${a.tradeId}`;
    let g = groups.get(key);
    if (!g) {
      g = { vendorId: a.vendorId, tradeId: a.tradeId, total: 0, completed: 0, onTime: 0 };
      groups.set(key, g);
    }
    g.total += 1;
    if (a.currentStatusId === status.workComplete) {
      g.completed += 1;
      const arrival = arrivalByAssignment.get(a.id);
      const sched = a.scheduledStartAt;
      if (arrival && sched && arrival.getTime() <= sched.getTime()) g.onTime += 1;
    }
  }

  const groupList = [...groups.values()];

  // raw rates per group
  const raw = groupList.map((g) => {
    const completion = g.total > 0 ? g.completed / g.total : 0;
    const onTimeRate = g.completed > 0 ? g.onTime / g.completed : 0;
    return { ...g, completion, onTimeRate, onTimeCount: g.onTime, n: g.total };
  });

  // ---- population means (over groups) ----
  const popMeanCompletion = raw.length ? raw.reduce((s, r) => s + r.completion, 0) / raw.length : 0;
  const popMeanOnTime = raw.length ? raw.reduce((s, r) => s + r.onTimeRate, 0) / raw.length : 0;

  // ---- PASS 2: shrinkage + composite ----
  const shrink = (rawRate: number, n: number, mean: number) =>
    (n * rawRate + SHRINKAGE_K * mean) / (n + SHRINKAGE_K);

  const now = new Date();
  const toInsert = raw.map((r) => {
    const shrunkCompletion = shrink(r.completion, r.n, popMeanCompletion);
    const shrunkOnTime = shrink(r.onTimeRate, r.n, popMeanOnTime);
    const composite = W_COMPLETION * shrunkCompletion + W_ON_TIME * shrunkOnTime;
    return {
      tenantId,
      vendorId: r.vendorId,
      tradeId: r.tradeId,
      totalDispatches: r.total,
      jobsCompleted: r.completed,
      jobsOnTime: r.onTimeCount,
      completionRate: (r.completion * 100).toFixed(2),   // decimal(5,2) as 0..100
      onTimeRate: (r.onTimeRate * 100).toFixed(2),
      score: (composite * 100).toFixed(2),               // decimal(6,2) as 0..100
      avgRating: null,
      computedAt: now,
      periodStart: null,
      periodEnd: null,
      status: "active" as const,
    };
  });

  // ---- idempotent write: delete-then-insert in a tx ----
  await db.transaction(async (tx) => {
    await tx.delete(vendorPerformanceScores).where(eq(vendorPerformanceScores.tenantId, tenantId));
    if (toInsert.length > 0) {
      // chunk to avoid oversized statements
      for (let i = 0; i < toInsert.length; i += 200) {
        await tx.insert(vendorPerformanceScores).values(toInsert.slice(i, i + 200));
      }
    }
  });

  const vendorsCovered = new Set(raw.map((r) => r.vendorId)).size;
  return {
    groupsWritten: toInsert.length,
    vendorsCovered,
    populationMeanCompletion: popMeanCompletion,
    populationMeanOnTime: popMeanOnTime,
  };
}

// ===== READER =====

export type VendorPerformanceScoreRow = {
  vendorId: string;
  tradeId: string | null;
  totalDispatches: number | null;
  jobsCompleted: number | null;
  jobsOnTime: number | null;
  completionRate: string | null;
  onTimeRate: string | null;
  score: string | null;
  computedAt: Date | null;
};

/**
 * Reader: fetch computed score rows for a vendor (all trades) in a tenant.
 * Fills the chatbot's summarizeVendorPerformance stub when rows exist.
 */
export async function getVendorPerformanceScores(
  tenantId: string,
  vendorId: string,
): Promise<VendorPerformanceScoreRow[]> {
  return db
    .select({
      vendorId: vendorPerformanceScores.vendorId,
      tradeId: vendorPerformanceScores.tradeId,
      totalDispatches: vendorPerformanceScores.totalDispatches,
      jobsCompleted: vendorPerformanceScores.jobsCompleted,
      jobsOnTime: vendorPerformanceScores.jobsOnTime,
      completionRate: vendorPerformanceScores.completionRate,
      onTimeRate: vendorPerformanceScores.onTimeRate,
      score: vendorPerformanceScores.score,
      computedAt: vendorPerformanceScores.computedAt,
    })
    .from(vendorPerformanceScores)
    .where(
      and(
        eq(vendorPerformanceScores.tenantId, tenantId),
        eq(vendorPerformanceScores.vendorId, vendorId),
        eq(vendorPerformanceScores.status, "active"),
      ),
    );
}

export async function getVendorPerformanceScoresForVendors(
  tenantId: string,
  vendorIds: string[],
  tradeId: string,
): Promise<VendorPerformanceScoreRow[]> {
  if (vendorIds.length === 0) return [];
  return db
    .select({
      vendorId: vendorPerformanceScores.vendorId,
      tradeId: vendorPerformanceScores.tradeId,
      totalDispatches: vendorPerformanceScores.totalDispatches,
      jobsCompleted: vendorPerformanceScores.jobsCompleted,
      jobsOnTime: vendorPerformanceScores.jobsOnTime,
      completionRate: vendorPerformanceScores.completionRate,
      onTimeRate: vendorPerformanceScores.onTimeRate,
      score: vendorPerformanceScores.score,
      computedAt: vendorPerformanceScores.computedAt,
    })
    .from(vendorPerformanceScores)
    .where(
      and(
        eq(vendorPerformanceScores.tenantId, tenantId),
        inArray(vendorPerformanceScores.vendorId, vendorIds),
        eq(vendorPerformanceScores.tradeId, tradeId),
        eq(vendorPerformanceScores.status, "active"),
      ),
    );
}
// Grain is one active row per (vendor, trade), so vendorIds + tradeId returns
// at most one row per vendor. Trade-filtered on purpose: vendor-only would pull
// unrelated-trade rows into a single-trade dispatch decision.
