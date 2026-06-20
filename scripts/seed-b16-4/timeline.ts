/**
 * B-16.4 dev-seed — P3: status-history timeline + presence rows.
 *
 * Consumes the SeedPlan from P2 and, per PlannedAssignment, writes:
 *   - the dispatch status-history transitions (the timeline whose created_at
 *     timestamps ARE the scorer's primary timing signal), and
 *   - presence rows (vendor_eta_confirmations, vendor_check_ins/outs) timed to
 *     the assignment's onTime flag — so on-time-rate computes from real data.
 *
 * Timing model (per assignment, anchored on scheduledStartAt):
 *   declined  : Sent -> Declined          (no presence; never showed)
 *   cancelled : Sent -> Accepted -> Scheduled -> Cancelled  (accepted then fell through; no on-site)
 *   completed : Sent -> Accepted -> Scheduled -> Confirmed -> On Site -> Work Complete
 *               + ETA confirmation, check-in (on/late per onTime), check-out
 *
 * No sandbox guard here — this module is imported by the P4 entrypoint, which
 * carries the guard at its own module top. (P3 never runs standalone.)
 */

// @/server/db is loaded dynamically inside writeTimelines (AFTER the entrypoint's
// sandbox guard mutates env) — a static import would hoist above the guard and
// connect to dev. @/server/schema is connection-safe (no schema file imports db),
// so it stays static — also needed for the $inferInsert row types below.
import {
  jobVendorAssignmentStatusHistory,
  vendorEtaConfirmations,
  vendorCheckIns,
  vendorCheckOuts,
} from "@/server/schema";
import { v7 as uuidv7 } from "uuid";
import { makeRng, rngInt, SEED, ARCHETYPES } from "./config";
import type { SeedPlan, PlannedAssignment } from "./generate";

// status-name → id map (built once from P2's loaded statuses, passed in)
type StatusIds = Record<string, string>;

// Schema-bound insert row types — make tsc validate every insert shape against
// the real columns (no `any`, which would silently accept a wrong column name).
type HistoryRow = typeof jobVendorAssignmentStatusHistory.$inferInsert;
type EtaRow = typeof vendorEtaConfirmations.$inferInsert;
type CheckInRow = typeof vendorCheckIns.$inferInsert;
type CheckOutRow = typeof vendorCheckOuts.$inferInsert;

const MIN = 60_000;

/** push a status-history transition row */
function historyRow(
  tenantId: string, assignmentId: string,
  fromStatusId: string | null, toStatusId: string, at: Date,
): HistoryRow {
  return {
    id: uuidv7(),
    tenantId, assignmentId,
    fromStatusId, toStatusId,
    changedByUserId: null,
    note: null,
    createdAt: at,
  };
}

/**
 * Build all history + presence rows for one assignment, timed off scheduledStartAt.
 * Returns row arrays for batched insert.
 */
