import "server-only";

import Big from "big.js";
import { and, eq, isNull, isNotNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  agentRuns,
  dispatchAssignmentStatuses,
  jobVendorAssignments,
  tenantAutonomySettings,
} from "@/server/schema";
import { getEffectiveNte } from "@/server/billing/change-orders";
import { roundHalfUp } from "@/server/billing/totals";

// ── Phase 23 batch 23e — GUARDRAIL METERING (the §2.4 spend-breaker, token half) ──────
// COMPUTE-ON-READ: no accumulator table. We sum what already happened straight from the
// source rows (agent_runs) at check time. This is the SECOND half of autonomyEnabled —
// the kill-switch + policy halves live in resolveAgentPolicy (policies.ts, 23d); the token
// ceiling is composed at the ENFORCEMENT site (23f), NOT folded into the resolver:
//
//   permitted = resolved.autonomyEnabled && (await withinTokenCeilings(tenantId)).ok
//
// WHY SEPARATE (design choice, surfaced): resolveAgentPolicy is a Phase-7 fn with 2 callers
// that does pure policy resolution (no spend awareness). Folding a token SUM into it adds a
// 5th DB read to every resolve and mixes "what policy applies" with "how much has been
// spent" — two concerns with different cache/scope lifetimes. Keeping the meter a sibling
// guard lets 23f's withinSpendCeilings($) compose the SAME way without re-touching the
// resolver. autonomyEnabled in ResolvedPolicy stays kill-switch+policy; the gates AND here.
//
// DECISIONS LOCKED (23e): per-day = rolling 24h, DB-computed (NOW() - INTERVAL 1 DAY) — no
// tenant timezone exists, and this matches the house "now − duration" analytics style.
// Tokens meter ALL tenant LLM usage regardless of trigger (autonomy-only would be empty
// today — dispatch_router is rule-based and writes no agent_runs row). The committed-$
// meter is deferred to 23f (zero autonomy-committed dollars exist until auto-advance ships).
//
// FAIL TOWARD GATED (§2.1/§2.4): a missing settings row means "no cap set" (ok:true on that
// axis — no-cap ≠ blocked; the kill-switch/policy halves still gate independently). But any
// UNCERTAINTY — a thrown meter query, a DB error — must NEVER raise autonomy: it returns
// NOT ok. Absence of a cap is permissive; failure to evaluate a cap is restrictive.

// COALESCE the nullable token columns (mock/running/failed runs have NULL tokens), then
// COALESCE the SUM itself (an empty row set sums to NULL). mysql2 returns SUM as a string;
// Number() coerces. Reads the tenant_id prefix of ar_tenant_agent_created_idx.
const TOKEN_SUM = sql<string>`COALESCE(SUM(COALESCE(${agentRuns.inputTokens}, 0) + COALESCE(${agentRuns.outputTokens}, 0)), 0)`;

/** Total LLM tokens (input+output) for a tenant over the trailing 24h (rolling window). */
export async function tenantTokensLast24h(tenantId: string): Promise<number> {
  const r = await db
    .select({ total: TOKEN_SUM })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.tenantId, tenantId),
        sql`${agentRuns.createdAt} >= NOW() - INTERVAL '1 day'`,
      ),
    );
  return Number(r[0]?.total ?? 0);
}

/** Total LLM tokens (input+output) for a tenant over all time (per-tenant lifetime ceiling). */
export async function tenantTokensAllTime(tenantId: string): Promise<number> {
  const r = await db
    .select({ total: TOKEN_SUM })
    .from(agentRuns)
    .where(eq(agentRuns.tenantId, tenantId));
  return Number(r[0]?.total ?? 0);
}

export type TokenCeilingResult = {
  withinDay: boolean;
  withinTenant: boolean;
  ok: boolean;
};

/**
 * The token spend-breaker. Reads the tenant's max_llm_tokens_per_day / per_tenant ceilings
 * and compares each NON-NULL ceiling against the matching meter. A NULL ceiling = no cap on
 * that axis (skipped → within). A missing settings row = no caps at all → ok:true.
 *
 * "Within" = used <= cap (at-or-below is within; strictly above is exceeded). ok = every
 * non-null ceiling is within. NEVER throws — any error fails toward gated (ok:false).
 */
