import "server-only";

// ── Phase 19 batch 19d — EXCEPTION DETECTION (the "manage by exception" feed) ──────────
// Three tenant-wide exception kinds folded into one sorted operator list (getExceptions):
//   - vendor_not_accepted  — a dispatch SENT to a vendor but not yet accepted (status code 'SENT').
//   - nte_increase_requested — a change order awaiting approval (status 'submitted'); the CO IS the
//     NTE-increase mechanism (effective NTE = jobs.not_to_exceed_amount + Σ approved COs).
//   - operational — overdue / stalled / unassigned-high-priority jobs, from operationalQueue
//     (FILTERED — pure 'aged' is excluded; aged is "old", not blocking).
// Tenant-scope + jobs/clients label join mirrors the 18b draft queue / 18c vendor inbox readers.
// DETECTION ONLY — no auto-response (Phase 28), no autonomous send (Phase 23). Wall-clock dwell
// (Option B); the business-hours clock is banked (CF-19.1).

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  changeOrders,
  clients,
  dispatchAssignmentStatuses,
  jobStatuses,
  jobVendorAssignments,
  jobs,
  priorities,
  tenants,
  vendors,
} from "@/server/schema";
import { operationalQueue } from "@/server/analytics/operational-queue";
import { isDispatchStuck, dispatchStuckThresholdSeconds } from "@/server/analytics/dispatch-sla-rules";
import { REDISPATCH_MAX_ATTEMPTS } from "@/server/redispatch-suggestion";
import { getDispatchAssignmentStatusByCode } from "@/server/dispatch-reference";
import type { UrgencyTier } from "@/server/analytics/stalled-rules";
import type { FollowUpCategory } from "@/lib/follow-up";

// CF-19.1a — a stuck dispatch is lifted above any non-stuck row (across all kinds) by adding
// a large constant to its sortKey. Within each band (stuck / non-stuck) true age still orders.
const STUCK_SORT_BUMP_SECONDS = 365 * 24 * 3600;

// ── TRIAGE WEIGHTING (the tier bumps the sortKey comment invited) ──────────────────────
// The triage score is age + the SAME stuck bump + a priority bump + an urgency bump — all in
// SECONDS-EQUIVALENT units so they combine on one auditable scale. Named + tunable (never magic
// numbers inline). All bumps sit BELOW the stuck bump (365d), so a stuck row still bands above a
// non-stuck one; they are large enough to reorder WITHIN a band (a high-priority young row can
// overtake an older low-priority one). Kinds carrying no priority/urgency signal get 0 for that
// bump — their triage score == age + stuck (base behavior preserved).
const DAY_SECONDS = 24 * 3600;
// Priority: lower priorities.rank = more urgent (rank 1 = top). Range-agnostic (MAX / rank), so it
// works regardless of a tenant's rank ceiling: rank 1 → 7d, 2 → 3.5d, 3 → ~2.3d, …; null → 0.
const PRIORITY_BUMP_MAX_SECONDS = 7 * DAY_SECONDS;
function priorityBumpFromRank(rank: number | null): number {
  return rank != null && rank >= 1 ? Math.round(PRIORITY_BUMP_MAX_SECONDS / rank) : 0;
}
// Urgency tiers (operational rows) by URGENCY_TIER_ORDER — stalled most urgent; aged = 0 (aged is
// informational, not blocking, and is already filtered out of the exception feed).
const URGENCY_BUMP_SECONDS: Record<UrgencyTier, number> = {
  stalled: 5 * DAY_SECONDS,
  overdue: 3 * DAY_SECONDS,
  "unassigned-high-priority": 3 * DAY_SECONDS,
  aged: 0,
};
// Client-priority: applied ONLY when the tenant switch (tenants.priority_client_weighting_enabled)
// is ON and the client is flagged (clients.is_priority). A NUDGE, not an override — 2d is
// comparable to a mid priority step (rank-3 ≈ 2.3d) and sits well below the urgency tiers and the
// 365d stuck band, so an older/urgent normal-client job still outranks a slightly-late priority one.
const CLIENT_PRIORITY_BUMP_SECONDS = 2 * DAY_SECONDS;

// ── RECOMMENDED-RUNG ANNOTATION (deterministic exception-kind → shipped capability) ────
// A pure computed hint mapping each exception kind to the next operator step, reflecting the
// rungs already on main (vendor_followup chase = rung-0, redispatch = rung-1, NTE review). NO
// LLM, NO side effect — it LABELS the recommended action; the operator still clicks through.
export type RecommendedAction = { rung: string; label: string; then?: string };

