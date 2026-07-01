/**
 * scripts/check-snow-dispatch.ts — Phase 15 SNOW DISPATCH harness.
 *
 * Empirically proves the snow event-fire engine: declare + materialize-at-declare (1 program → N
 * sites → N staged dispatches), the stage gate (confirm spawns a job per site), the auto-dispatch
 * path (declare spawns in one call), skip-and-flag isolation (poison site), the status-guarded
 * idempotent re-fire, cross-tenant isolation, and the empty fire. SANDBOX ONLY (module-top env
 * swap + hard-exit if not _sandbox). Self-seeds its program/sites on the live Acme client + tears
 * everything it created down in a finally. Mirrors scripts/check-pm-generation.ts.
 * Run: pnpm run db:check:snow-dispatch
 */

// Module marker (WP-13.2): file-scope top-level names — `export {}` makes this a MODULE so
// whole-project tsc doesn't collide them. Runtime unaffected (tsx runs top-level statements as-is).
export {};

// -------- Sandbox guard + env swap (BEFORE any DB-touching import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-snow] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-snow] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-snow] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

// -------- Tiny assertion framework --------
let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed.push(label);
    console.error(`  ✗ ${label}`);
  }
}

const T_B_SLUG = "phase15-harness-tenant-b";
const SEED_TENANT_SLUG = "phase9-seed-tenant";
const HARNESS_PROGRAM_PREFIX = "[snow-harness]";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, priorities, jobStatuses, trades, jobs, users,
    jobStatusHistory, jobEvents, auditLogs,
    snowPrograms, snowSites, snowEvents, snowEventSites, snowDispatches,
  } = await import("@/server/schema");
  const { and, eq, inArray, like, sql } = await import("drizzle-orm");
  const { getSystemUserId } = await import("@/server/integrations/system-user");
  const { declareSnowEvent } = await import("@/server/snow/declare-event");
  const { dispatchSnowEventSites } = await import("@/server/snow/dispatch-sites");
  const { confirmSnowDispatches } = await import("@/server/snow/confirm-dispatches");

  // Track harness-created rows.
  const createdProgramIds: string[] = [];
  const createdJobIds: string[] = [];
  const createdClientIds: string[] = []; // harness-seeded T-A clients (the poison client)
  const createdLocationIds: string[] = []; // harness-seeded locations (the poison location)
  let tBId: string | null = null;

  // Collect job ids spawned for an event (for teardown) and return them.
  async function collectEventJobIds(eventId: string): Promise<string[]> {
    const rows = await db
      .select({ jobId: snowDispatches.jobId })
      .from(snowDispatches)
      .innerJoin(snowEventSites, eq(snowDispatches.snowEventSiteId, snowEventSites.id))
      .where(eq(snowEventSites.snowEventId, eventId));
    const ids = rows.map((r) => r.jobId).filter((x): x is string => !!x);
    for (const id of ids) if (!createdJobIds.includes(id)) createdJobIds.push(id);
    return ids;
  }

  async function teardown() {
    try {
      await db.transaction(async (tx) => {
        // Snow rows hang off the programs the harness created
        // (events→program, event_sites→event, dispatches→event_site, sites→program).
        if (createdProgramIds.length) {
          const eventRows = await tx
            .select({ id: snowEvents.id })
            .from(snowEvents)
            .where(inArray(snowEvents.snowProgramId, createdProgramIds));
          const eventIds = eventRows.map((r) => r.id);
          if (eventIds.length) {
            const esRows = await tx
              .select({ id: snowEventSites.id })
              .from(snowEventSites)
              .where(inArray(snowEventSites.snowEventId, eventIds));
            const esIds = esRows.map((r) => r.id);
            if (esIds.length) {
              await tx.delete(snowDispatches).where(inArray(snowDispatches.snowEventSiteId, esIds));
              await tx.delete(snowEventSites).where(inArray(snowEventSites.id, esIds));
            }
            await tx.delete(snowEvents).where(inArray(snowEvents.id, eventIds));
          }
          await tx.delete(snowSites).where(inArray(snowSites.snowProgramId, createdProgramIds));
          await tx.delete(snowPrograms).where(inArray(snowPrograms.id, createdProgramIds));
        }
        // Spawned jobs + their children (mirror createJob's writes: status_history, events, audit).
        if (createdJobIds.length) {
          await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, createdJobIds));
          await tx.delete(jobEvents).where(inArray(jobEvents.jobId, createdJobIds));
          await tx.delete(auditLogs).where(
            and(eq(auditLogs.targetType, "job"), inArray(auditLogs.targetId, createdJobIds)),
          );
          await tx.delete(jobs).where(inArray(jobs.id, createdJobIds));
        }
        // Harness-seeded locations (the poison location).
        if (createdLocationIds.length) {
          await tx.delete(clientLocations).where(inArray(clientLocations.id, createdLocationIds));
        }
        // Harness-seeded T-A clients (the poison client) — locations first.
        if (createdClientIds.length) {
          await tx.delete(clientLocations).where(inArray(clientLocations.clientId, createdClientIds));
          await tx.delete(clients).where(inArray(clients.id, createdClientIds));
        }
        // Snow audit events (snow_event.* actions) the harness produced.
        await tx.delete(auditLogs).where(like(auditLogs.action, "snow_event.%"));
        if (tBId) {
          // T-B is fully harness-owned.
          await tx.delete(jobs).where(eq(jobs.tenantId, tBId));
          await tx.delete(clientLocations).where(eq(clientLocations.tenantId, tBId));
          await tx.delete(clients).where(eq(clients.tenantId, tBId));
          await tx.delete(priorities).where(eq(priorities.tenantId, tBId));
          await tx.delete(tenants).where(eq(tenants.id, tBId));
        }
      });
    } catch (e) {
      console.error("[check-snow] teardown warning:", e);
    }
  }

  // Defensive pre-clean: drop leftovers from a prior aborted run.
  {
    const priorPrograms = await db
      .select({ id: snowPrograms.id })
      .from(snowPrograms)
      .where(like(snowPrograms.name, `${HARNESS_PROGRAM_PREFIX}%`));
    if (priorPrograms.length) createdProgramIds.push(...priorPrograms.map((r) => r.id));
    const priorPoison = await db
      .select({ id: clients.id })
      .from(clients)
      .where(like(clients.name, `${HARNESS_PROGRAM_PREFIX}%`));
    if (priorPoison.length) createdClientIds.push(...priorPoison.map((r) => r.id));
    const priorTB = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, T_B_SLUG)).limit(1);
    if (priorTB[0]) tBId = priorTB[0].id;
    if (createdProgramIds.length || createdClientIds.length || tBId) {
      await teardown();
      createdProgramIds.length = 0;
      createdClientIds.length = 0;
      tBId = null;
    }
  }

  // Helper: seed a snow program + its site enrollment over a given location set.
  async function seedSnowProgram(opts: {
    tenantId: string;
    clientId: string;
    tradeId: string;
    priorityId: string;
    locationIds: string[];
    autoDispatch: boolean;
    label: string;
  }): Promise<string> {
    const programId = uuidv7();
    await db.insert(snowPrograms).values({
      id: programId,
      tenantId: opts.tenantId,
      clientId: opts.clientId,
      name: `${HARNESS_PROGRAM_PREFIX} ${opts.label}`,
      defaultProblemDescription: "Snow plowing + salting (storm response)",
      defaultPrimaryTradeId: opts.tradeId,
      defaultPriorityId: opts.priorityId,
      autoDispatch: opts.autoDispatch,
    });
    createdProgramIds.push(programId);
    let plow = 1;
    for (const locId of opts.locationIds) {
      await db.insert(snowSites).values({
        id: uuidv7(),
        tenantId: opts.tenantId,
        snowProgramId: programId,
        clientLocationId: locId,
        plowPriority: plow++,
      });
    }
    return programId;
  }

  try {
    console.log("\n[setup] resolve T-A (seeded Acme) + system user + build T-B + poison");
    const systemUserId = await getSystemUserId();

    const [tA] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SEED_TENANT_SLUG));
    check("setup: seeded tenant (T-A) exists", !!tA);
    if (!tA) return finish();
    const tAId = tA.id;

    const [acme] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.tenantId, tAId), eq(clients.name, "Acme Corp")));
    if (!acme) { check("setup: T-A Acme client", false); return finish(); }
    const [scheduledPrio] = await db.select({ id: priorities.id }).from(priorities).where(and(eq(priorities.tenantId, tAId), eq(priorities.code, "SCHEDULED")));
    const [newStatus] = await db.select({ id: jobStatuses.id }).from(jobStatuses).where(eq(jobStatuses.code, "NEW"));
    const [hvac] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HVAC"));
    if (!scheduledPrio || !newStatus || !hvac) { check("setup: SCHEDULED priority + global NEW/HVAC", false); return finish(); }

    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    if (!operator) { check("setup: seeded operator user", false); return finish(); }
    const operatorId = operator.id;

    // Acme's LIVE active locations (query, don't assume — handoff: 4).
    const acmeLocs = await db
      .select({ id: clientLocations.id })
      .from(clientLocations)
      .where(and(eq(clientLocations.tenantId, tAId), eq(clientLocations.clientId, acme.id)));
    check("setup: Acme has >=3 live locations (fan-out exercisable)", acmeLocs.length >= 3);
    if (acmeLocs.length < 3) return finish();
    const acmeLocIds = acmeLocs.map((r) => r.id);

    // T-B: a separate tenant + its own program (for the cross-tenant test).
    tBId = uuidv7();
    await db.insert(tenants).values({ id: tBId, name: "Phase15 Harness Tenant B", slug: T_B_SLUG, type: "aggregator", status: "active" });
    const tbClientId = uuidv7();
    await db.insert(clients).values({ id: tbClientId, tenantId: tBId, name: "Harness Client B" });

    // T-A POISON: a same-tenant DIFFERENT-client location (→ LOCATION_CLIENT_MISMATCH from createJob,
    // since the program's default client is Acme). A T-B location under T-A would throw
    // LOCATION_NOT_FOUND (mismatch never reached); the poison must be T-A under a different client.
    const poisonClientId = uuidv7();
    await db.insert(clients).values({ id: poisonClientId, tenantId: tAId, name: `${HARNESS_PROGRAM_PREFIX} Poison Client` });
    createdClientIds.push(poisonClientId);
    const poisonLocId = uuidv7();
    await db.insert(clientLocations).values({ id: poisonLocId, tenantId: tAId, clientId: poisonClientId, name: "Poison Store", addressLine1: "9 Poison Rd", city: "Ptown", stateProvince: "NY", postalCode: "10002" });
    createdLocationIds.push(poisonLocId);

    // ════════ A. DECLARE + MATERIALIZE-AT-DECLARE (staged program) ════════
    console.log("\n[A] declare + materialize-at-declare");
    const progA = await seedSnowProgram({
      tenantId: tAId, clientId: acme.id, tradeId: hvac.id, priorityId: scheduledPrio.id,
      locationIds: acmeLocIds, autoDispatch: false, label: "A stage",
    });
    // Live count the active site membership (do NOT hardcode — mirror PM's live-counted fan-out).
    const siteCountA = (await db.select({ id: snowSites.id }).from(snowSites)
      .where(and(eq(snowSites.snowProgramId, progA), eq(snowSites.isActive, true)))).length;
    const rA = await declareSnowEvent({ tenantId: tAId, snowProgramId: progA, name: "Storm A", declaredByUserId: operatorId });
    check("A1: declare returns staged (auto_dispatch=false), siteCount === live membership",
      rA.autoDispatched === false && rA.status === "staged" && rA.siteCount === siteCountA);
    const [evtA] = await db.select().from(snowEvents).where(eq(snowEvents.id, rA.eventId));
    check("A2: snow_events header created, status 'declared'", evtA?.eventStatus === "declared");
    const esA = await db.select({ id: snowEventSites.id }).from(snowEventSites).where(eq(snowEventSites.snowEventId, rA.eventId));
    check("A3: N snow_event_sites snapshot (=== live membership)", esA.length === siteCountA);
    const dispA = await db.select().from(snowDispatches)
      .innerJoin(snowEventSites, eq(snowDispatches.snowEventSiteId, snowEventSites.id))
      .where(eq(snowEventSites.snowEventId, rA.eventId));
    check("A4: N 'staged' snow_dispatches, all job_id null",
      dispA.length === siteCountA && dispA.every((d) => d.snow_dispatches.dispatchStatus === "staged" && d.snow_dispatches.jobId === null));

    // ════════ B. STAGE GATE (confirm spawns) ════════
    console.log("\n[B] stage gate — confirmSnowDispatches");
    const jobsForAbefore = (await db.select({ id: jobs.id }).from(jobs)
      .where(and(eq(jobs.sourceType, "snow_event"), eq(jobs.sourceExternalId, rA.eventId)))).length;
    check("B1: BEFORE confirm — 0 jobs spawned for the event (still staged)", jobsForAbefore === 0);
    const cB = await confirmSnowDispatches({ tenantId: tAId, eventId: rA.eventId, confirmedByUserId: operatorId });
    await collectEventJobIds(rA.eventId);
    check("B2: confirm → spawnedCount === N, skippedCount === 0", cB.spawnedCount === siteCountA && cB.skippedCount === 0);
    const dispAafter = await db.select().from(snowDispatches)
      .innerJoin(snowEventSites, eq(snowDispatches.snowEventSiteId, snowEventSites.id))
      .where(eq(snowEventSites.snowEventId, rA.eventId));
    const [evtAafter] = await db.select().from(snowEvents).where(eq(snowEvents.id, rA.eventId));
    check("B3: all dispatches 'spawned' + job_id + spawned_at set; event 'complete'",
      dispAafter.length === siteCountA
      && dispAafter.every((d) => d.snow_dispatches.dispatchStatus === "spawned" && !!d.snow_dispatches.jobId && !!d.snow_dispatches.spawnedAt)
      && evtAafter?.eventStatus === "complete");
    const sampleJobId = dispAafter.find((d) => !!d.snow_dispatches.jobId)!.snow_dispatches.jobId!;
    const [bJob] = await db.select().from(jobs).where(eq(jobs.id, sampleJobId));
    check("B4: spawned job — source_type 'snow_event', source_external_id===eventId, status NEW, operator-attributed",
      bJob?.sourceType === "snow_event" && bJob?.sourceExternalId === rA.eventId
      && bJob?.currentStatusId === newStatus.id && bJob?.createdByUserId === operatorId && bJob?.clientId === acme.id);

    // ════════ C. AUTO-DISPATCH path (declare spawns in one call) ════════
    console.log("\n[C] auto-dispatch path");
    const progC = await seedSnowProgram({
      tenantId: tAId, clientId: acme.id, tradeId: hvac.id, priorityId: scheduledPrio.id,
      locationIds: acmeLocIds, autoDispatch: true, label: "C auto",
    });
    const siteCountC = acmeLocIds.length;
    const rC = await declareSnowEvent({ tenantId: tAId, snowProgramId: progC, name: "Storm C", declaredByUserId: operatorId });
    await collectEventJobIds(rC.eventId);
    check("C1: declare auto_dispatch=true → autoDispatched, status 'complete', spawnedCount === N (one call)",
      rC.autoDispatched === true && rC.status === "complete" && rC.spawnedCount === siteCountC && rC.skippedCount === 0);
    const dispC = await db.select().from(snowDispatches)
      .innerJoin(snowEventSites, eq(snowDispatches.snowEventSiteId, snowEventSites.id))
      .where(eq(snowEventSites.snowEventId, rC.eventId));
    const [evtC] = await db.select().from(snowEvents).where(eq(snowEvents.id, rC.eventId));
    check("C2: all dispatches 'spawned'; event 'complete'",
      dispC.length === siteCountC && dispC.every((d) => d.snow_dispatches.dispatchStatus === "spawned" && !!d.snow_dispatches.jobId) && evtC?.eventStatus === "complete");
    const cJobId = dispC[0].snow_dispatches.jobId!;
    const [cJob] = await db.select().from(jobs).where(eq(jobs.id, cJobId));
    check("C3: auto-path jobs attributed to declaredBy (operator)", cJob?.createdByUserId === operatorId && cJob?.sourceType === "snow_event");

    // ════════ D. SKIP-AND-FLAG ISOLATION (poison site) ════════
    console.log("\n[D] skip-and-flag isolation");
    const progD = await seedSnowProgram({
      tenantId: tAId, clientId: acme.id, tradeId: hvac.id, priorityId: scheduledPrio.id,
      locationIds: [...acmeLocIds, poisonLocId], autoDispatch: true, label: "D skip-and-flag",
    });
    const goodCountD = acmeLocIds.length;
    const rD = await declareSnowEvent({ tenantId: tAId, snowProgramId: progD, name: "Storm D", declaredByUserId: operatorId });
    await collectEventJobIds(rD.eventId);
    check("D1: spawnedCount === good count, skippedCount === 1", rD.spawnedCount === goodCountD && rD.skippedCount === 1);
    const dispD = await db.select({ disp: snowDispatches, siteId: snowSites.clientLocationId }).from(snowDispatches)
      .innerJoin(snowEventSites, eq(snowDispatches.snowEventSiteId, snowEventSites.id))
      .innerJoin(snowSites, eq(snowEventSites.snowSiteId, snowSites.id))
      .where(eq(snowEventSites.snowEventId, rD.eventId));
    const poisonDisp = dispD.find((d) => d.siteId === poisonLocId);
    check("D2: poison dispatch 'skipped', skip_reason has LOCATION_CLIENT_MISMATCH, job_id null",
      poisonDisp?.disp.dispatchStatus === "skipped" && !!poisonDisp?.disp.skipReason?.includes("LOCATION_CLIENT_MISMATCH") && poisonDisp?.disp.jobId === null);
    const goodDispD = dispD.filter((d) => d.siteId !== poisonLocId);
    check("D3: all good dispatches 'spawned' + job_id (batch did NOT abort)",
      goodDispD.length === goodCountD && goodDispD.every((d) => d.disp.dispatchStatus === "spawned" && !!d.disp.jobId));
    const [evtD] = await db.select().from(snowEvents).where(eq(snowEvents.id, rD.eventId));
    check("D4: event reached 'complete' despite the skip", evtD?.eventStatus === "complete");

    // ════════ E. STATUS-GUARDED IDEMPOTENT RE-FIRE ════════
    console.log("\n[E] status-guarded re-fire (idempotent)");
    const jobsForCbeforeRefire = (await db.select({ id: jobs.id }).from(jobs)
      .where(and(eq(jobs.sourceType, "snow_event"), eq(jobs.sourceExternalId, rC.eventId)))).length;
    const reFire = await confirmSnowDispatches({ tenantId: tAId, eventId: rC.eventId, confirmedByUserId: operatorId });
    check("E1: re-fire on 'complete' event → alreadyResolved, spawned 0 / skipped 0",
      reFire.alreadyResolved === true && reFire.spawnedCount === 0 && reFire.skippedCount === 0);
    const jobsForCafterRefire = (await db.select({ id: jobs.id }).from(jobs)
      .where(and(eq(jobs.sourceType, "snow_event"), eq(jobs.sourceExternalId, rC.eventId)))).length;
    check("E2: spawned job count unchanged after re-fire", jobsForCafterRefire === jobsForCbeforeRefire);
    const stagedLeftC = (await db.select({ id: snowDispatches.id }).from(snowDispatches)
      .innerJoin(snowEventSites, eq(snowDispatches.snowEventSiteId, snowEventSites.id))
      .where(and(eq(snowEventSites.snowEventId, rC.eventId), eq(snowDispatches.dispatchStatus, "staged")))).length;
    check("E3: 0 'staged' dispatches remain (the WHERE status='staged' link-back guard holds)", stagedLeftC === 0);

    // ════════ F. CROSS-TENANT ISOLATION ════════
    console.log("\n[F] cross-tenant isolation");
    let crossCode = "";
    try { await declareSnowEvent({ tenantId: tBId, snowProgramId: progA, name: "X", declaredByUserId: operatorId }); }
    catch (e) { crossCode = e instanceof Error ? e.message : String(e); }
    check("F1: declare with wrong tenant → SNOW_PROGRAM_NOT_FOUND", crossCode === "SNOW_PROGRAM_NOT_FOUND");
    const tbEvents = (await db.select({ id: snowEvents.id }).from(snowEvents).where(eq(snowEvents.tenantId, tBId))).length;
    check("F2: nothing spawned cross-tenant (0 snow_events under T-B)", tbEvents === 0);

    // ════════ G. EMPTY-FIRE ════════
    console.log("\n[G] empty fire");
    const progG = await seedSnowProgram({
      tenantId: tAId, clientId: acme.id, tradeId: hvac.id, priorityId: scheduledPrio.id,
      locationIds: [], autoDispatch: true, label: "G empty",
    });
    const rG = await declareSnowEvent({ tenantId: tAId, snowProgramId: progG, name: "Storm G", declaredByUserId: operatorId });
    const esG = (await db.select({ id: snowEventSites.id }).from(snowEventSites).where(eq(snowEventSites.snowEventId, rG.eventId))).length;
    const [evtG] = await db.select().from(snowEvents).where(eq(snowEvents.id, rG.eventId));
    check("G1: 0-site declare → siteCount 0, 0 event_sites, spawned/skipped 0, event 'complete', no throw",
      rG.siteCount === 0 && esG === 0 && rG.spawnedCount === 0 && rG.skippedCount === 0 && evtG?.eventStatus === "complete");

    return finish();
  } finally {
    await teardown();
    console.log("[check-snow] teardown complete (harness programs/events/sites/dispatches/jobs + poison + T-B removed)");
  }
}

function finish() {
  console.log("");
  console.log(`[check-snow] passed: ${passed}`);
  console.log(`[check-snow] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-snow] PHASE-BLOCKING LEDGER RED ✗ — PHASE BLOCKED");
  } else {
    console.log("[check-snow] PHASE-BLOCKING LEDGER GREEN ✓ (declare+materialize / stage-gate / auto-dispatch / skip-and-flag / idempotent re-fire / cross-tenant / empty-fire)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => {
    console.error("[check-snow] FAILED:", e);
    process.exit(1);
  });