export async function withinTokenCeilings(tenantId: string): Promise<TokenCeilingResult> {
  try {
    const row = (
      await db
        .select({
          dayCap: tenantAutonomySettings.maxLlmTokensPerDay,
          tenantCap: tenantAutonomySettings.maxLlmTokensPerTenant,
        })
        .from(tenantAutonomySettings)
        .where(eq(tenantAutonomySettings.tenantId, tenantId))
        .limit(1)
    )[0];

    const dayCap = row?.dayCap ?? null;
    const tenantCap = row?.tenantCap ?? null;

    // No caps configured (missing row OR both NULL) — skip the meters entirely. No cap set
    // is permissive; it does NOT mean autonomy is enabled (the policy/kill-switch halves
    // decide that independently — proven in verify: no-cap tenant still ends up gated).
    let withinDay = true;
    let withinTenant = true;

    if (dayCap !== null) {
      const used = await tenantTokensLast24h(tenantId);
      withinDay = used <= dayCap;
    }
    if (tenantCap !== null) {
      const used = await tenantTokensAllTime(tenantId);
      withinTenant = used <= tenantCap;
    }

    return { withinDay, withinTenant, ok: withinDay && withinTenant };
  } catch {
    // Fail toward gated — uncertainty must never raise autonomy (§2.1/§2.4).
    return { withinDay: false, withinTenant: false, ok: false };
  }
}

// ── Phase 23 batch 23f-1 — DOLLAR METER (the §2.4 spend-breaker, committed-$ half) ────
// Compute-on-read, no accumulator. House money discipline (NOT SQL SUM, never float): pull
// each job's effective NTE as a decimal string, reduce with Big.js, roundHalfUp.
//
// THE AUTONOMY-COMMITTED SET (23f §1 / decisions): an autonomy commit is a SENT assignment
// (sent_at IS NOT NULL — SENT is the commit moment, 23f flag 5) with created_by_user_id IS
// NULL (the joinless autonomy filter — NULL = system actor). 23f-2 carry-fix (cumulative-
// spend breaker, locked): exclude ONLY the WITHDRAWN terminal statuses DECLINED + CANCELLED.
// WORK_COMPLETE COUNTS — a completed autonomous commit is real committed spend; excluding it
// would UNDER-count, the unsafe direction for a breaker. (This replaces the earlier
// is_terminal=false filter, which wrongly dropped WORK_COMPLETE.) Per-day = sent_at within
// the trailing 24h (matching the token meter); per-tenant = all-time.
//
// TWO DIFFERENT NULLS, OPPOSITE SAFE DIRECTIONS (the safety-critical 23f decision):
//   • NULL *cap* (max_committed_* unset) = the tenant set NO limit → SKIP that axis (within).
//     Same as the token meter: an unset cap is permissive.
//   • NULL *committed amount* (getEffectiveNte returns null = the job has no base NTE) =
//     UNMEASURABLE, NOT zero → we cannot prove the commit is under any cap → BLOCK. A null
//     NTE must never silently drop out of the sum; it is surfaced (unmeasurableCount) and,
//     for the candidate, forces ok:false. Absence of a *limit* is permissive; absence of a
//     *measurement* is restrictive.
//
// 23f-1 builds the meter + the read-only check ONLY. Nothing here auto-fires; 23f-2 wires it.

/** Distinct job_ids of a tenant's autonomy-committed (SENT, NULL-creator, non-terminal) set. */
async function autonomyCommittedJobIds(tenantId: string, window: "day" | "all"): Promise<string[]> {
  const rows = await db
    .selectDistinct({ jobId: jobVendorAssignments.jobId })
    .from(jobVendorAssignments)
    .innerJoin(
      dispatchAssignmentStatuses,
      eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id),
    )
    .where(
      and(
        eq(jobVendorAssignments.tenantId, tenantId),
        isNull(jobVendorAssignments.createdByUserId), // autonomy (system actor)
        isNotNull(jobVendorAssignments.sentAt), // SENT — the commit moment
        notInArray(dispatchAssignmentStatuses.code, ["DECLINED", "CANCELLED", "GHOSTED"]), // exclude terminal-failed (incl. GHOSTED); WORK_COMPLETE counts
        window === "day"
          ? sql`${jobVendorAssignments.sentAt} >= NOW() - INTERVAL '1 day'`
          : undefined,
      ),
    );
  return rows.map((r) => r.jobId);
}

export type CommittedMeter = {
  committed: string; // Big-string sum of MEASURABLE jobs' effective NTE (incl. approved COs)
  unmeasurableCount: number; // jobs in the set whose effective NTE is null (no base NTE)
};