// ── Reader rows ───────────────────────────────────────────────────────────────────────

export type VendorNotAcceptedRow = {
  jobId: string;
  jobNumber: number;
  clientName: string;
  assignmentId: string;
  vendorName: string;
  sentAt: Date | null;
  ageSeconds: number;
  priorityCode: string | null;
  priorityRank: number | null; // priorities.rank (1 = most urgent) — feeds the triage priority bump
  isPriority: boolean; // clients.is_priority — feeds the (tenant-switch-gated) client-priority bump
  isStuck: boolean;
  thresholdSeconds: number | null;
  // CF-19.1a re-dispatch surface (Phase 28). attemptCount = SENT assignments on the job (any vendor
  // actually contacted). redispatchState is null for a NON-stuck row (no control shown); for a stuck
  // row it is one of the three; suggestion is set only for "suggestion_ready". no_eligible_vendor
  // exhaustion is NOT computed here (discovered on click) — only the cheap max-attempts cap.
  attemptCount: number;
  redispatchState: "can_suggest" | "suggestion_ready" | "exhausted_max_attempts" | null;
  suggestion: { draftId: string; draftVendorName: string } | null;
};

/**
 * Assignments dispatched to a vendor but not yet accepted — status code 'SENT' (category
 * 'pending'). DRAFT is not-yet-sent; ACCEPTED/SCHEDULED/… are responded; DECLINED/CANCELLED/
 * WORK_COMPLETE are terminal. ageSeconds = wall-clock dwell since sent_at (COALESCE to
 * created_at defensively), mirroring operationalQueue's TIMESTAMPDIFF idiom.
 */
export async function listVendorNotAccepted(tenantId: string): Promise<VendorNotAcceptedRow[]> {
  const rows = await db
    .select({
      jobId: jobVendorAssignments.jobId,
      jobNumber: jobs.jobNumber,
      clientName: clients.name,
      assignmentId: jobVendorAssignments.id,
      vendorName: vendors.name,
      sentAt: jobVendorAssignments.sentAt,
      ageSeconds: sql<number>`EXTRACT(EPOCH FROM (NOW() - COALESCE(${jobVendorAssignments.sentAt}, ${jobVendorAssignments.createdAt})))::int`,
      priorityCode: priorities.code,
      priorityRank: priorities.rank,
      isPriority: clients.isPriority,
    })
    .from(jobVendorAssignments)
    .innerJoin(
      dispatchAssignmentStatuses,
      eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id),
    )
    .innerJoin(jobs, eq(jobs.id, jobVendorAssignments.jobId))
    .innerJoin(clients, eq(clients.id, jobs.clientId))
    .innerJoin(vendors, eq(vendors.id, jobVendorAssignments.vendorId))
    .leftJoin(priorities, eq(jobs.priorityId, priorities.id))
    .where(
      and(
        eq(jobVendorAssignments.tenantId, tenantId),
        eq(dispatchAssignmentStatuses.code, "SENT"),
      ),
    );
  const enriched = rows.map((r) => {
    const ageSeconds = Number(r.ageSeconds);
    const priorityCode = r.priorityCode ?? null;
    return {
      ...r,
      ageSeconds,
      priorityCode,
      isStuck: isDispatchStuck({ statusCode: "SENT", priorityCode, dwellSeconds: ageSeconds }),
      thresholdSeconds: dispatchStuckThresholdSeconds("SENT", priorityCode) ?? null,
    };
  });

  // ── Second pass (NOT correlated subqueries) — attemptCount for every row + suggestion-draft
  //    detection for the stuck ones. Two small IN-list queries, merged in JS. ──────────────────
  const sentByJob = new Map<string, number>();
  const draftByStuck = new Map<string, { draftId: string; draftVendorName: string }>();

  if (enriched.length > 0) {
    const jobIds = [...new Set(enriched.map((r) => r.jobId))];
    const sentRows = await db
      .select({ jobId: jobVendorAssignments.jobId, n: sql<number>`COUNT(*)` })
      .from(jobVendorAssignments)
      .where(
        and(
          eq(jobVendorAssignments.tenantId, tenantId),
          inArray(jobVendorAssignments.jobId, jobIds),
          isNotNull(jobVendorAssignments.sentAt),
        ),
      )
      .groupBy(jobVendorAssignments.jobId);
    for (const c of sentRows) sentByJob.set(c.jobId, Number(c.n));

    const stuckIds = enriched.filter((r) => r.isStuck).map((r) => r.assignmentId);
    if (stuckIds.length > 0) {
      const draftStatus = await getDispatchAssignmentStatusByCode("DRAFT");
      if (draftStatus) {
        const drafts = await db
          .select({
            draftId: jobVendorAssignments.id,
            replaces: jobVendorAssignments.replacesAssignmentId,
            draftVendorName: vendors.name,
          })
          .from(jobVendorAssignments)
          .innerJoin(vendors, eq(vendors.id, jobVendorAssignments.vendorId))
          .where(
            and(
              eq(jobVendorAssignments.tenantId, tenantId),
              inArray(jobVendorAssignments.replacesAssignmentId, stuckIds),
              eq(jobVendorAssignments.currentStatusId, draftStatus.id),
            ),
          );
        for (const d of drafts) {
          if (d.replaces) draftByStuck.set(d.replaces, { draftId: d.draftId, draftVendorName: d.draftVendorName });
        }
      }
    }
  }

  return enriched.map((r) => {
    const attemptCount = sentByJob.get(r.jobId) ?? 0;
    let redispatchState: VendorNotAcceptedRow["redispatchState"] = null;
    let suggestion: VendorNotAcceptedRow["suggestion"] = null;
    if (r.isStuck) {
      const draft = draftByStuck.get(r.assignmentId);
      if (draft) {
        redispatchState = "suggestion_ready";
        suggestion = draft;
      } else if (attemptCount >= REDISPATCH_MAX_ATTEMPTS) {
        redispatchState = "exhausted_max_attempts";
      } else {
        redispatchState = "can_suggest";
      }
    }
    return { ...r, attemptCount, redispatchState, suggestion };
  });
}

