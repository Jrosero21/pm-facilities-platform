import "server-only";

import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import {
  snowPrograms,
  snowSites,
  snowEvents,
  snowEventSites,
  snowDispatches,
} from "@/server/schema";
import { getSystemUserId } from "@/server/integrations/system-user";
import { writeAuditLog } from "@/server/audit";
import {
  dispatchSnowEventSites,
  type DispatchSnowEventSitesResult,
} from "./dispatch-sites";

// ── Phase 15 batch 15d — SNOW EVENT-FIRE ENGINE · DECLARE (the trigger) ────────────────
// declareSnowEvent is the Snow trigger — but unlike PM there is NO scan and NO recurrence: a
// declaration IS the trigger (manual fire, F15-D). MATERIALIZE-AT-DECLARE (decision A): the
// program's LIVE active snow_sites are SNAPSHOT into snow_event_sites + a 'staged' snow_dispatches
// row per site AT declaration; the event is frozen at that moment.
//
// The §2.5 gate is the auto_dispatch branch (F15-A, default false=STAGE), the run-due-schedules
// `auto_generate ? 'auto' : 'review'` analog: auto_dispatch=true runs the shared workhorse now;
// false leaves the staged rows for confirmSnowDispatches.
//
// NO txn for the header + membership snapshot — mirrors generate-visits.ts (live PM truth: the
// run row + visit rows are individual db.insert calls, no wrapping txn).

export type DeclareSnowEventResult = {
  eventId: string;
  siteCount: number;
  autoDispatched: boolean;
  status: "staged" | "complete";
  spawnedCount?: number;
  skippedCount?: number;
};

export async function declareSnowEvent(input: {
  tenantId: string;
  snowProgramId: string;
  name: string;
  weatherObservationId?: string | null;
  declaredByUserId?: string | null;
}): Promise<DeclareSnowEventResult> {
  const { tenantId, snowProgramId, name } = input;

  // 1. Validate the program: exists + in tenant + active.
  const program = (
    await db
      .select()
      .from(snowPrograms)
      .where(
        and(eq(snowPrograms.id, snowProgramId), eq(snowPrograms.tenantId, tenantId)),
      )
      .limit(1)
  )[0];
  if (!program) throw new Error("SNOW_PROGRAM_NOT_FOUND");
  if (!program.isActive) throw new Error("SNOW_PROGRAM_INACTIVE");

  // 2. Read the program's LIVE active site membership (queried now — the snapshot source).
  const sites = await db
    .select({ id: snowSites.id })
    .from(snowSites)
    .where(
      and(
        eq(snowSites.tenantId, tenantId),
        eq(snowSites.snowProgramId, snowProgramId),
        eq(snowSites.isActive, true),
      ),
    );
  const siteCount = sites.length;

  // 3. Open the batch-run header (snow_events IS the header — F15-G).
  const eventId = uuidv7();
  await db.insert(snowEvents).values({
    id: eventId,
    tenantId,
    snowProgramId,
    name,
    eventStatus: "declared",
    declaredAt: new Date(),
    declaredByUserId: input.declaredByUserId ?? null,
    snowWeatherObservationId: input.weatherObservationId ?? null,
  });

  // 4. Fan out the snapshot: one snow_event_sites row + one 'staged' snow_dispatches row per
  //    live site (materialize-at-declare). No txn — individual writes (mirror generate-visits).
  for (const site of sites) {
    const eventSiteId = uuidv7();
    await db.insert(snowEventSites).values({
      id: eventSiteId,
      tenantId,
      snowEventId: eventId,
      snowSiteId: site.id,
    });
    await db.insert(snowDispatches).values({
      id: uuidv7(),
      tenantId,
      snowEventSiteId: eventSiteId,
      jobId: null,
      dispatchStatus: "staged",
      skipReason: null,
    });
  }

  // 5. Declaration event.
  await writeAuditLog({
    tenantId,
    userId: input.declaredByUserId ?? null,
    action: "snow_event.declared",
    targetType: "snow_event",
    targetId: eventId,
    metadata: { snowProgramId, name, siteCount, autoDispatch: program.autoDispatch },
  });

  // 6. The §2.5 branch (F15-A): auto_dispatch=true → run the SHARED workhorse now; else stage.
  if (program.autoDispatch) {
    const actorUserId = input.declaredByUserId ?? (await getSystemUserId());
    const result: DispatchSnowEventSitesResult = await dispatchSnowEventSites({
      tenantId,
      eventId,
      actorUserId,
    });
    return {
      eventId,
      siteCount,
      autoDispatched: true,
      status: "complete",
      spawnedCount: result.spawnedCount,
      skippedCount: result.skippedCount,
    };
  }

  return { eventId, siteCount, autoDispatched: false, status: "staged" };
}
