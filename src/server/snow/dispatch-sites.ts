import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  snowPrograms,
  snowEvents,
  snowEventSites,
  snowSites,
  snowDispatches,
} from "@/server/schema";
import { createJob } from "@/server/jobs";
import { writeAuditLog } from "@/server/audit";

// ── Phase 15 batch 15d — SNOW EVENT-FIRE ENGINE · THE SHARED INNER WORKHORSE ───────────
// dispatchSnowEventSites is the Snow analog of generateVisitsForSchedule (PM): it fans a
// declared event's STAGED dispatches out into jobs. It is the AUTONOMY SEAM — BOTH the auto
// path (declareSnowEvent when program.auto_dispatch=true) and the manual gate
// (confirmSnowDispatches, the §2.5 human gate) call this SAME code; only the actorUserId
// attribution differs.
//
// RECORD-DON'T-APPLY + PER-ITEM ISOLATION (IF-4): each createJob owns its OWN txn (NOT nested).
// The status flips, the per-dispatch link-back, and the count writes are individual writes —
// the fan-out is DELIBERATELY not one txn, so one bad site (skip-and-flag) cannot roll back the
// rest. Mirrors generate-visits.ts exactly (live PM truth: no outer txn, err.message→skip_reason).
//
// COUNTS: snow_events has NO count columns (unlike pm_generation_runs). Counts land in the
// 'snow_event.dispatched' audit metadata only. (Carry-forward CF-15.1: consider adding
// spawned_count/skipped_count columns to snow_events later if a read surface needs them.)

export type DispatchSnowEventSitesResult = {
  eventId: string;
  spawnedCount: number;
  skippedCount: number;
  alreadyResolved?: boolean;
};

export async function dispatchSnowEventSites(input: {
  tenantId: string;
  eventId: string;
  actorUserId: string;
}): Promise<DispatchSnowEventSitesResult> {
  const { tenantId, eventId, actorUserId } = input;

  // 1. Load the event; guard exists + tenant scope.
  const event = (
    await db
      .select()
      .from(snowEvents)
      .where(and(eq(snowEvents.id, eventId), eq(snowEvents.tenantId, tenantId)))
      .limit(1)
  )[0];
  if (!event) throw new Error("SNOW_EVENT_NOT_FOUND");

  // Idempotent re-fire guard (already-resolved): a completed event does not re-dispatch.
  if (event.eventStatus === "complete") {
    return { eventId, spawnedCount: 0, skippedCount: 0, alreadyResolved: true };
  }
  if (event.eventStatus === "cancelled") throw new Error("SNOW_EVENT_CANCELLED");

  // 2. Resolve the program (the createJob mapping: client/trade/priority/problem come from here).
  const program = (
    await db
      .select()
      .from(snowPrograms)
      .where(eq(snowPrograms.id, event.snowProgramId))
      .limit(1)
  )[0];
  if (!program) throw new Error("SNOW_PROGRAM_NOT_FOUND");

  // 3. Move the header to 'dispatching'.
  await db
    .update(snowEvents)
    .set({ eventStatus: "dispatching" })
    .where(eq(snowEvents.id, eventId));

  // 4. Load this event's STAGED dispatches + resolve each site's client_location_id
  //    (snow_dispatches → snow_event_sites → snow_sites.client_location_id).
  const staged = await db
    .select({
      dispatchId: snowDispatches.id,
      clientLocationId: snowSites.clientLocationId,
    })
    .from(snowDispatches)
    .innerJoin(
      snowEventSites,
      eq(snowDispatches.snowEventSiteId, snowEventSites.id),
    )
    .innerJoin(snowSites, eq(snowEventSites.snowSiteId, snowSites.id))
    .where(
      and(
        eq(snowDispatches.tenantId, tenantId),
        eq(snowEventSites.snowEventId, eventId),
        eq(snowDispatches.dispatchStatus, "staged"),
      ),
    );

  let spawnedCount = 0;
  let skippedCount = 0;

  // 5. Fan out — SEQUENTIAL, per-item isolation (NO outer txn; IF-4). Skip-and-flag: the batch
  //    NEVER aborts on a single failure.
  for (const row of staged) {
    try {
      const job = await createJob({
        tenantId,
        clientId: program.clientId,
        clientLocationId: row.clientLocationId,
        problemDescription: program.defaultProblemDescription,
        primaryTradeId: program.defaultPrimaryTradeId,
        priorityId: program.defaultPriorityId,
        sourceType: "snow_event",
        sourceExternalId: eventId, // the storm batch id (the PM pm:<...> stamp analog)
        createdByUserId: actorUserId,
      });

      // createJob committed its OWN txn. Status-guarded link-back (only flip a still-'staged'
      // row — prevents a double-spawn under a concurrent re-fire).
      await db
        .update(snowDispatches)
        .set({
          jobId: job.id,
          dispatchStatus: "spawned",
          spawnedAt: new Date(),
        })
        .where(
          and(
            eq(snowDispatches.id, row.dispatchId),
            eq(snowDispatches.dispatchStatus, "staged"),
          ),
        );
      spawnedCount += 1;
    } catch (err) {
      // skip-and-flag (mirrors generate-visits.ts:174 live shape): the batch CONTINUES.
      const reason = String(err instanceof Error ? err.message : err).slice(0, 500);
      await db
        .update(snowDispatches)
        .set({ dispatchStatus: "skipped", skipReason: reason })
        .where(eq(snowDispatches.id, row.dispatchId));
      skippedCount += 1;
    }
  }

  // 6. Complete the header. (No count columns on snow_events — counts go to the audit below.)
  await db
    .update(snowEvents)
    .set({ eventStatus: "complete" })
    .where(eq(snowEvents.id, eventId));

  // 7. Dispatch run event (counts live HERE — the only durable record of the batch totals).
  await writeAuditLog({
    tenantId,
    userId: actorUserId,
    action: "snow_event.dispatched",
    targetType: "snow_event",
    targetId: eventId,
    metadata: { spawnedCount, skippedCount, actorUserId },
  });

  return { eventId, spawnedCount, skippedCount };
}