export type NteIncreaseRow = {
  jobId: string;
  jobNumber: number;
  clientName: string;
  isPriority: boolean;
  changeOrderId: string;
  total: string;
  reason: string | null;
  pendingSince: Date;
};

/**
 * Change orders awaiting an approval decision — status 'submitted' = the increase requested.
 * `pendingSince` uses updated_at as a PROXY for the submit time (change_orders has no dedicated
 * submitted_at column; a precise timestamp lives in change_order_approvals — banked refinement).
 */
export async function listNteIncreaseRequested(tenantId: string): Promise<NteIncreaseRow[]> {
  return db
    .select({
      jobId: changeOrders.jobId,
      jobNumber: jobs.jobNumber,
      clientName: clients.name,
      isPriority: clients.isPriority,
      changeOrderId: changeOrders.id,
      total: changeOrders.total,
      reason: changeOrders.reason,
      pendingSince: changeOrders.updatedAt,
    })
    .from(changeOrders)
    .innerJoin(jobs, eq(jobs.id, changeOrders.jobId))
    .innerJoin(clients, eq(clients.id, jobs.clientId))
    .where(and(eq(changeOrders.tenantId, tenantId), eq(changeOrders.status, "submitted")));
}

export type FollowUpOverdueRow = {
  jobId: string;
  jobNumber: number;
  clientName: string;
  isPriority: boolean;
  followUpAt: Date;
  category: FollowUpCategory | null;
  ageSeconds: number;
};

/**
 * Jobs whose operator follow-up reminder (jobs.follow_up_at) is in the past — the "next action is
 * overdue" signal. OPEN-job-scoped like operationalQueue (is_terminal=false AND is_archived=false) so
 * a closed/archived job's stale follow-up doesn't nag.
 *
 * The OVERDUE comparison + ageSeconds are computed in JS (Date.now), NOT in SQL — follow_up_at is
 * written CLIENT-side (an operator-picked Date via mysql2), so the stored value and the server's
 * NOW() live in different timezone frames; a SQL `follow_up_at < NOW()` skews by the server's UTC
 * offset. mysql2 round-trips the stored datetime back to the correct instant, so `getTime() <
 * Date.now()` is frame-safe. This mirrors operationalQueue's dueAt overdue check exactly. Wall-clock
 * dwell (Option B; CF-19.1 banked). The SQL stage only does the structural filters (open + has a
 * follow-up), which the jobs_tenant_followup_idx still supports.
 */
