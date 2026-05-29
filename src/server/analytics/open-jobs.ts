import "server-only";

// ── Phase 9 batch 9c — OPEN-JOBS AGGREGATES (dashboard cards + top-N widgets) ──────────
// Tenant-scoped read-only aggregates over the open-job population (9c manifest §3/§9). Mirrors
// the Phase 8 billing reader conventions: explicit `tenantId` first param, bare `db` client,
// fluent select/where chain, counts coerced via Number().
//
// "OPEN" = a job whose current status is non-terminal (`job_statuses.is_terminal = false`); no
// hardcoded status codes. Archived jobs (soft-deleted, `jobs.is_archived = true`) are excluded
// everywhere — they are not part of the active population (this matches the /jobs inventory query
// `listJobs`, which also filters `is_archived = false`). [REFINEMENT R1 vs manifest §9, which
// stated only `is_terminal=false`; surfaced in the 9c.4 report for review.]
//
// "Include zero-count rows" for the status/priority CARD readers (a "0 open" card is informative,
// not absent) is done by a two-query merge: (1) the reference vocabulary, (2) grouped open-job
// counts; merged in app code (≤9 statuses / ≤5 priorities — trivial). The top-N readers INNER JOIN
// (a client/trade with 0 open jobs has nothing to rank) and return [] when there are no open jobs.

import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/server/db";
import { clients, jobStatuses, jobs, priorities, trades } from "@/server/schema";

/** Open-job count per active non-terminal status. Returns ALL such statuses (count 0 included),
 *  ordered by the status sort order. */
export async function countOpenJobsByStatus(
  tenantId: string,
): Promise<
  Array<{ statusId: string; statusCode: string; statusLabel: string; category: string; count: number }>
> {
  const statuses = await db
    .select({
      id: jobStatuses.id,
      code: jobStatuses.code,
      name: jobStatuses.name,
      category: jobStatuses.category,
    })
    .from(jobStatuses)
    .where(and(eq(jobStatuses.status, "active"), eq(jobStatuses.isTerminal, false)))
    .orderBy(jobStatuses.sortOrder);

  const rows = await db
    .select({ statusId: jobs.currentStatusId, c: count() })
    .from(jobs)
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.isArchived, false)))
    .groupBy(jobs.currentStatusId);
  const byStatusId = new Map(rows.map((r) => [r.statusId, Number(r.c)]));

  // Merge: terminal-status counts in `rows` simply fall away (not in the `statuses` vocabulary).
  return statuses.map((s) => ({
    statusId: s.id,
    statusCode: s.code,
    statusLabel: s.name,
    category: s.category,
    count: byStatusId.get(s.id) ?? 0,
  }));
}

/** Open-job count per active tenant priority. Returns ALL such priorities (count 0 included),
 *  ordered by rank (1 = most urgent). Open jobs with no priority assigned are not counted in any
 *  bucket (no "unassigned priority" bucket in MVP). */
export async function countOpenJobsByPriority(
  tenantId: string,
): Promise<
  Array<{ priorityId: string; priorityCode: string; priorityLabel: string; rank: number; count: number }>
> {
  const prios = await db
    .select({
      id: priorities.id,
      code: priorities.code,
      name: priorities.name,
      rank: priorities.rank,
    })
    .from(priorities)
    .where(and(eq(priorities.tenantId, tenantId), eq(priorities.status, "active")))
    .orderBy(priorities.rank);

  const rows = await db
    .select({ priorityId: jobs.priorityId, c: count() })
    .from(jobs)
    .innerJoin(jobStatuses, eq(jobs.currentStatusId, jobStatuses.id))
    .where(
      and(
        eq(jobs.tenantId, tenantId),
        eq(jobs.isArchived, false),
        eq(jobStatuses.isTerminal, false),
        isNotNull(jobs.priorityId),
      ),
    )
    .groupBy(jobs.priorityId);
  const byPriorityId = new Map(rows.map((r) => [r.priorityId, Number(r.c)]));

  return prios.map((p) => ({
    priorityId: p.id,
    priorityCode: p.code,
    priorityLabel: p.name,
    rank: p.rank,
    count: byPriorityId.get(p.id) ?? 0,
  }));
}

/** Top `limit` clients by open-job count, descending. Clients with 0 open jobs are not returned. */
export async function topClientsByOpenJobs(
  tenantId: string,
  limit = 5,
): Promise<Array<{ clientId: string; clientName: string; count: number }>> {
  const cnt = count();
  const rows = await db
    .select({ clientId: jobs.clientId, clientName: clients.name, count: cnt })
    .from(jobs)
    .innerJoin(jobStatuses, eq(jobs.currentStatusId, jobStatuses.id))
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.isArchived, false), eq(jobStatuses.isTerminal, false)))
    .groupBy(jobs.clientId, clients.name)
    .orderBy(desc(cnt))
    .limit(limit);
  return rows.map((r) => ({ clientId: r.clientId, clientName: r.clientName, count: Number(r.count) }));
}

/** Top `limit` trades by open-job count, descending. Jobs with no primary trade are excluded
 *  (INNER JOIN trades); trades with 0 open jobs are not returned. */
export async function topTradesByOpenJobs(
  tenantId: string,
  limit = 5,
): Promise<Array<{ tradeId: string; tradeCode: string; tradeLabel: string; count: number }>> {
  const cnt = count();
  const rows = await db
    .select({ tradeId: jobs.primaryTradeId, tradeCode: trades.code, tradeLabel: trades.name, count: cnt })
    .from(jobs)
    .innerJoin(jobStatuses, eq(jobs.currentStatusId, jobStatuses.id))
    .innerJoin(trades, eq(jobs.primaryTradeId, trades.id))
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.isArchived, false), eq(jobStatuses.isTerminal, false)))
    .groupBy(jobs.primaryTradeId, trades.code, trades.name)
    .orderBy(desc(cnt))
    .limit(limit);
  return rows.map((r) => ({
    tradeId: r.tradeId as string,
    tradeCode: r.tradeCode,
    tradeLabel: r.tradeLabel,
    count: Number(r.count),
  }));
}