/** Sum effective NTE across a job set; null-NTE jobs are counted as unmeasurable, never zero. */
async function sumCommitted(tenantId: string, jobIds: string[]): Promise<CommittedMeter> {
  let sum = new Big(0);
  let unmeasurableCount = 0;
  for (const jobId of jobIds) {
    const nte = await getEffectiveNte(tenantId, jobId); // tenant-scoped, pure read, incl. COs
    if (nte === null) unmeasurableCount += 1;
    else sum = sum.plus(nte);
  }
  return { committed: roundHalfUp(sum), unmeasurableCount };
}

/** Autonomy committed $ over the trailing 24h (measurable sum + unmeasurable count). */
export async function tenantCommittedLast24h(tenantId: string): Promise<CommittedMeter> {
  return sumCommitted(tenantId, await autonomyCommittedJobIds(tenantId, "day"));
}

/** Autonomy committed $ over all time (per-tenant lifetime ceiling). */
export async function tenantCommittedAllTime(tenantId: string): Promise<CommittedMeter> {
  return sumCommitted(tenantId, await autonomyCommittedJobIds(tenantId, "all"));
}

export type SpendCeilingResult = {
  withinJob: boolean;
  withinDay: boolean;
  withinTenant: boolean;
  candidateUnmeasurable: boolean;
  ok: boolean;
};

/**
 * The dollar spend-breaker for ONE candidate auto-dispatch. Compares the candidate's own
 * effective NTE against max_committed_per_job, and (existing committed + candidate) against
 * the per-day / per-tenant caps. "Within" = projected < cap (>= BLOCKS, matching the token
 * boundary). NULL cap → skip that axis (unset limit = permissive).
 *
 * candidateUnmeasurable = the candidate job has no effective NTE (null) → we cannot bound the
 * commit → ok:false REGARDLESS of caps (block-the-auto-send, the locked 23f null-NTE decision).
 *
 * NEVER throws — any error fails toward gated (ok:false).
 */
export async function withinSpendCeilings(
  tenantId: string,
  candidateJobId: string,
): Promise<SpendCeilingResult> {
  try {
    const row = (
      await db
        .select({
          jobCap: tenantAutonomySettings.maxCommittedPerJob,
          dayCap: tenantAutonomySettings.maxCommittedPerDay,
          tenantCap: tenantAutonomySettings.maxCommittedPerTenant,
        })
        .from(tenantAutonomySettings)
        .where(eq(tenantAutonomySettings.tenantId, tenantId))
        .limit(1)
    )[0];

    const jobCap = row?.jobCap ?? null;
    const dayCap = row?.dayCap ?? null;
    const tenantCap = row?.tenantCap ?? null;

    // The candidate's own committed dollar (effective NTE = base + approved COs).
    const candidateNte = await getEffectiveNte(tenantId, candidateJobId);
    const candidateUnmeasurable = candidateNte === null;
    // For the day/tenant projection an unmeasurable candidate contributes 0 — but it's
    // already forcing ok:false below, so it never silently passes a cap.
    const candidateAmt = candidateNte ?? "0";

    // PER-JOB: null candidate → not within (unmeasurable). Non-null → effectiveNte < cap.
    // NULL cap → skip (unset limit, within).
    let withinJob = true;
    if (candidateUnmeasurable) {
      withinJob = false;
    } else if (jobCap !== null) {
      withinJob = new Big(candidateNte as string).lt(jobCap);
    }

    // PER-DAY: (existing committed last-24h + candidate) < cap. NULL cap → skip.
    let withinDay = true;
    if (dayCap !== null) {
      const { committed } = await tenantCommittedLast24h(tenantId);
      withinDay = new Big(committed).plus(candidateAmt).lt(dayCap);
    }

    // PER-TENANT: (existing committed all-time + candidate) < cap. NULL cap → skip.
    let withinTenant = true;
    if (tenantCap !== null) {
      const { committed } = await tenantCommittedAllTime(tenantId);
      withinTenant = new Big(committed).plus(candidateAmt).lt(tenantCap);
    }

    const ok = withinJob && withinDay && withinTenant && !candidateUnmeasurable;
    return { withinJob, withinDay, withinTenant, candidateUnmeasurable, ok };
  } catch {
    // Fail toward gated — uncertainty (incl. a thrown meter) blocks the auto-send.
    return {
      withinJob: false,
      withinDay: false,
      withinTenant: false,
      candidateUnmeasurable: true,
      ok: false,
    };
  }
}