export async function listFollowUpOverdue(tenantId: string): Promise<FollowUpOverdueRow[]> {
  const rows = await db
    .select({
      jobId: jobs.id,
      jobNumber: jobs.jobNumber,
      clientName: clients.name,
      isPriority: clients.isPriority,
      followUpAt: jobs.followUpAt,
      category: jobs.followUpCategory,
    })
    .from(jobs)
    .innerJoin(clients, eq(clients.id, jobs.clientId))
    .innerJoin(jobStatuses, eq(jobStatuses.id, jobs.currentStatusId))
    .where(
      and(
        eq(jobs.tenantId, tenantId),
        isNotNull(jobs.followUpAt),
        eq(jobs.isArchived, false),
        eq(jobStatuses.isTerminal, false),
      ),
    );
  const nowMs = Date.now();
  const out: FollowUpOverdueRow[] = [];
  for (const r of rows) {
    const at = r.followUpAt as Date; // isNotNull-filtered above
    const ageSeconds = Math.floor((nowMs - at.getTime()) / 1000);
    if (ageSeconds <= 0) continue; // future-dated → not yet due, skip
    out.push({ jobId: r.jobId, jobNumber: r.jobNumber, clientName: r.clientName, isPriority: r.isPriority, followUpAt: at, category: r.category, ageSeconds });
  }
  return out;
}

// ── The composed exception feed ───────────────────────────────────────────────────────

type ExceptionBase = {
  jobId: string;
  jobNumber: number;
  clientName: string;
  isPriority: boolean; // clients.is_priority — feeds the tenant-switch-gated client-priority bump
  // sortKey — the ORIGINAL elapsed-seconds key (+ stuck bump for vendor rows). KEPT unchanged so
  // the component's true-age fallback (kinds without an age field) is unaffected. Ranking is now
  // driven by triageScore (below); sortKey stays as the raw age signal for display/back-compat.
  sortKey: number;
};

// The pre-triage exception union (what the readers assemble). getExceptions layers the triage
// fields on top → Exception.
type ExceptionCore = ExceptionBase &
  (
    | {
        kind: "vendor_not_accepted";
        assignmentId: string;
        vendorName: string;
        sentAt: Date | null;
        ageSeconds: number;
        priorityCode: string | null;
        priorityRank: number | null;
        isStuck: boolean;
        thresholdSeconds: number | null;
        attemptCount: number;
        redispatchState: "can_suggest" | "suggestion_ready" | "exhausted_max_attempts" | null;
        suggestion: { draftId: string; draftVendorName: string } | null;
      }
    | {
        kind: "nte_increase_requested";
        changeOrderId: string;
        total: string;
        reason: string | null;
        pendingSince: Date;
      }
    | {
        kind: "operational";
        urgencyTier: UrgencyTier;
        ageInCurrentStatusSeconds: number;
        isOverdue: boolean;
        isStalled: boolean;
        isUnassignedHighPriority: boolean;
      }
    | {
        kind: "follow_up_overdue";
        followUpAt: Date;
        category: FollowUpCategory | null;
      }
  );

// The triage layer — a weighted score (auditable component breakdown) + the recommended-rung hint.
export type TriageFields = {
  triageScore: number; // ageSeconds + stuckBump + priorityBump + urgencyBump + clientPriorityBump
  triageComponents: { ageSeconds: number; stuckBump: number; priorityBump: number; urgencyBump: number; clientPriorityBump: number };
  recommendedAction: RecommendedAction;
};

export type Exception = ExceptionCore & TriageFields;

const RECOMMENDED_ACTION_BY_KIND: Record<ExceptionCore["kind"], RecommendedAction> = {
  vendor_not_accepted: { rung: "chase", label: "Chase vendor", then: "redispatch" },
  nte_increase_requested: { rung: "nte_review", label: "Review NTE" },
  operational: { rung: "assign_expedite", label: "Assign / expedite" },
  follow_up_overdue: { rung: "follow_up", label: "Follow up" },
};

/**
 * The tenant-wide exception queue — composes the two net-new readers with a FILTERED
 * operationalQueue, into one list sorted by sortKey (elapsed seconds) DESC. Pure 'aged'
 * operational rows are EXCLUDED (only overdue/stalled/unassigned-high-priority qualify).
 */