function buildAssignmentRows(
  tenantId: string,
  a: PlannedAssignment,
  arch: (typeof ARCHETYPES)[keyof typeof ARCHETYPES],
  statusIds: StatusIds,
  rng: () => number,
) {
  const history: HistoryRow[] = [];
  const etas: EtaRow[] = [];
  const checkIns: CheckInRow[] = [];
  const checkOuts: CheckOutRow[] = [];

  const sched = a.scheduledStartAt.getTime();
  // dispatch happens before the scheduled date (1-10 days prior)
  const sentAt = new Date(sched - rngInt(rng, 1, 10) * 86400_000);

  const S = statusIds;
  history.push(historyRow(tenantId, a.assignmentId, null, S["SENT"], sentAt));

  if (a.outcome === "declined") {
    const declinedAt = new Date(sentAt.getTime() + rngInt(rng, 10, 240) * MIN);
    history.push(historyRow(tenantId, a.assignmentId, S["SENT"], S["DECLINED"], declinedAt));
    return { history, etas, checkIns, checkOuts };
  }

  // accepted path (cancelled + completed both accept first)
  const acceptedAt = new Date(sentAt.getTime() + rngInt(rng, 15, 300) * MIN);
  const scheduledAt = new Date(acceptedAt.getTime() + rngInt(rng, 10, 120) * MIN);
  history.push(historyRow(tenantId, a.assignmentId, S["SENT"], S["ACCEPTED"], acceptedAt));
  history.push(historyRow(tenantId, a.assignmentId, S["ACCEPTED"], S["SCHEDULED"], scheduledAt));

  // ETA confirmation (the planned arrival window) — set near scheduledStartAt
  etas.push({
    id: uuidv7(), tenantId, assignmentId: a.assignmentId,
    etaStartAt: new Date(sched), etaEndAt: new Date(sched + 120 * MIN),
    confirmedByUserId: null, createdAt: scheduledAt,
  });

  if (a.outcome === "cancelled") {
    const cancelledAt = new Date(scheduledAt.getTime() + rngInt(rng, 60, 600) * MIN);
    history.push(historyRow(tenantId, a.assignmentId, S["SCHEDULED"], S["CANCELLED"], cancelledAt));
    return { history, etas, checkIns, checkOuts };
  }

  // completed path: Confirmed -> On Site -> Work Complete, with presence
  const confirmedAt = new Date(scheduledAt.getTime() + rngInt(rng, 30, 240) * MIN);
  history.push(historyRow(tenantId, a.assignmentId, S["SCHEDULED"], S["CONFIRMED"], confirmedAt));

  // arrival: on-time => at/before sched (early by up to earlyMinsMax);
  //          late    => after sched (by up to latenessMinsMax)
  const arrivalOffsetMin = a.onTime
    ? -rngInt(rng, 0, arch.earlyMinsMax)
    : rngInt(rng, 1, arch.latenessMinsMax);
  const onSiteAt = new Date(sched + arrivalOffsetMin * MIN);
  history.push(historyRow(tenantId, a.assignmentId, S["CONFIRMED"], S["ON_SITE"], onSiteAt));

  // check-in at arrival; check-out 1-6h later
  checkIns.push({
    id: uuidv7(), tenantId, assignmentId: a.assignmentId,
    occurredAt: onSiteAt, recordedByUserId: null, createdAt: onSiteAt,
  });
  const workMins = rngInt(rng, 60, 360);
  const checkOutAt = new Date(onSiteAt.getTime() + workMins * MIN);
  checkOuts.push({
    id: uuidv7(), tenantId, assignmentId: a.assignmentId,
    occurredAt: checkOutAt, recordedByUserId: null, createdAt: checkOutAt,
  });

  const completeAt = new Date(checkOutAt.getTime() + rngInt(rng, 5, 60) * MIN);
  history.push(historyRow(tenantId, a.assignmentId, S["ON_SITE"], S["WORK_COMPLETE"], completeAt));

  return { history, etas, checkIns, checkOuts };
}

/**
 * Write all timeline + presence rows for the whole plan, batched per type.
 * statusIds is the name->id map P2 loaded (passed through the entrypoint).
 */
export async function writeTimelines(plan: SeedPlan, statusIds: StatusIds): Promise<{
  historyCount: number; etaCount: number; checkInCount: number; checkOutCount: number;
}> {
  const { db } = await import("@/server/db"); // dynamic — after the guard
  const rng = makeRng(SEED ^ 0x717); // distinct stream from P2's structural rng

  const allHistory: HistoryRow[] = [];
  const allEtas: EtaRow[] = [];
  const allCheckIns: CheckInRow[] = [];
  const allCheckOuts: CheckOutRow[] = [];

  for (const v of plan.vendors) {
    const arch = ARCHETYPES[v.archetype];
    for (const a of v.assignments) {
      const { history, etas, checkIns, checkOuts } =
        buildAssignmentRows(plan.tenantId, a, arch, statusIds, rng);
      allHistory.push(...history);
      allEtas.push(...etas);
      allCheckIns.push(...checkIns);
      allCheckOuts.push(...checkOuts);
    }
  }

  // batched inserts (chunk to avoid oversized statements)
  const chunk = <T,>(arr: T[], n = 200) =>
    Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  for (const c of chunk(allHistory)) if (c.length) await db.insert(jobVendorAssignmentStatusHistory).values(c);
  for (const c of chunk(allEtas)) if (c.length) await db.insert(vendorEtaConfirmations).values(c);
  for (const c of chunk(allCheckIns)) if (c.length) await db.insert(vendorCheckIns).values(c);
  for (const c of chunk(allCheckOuts)) if (c.length) await db.insert(vendorCheckOuts).values(c);

  return {
    historyCount: allHistory.length,
    etaCount: allEtas.length,
    checkInCount: allCheckIns.length,
    checkOutCount: allCheckOuts.length,
  };
}
