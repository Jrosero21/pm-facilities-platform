import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { snowEvents } from "@/server/schema";
import {
  dispatchSnowEventSites,
  type DispatchSnowEventSitesResult,
} from "./dispatch-sites";

// ── Phase 15 batch 15d — SNOW EVENT-FIRE ENGINE · CONFIRM (the §2.5 human gate) ────────
// confirmSnowDispatches is the Snow analog of approvePmVisits: the operator-invoked path that
// turns a STAGED event's dispatches into jobs. THE EXISTENCE OF THIS FUNCTION IS THE §2.5 GATE —
// the auto path (declareSnowEvent when auto_dispatch=true) never calls it; the staged path
// (auto_dispatch=false) REQUIRES it.
//
// It is a thin guard + a call to the SAME shared workhorse (dispatchSnowEventSites). The only
// difference from the auto path is attribution (confirmedByUserId = the approving operator) and
// that a human invoked it. The authz check (who may confirm) lives in the deferred action
// wrapper, not here (the CF-13.7 / approve-visits precedent).

export async function confirmSnowDispatches(input: {
  tenantId: string;
  eventId: string;
  confirmedByUserId: string;
}): Promise<DispatchSnowEventSitesResult> {
  const { tenantId, eventId, confirmedByUserId } = input;

  // Guard the event exists + tenant scope, and is in a confirmable state.
  const event = (
    await db
      .select({ eventStatus: snowEvents.eventStatus })
      .from(snowEvents)
      .where(and(eq(snowEvents.id, eventId), eq(snowEvents.tenantId, tenantId)))
      .limit(1)
  )[0];
  if (!event) throw new Error("SNOW_EVENT_NOT_FOUND");

  // Re-confirm guard (already-resolved): a completed event is a no-op, reported, not re-fired.
  if (event.eventStatus === "complete") {
    return { eventId, spawnedCount: 0, skippedCount: 0, alreadyResolved: true };
  }
  // Concurrent-fire guard: a dispatch is already in flight.
  if (event.eventStatus === "dispatching") {
    throw new Error("SNOW_EVENT_DISPATCH_IN_PROGRESS");
  }
  if (event.eventStatus === "cancelled") throw new Error("SNOW_EVENT_CANCELLED");

  // status === 'declared' (staged) → run the SAME workhorse, operator-attributed.
  return dispatchSnowEventSites({ tenantId, eventId, actorUserId: confirmedByUserId });
}