export async function getExceptions(tenantId: string): Promise<Exception[]> {
  const [notAccepted, nteRequested, queue, followUps, switchRow] = await Promise.all([
    listVendorNotAccepted(tenantId),
    listNteIncreaseRequested(tenantId),
    operationalQueue(tenantId, Number.MAX_SAFE_INTEGER),
    listFollowUpOverdue(tenantId),
    // The per-tenant client-priority switch — ONE lookup (single-row on the PK). OFF by default; a
    // missing row (defensive) also reads OFF, so the client-priority bump stays 0 → byte-identical ranking.
    db.select({ on: tenants.priorityClientWeightingEnabled }).from(tenants).where(eq(tenants.id, tenantId)).limit(1),
  ]);
  const weightingEnabled = switchRow[0]?.on === true;

  const nowMs = Date.now();
  const raws: ExceptionCore[] = [];

  for (const r of notAccepted) {
    raws.push({
      kind: "vendor_not_accepted",
      jobId: r.jobId,
      jobNumber: r.jobNumber,
      clientName: r.clientName,
      isPriority: r.isPriority,
      assignmentId: r.assignmentId,
      vendorName: r.vendorName,
      sentAt: r.sentAt,
      ageSeconds: r.ageSeconds,
      priorityCode: r.priorityCode,
      priorityRank: r.priorityRank,
      isStuck: r.isStuck,
      thresholdSeconds: r.thresholdSeconds,
      attemptCount: r.attemptCount,
      redispatchState: r.redispatchState,
      suggestion: r.suggestion,
      // Stuck rows bubble to the top band; true age still orders within each band.
      sortKey: r.ageSeconds + (r.isStuck ? STUCK_SORT_BUMP_SECONDS : 0),
    });
  }

  for (const r of nteRequested) {
    const ageSeconds = Math.max(0, Math.floor((nowMs - new Date(r.pendingSince).getTime()) / 1000));
    raws.push({
      kind: "nte_increase_requested",
      jobId: r.jobId,
      jobNumber: r.jobNumber,
      clientName: r.clientName,
      isPriority: r.isPriority,
      changeOrderId: r.changeOrderId,
      total: r.total,
      reason: r.reason,
      pendingSince: r.pendingSince,
      sortKey: ageSeconds,
    });
  }

  // FILTER: only genuine exceptions — exclude pure 'aged' (informational, not blocking).
  for (const q of queue) {
    if (!(q.isOverdue || q.isStalled || q.isUnassignedHighPriority)) continue;
    raws.push({
      kind: "operational",
      jobId: q.jobId,
      jobNumber: q.jobNumber,
      clientName: q.clientName,
      isPriority: q.isPriority,
      urgencyTier: q.urgencyTier,
      ageInCurrentStatusSeconds: q.ageInCurrentStatusSeconds,
      isOverdue: q.isOverdue,
      isStalled: q.isStalled,
      isUnassignedHighPriority: q.isUnassignedHighPriority,
      sortKey: q.ageInCurrentStatusSeconds,
    });
  }

  for (const r of followUps) {
    raws.push({
      kind: "follow_up_overdue",
      jobId: r.jobId,
      jobNumber: r.jobNumber,
      clientName: r.clientName,
      isPriority: r.isPriority,
      followUpAt: r.followUpAt,
      category: r.category,
      sortKey: r.ageSeconds,
    });
  }

  // TRIAGE LAYER — fold the tier bumps into an auditable score, annotate the recommended rung.
  // ageSeconds = the kind's TRUE age (kinds without an age field use sortKey, which == their age).
  // Pure computation — no writes, no side effects.
  const triaged: Exception[] = raws.map((e) => {
    const ageSeconds =
      e.kind === "vendor_not_accepted" ? e.ageSeconds
      : e.kind === "operational" ? e.ageInCurrentStatusSeconds
      : e.sortKey;
    const stuckBump = e.kind === "vendor_not_accepted" && e.isStuck ? STUCK_SORT_BUMP_SECONDS : 0;
    const priorityBump = e.kind === "vendor_not_accepted" ? priorityBumpFromRank(e.priorityRank) : 0;
    const urgencyBump = e.kind === "operational" ? URGENCY_BUMP_SECONDS[e.urgencyTier] : 0;
    // Gated on the tenant switch AND the client flag. weightingEnabled=false → always 0 → the score
    // is byte-identical to pre-batch (age + stuck + priority + urgency). A nudge, never an override.
    const clientPriorityBump = weightingEnabled && e.isPriority ? CLIENT_PRIORITY_BUMP_SECONDS : 0;
    const triageScore = ageSeconds + stuckBump + priorityBump + urgencyBump + clientPriorityBump;
    return {
      ...e,
      triageScore,
      triageComponents: { ageSeconds, stuckBump, priorityBump, urgencyBump, clientPriorityBump },
      recommendedAction: RECOMMENDED_ACTION_BY_KIND[e.kind],
    };
  });

  // Rank by the weighted triage score DESC (was: raw sortKey). sortKey is retained on each row.
  return triaged.sort((a, b) => b.triageScore - a.triageScore);
}
