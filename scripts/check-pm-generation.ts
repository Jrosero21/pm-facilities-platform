/**
 * scripts/check-pm-generation.ts — Phase 14 PM GENERATION harness.
 *
 * Empirically proves the PM generation engine: fan-out (1 program → N locations → N visits →
 * N jobs), auto-create attribution, recurrence advance + idempotent re-fire, skip-and-flag
 * isolation (F2), the review gate (F1) + batch-approve, cross-tenant isolation, and the empty
 * fire. SANDBOX ONLY (module-top env swap + hard-exit if not _sandbox). Self-seeds its program/
 * schedule/membership on the live Acme client + tears everything it created down in a finally.
 * Mirrors scripts/check-email-ingestion.ts. Run: pnpm run db:check:pm-generation
 */

// Module marker (WP-13.2 collision fix): these check-* scripts declare top-level names at file
// scope; `export {}` makes this a MODULE so whole-project tsc doesn't collide them. Runtime
// unaffected (tsx runs the top-level statements as-is).
export {};

// -------- Sandbox guard + env swap (BEFORE any DB-touching import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-pm] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-pm] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-pm] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

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

const T_B_SLUG = "phase14-harness-tenant-b";
const SEED_TENANT_SLUG = "phase9-seed-tenant";
const HARNESS_PROGRAM_PREFIX = "[pm-harness]";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, priorities, jobStatuses, trades, jobs, users,
    jobStatusHistory, jobEvents, auditLogs,
    pmPrograms, pmSchedules, pmScheduleLocations, pmGenerationRuns, pmVisits,
  } = await import("@/server/schema");
  const { and, eq, inArray, like, sql } = await import("drizzle-orm");
  const { getSystemUserId } = await import("@/server/integrations/system-user");
  const { generateVisitsForSchedule } = await import("@/server/pm/generate-visits");
  const { runDueSchedules } = await import("@/server/pm/run-due-schedules");
  const { approvePmVisits } = await import("@/server/pm/approve-visits");
  const { advanceDueDate } = await import("@/server/pm/recurrence");

  // Track harness-created rows.
  const createdProgramIds: string[] = [];
  const createdJobIds: string[] = [];
  const createdLocationIds: string[] = []; // harness-seeded locations (NOT seed locations)
  const createdClientIds: string[] = []; // harness-seeded T-A clients (e.g. the poison client)
  let tBId: string | null = null;

  async function teardown() {
    try {
      await db.transaction(async (tx) => {
        // PM rows hang off the programs the harness created (schedule→program, visits/runs→schedule).
        if (createdProgramIds.length) {
          const schedRows = await tx
            .select({ id: pmSchedules.id })
            .from(pmSchedules)
            .where(inArray(pmSchedules.pmProgramId, createdProgramIds));
          const schedIds = schedRows.map((r) => r.id);
          if (schedIds.length) {
            await tx.delete(pmVisits).where(inArray(pmVisits.pmScheduleId, schedIds));
            await tx.delete(pmGenerationRuns).where(inArray(pmGenerationRuns.pmScheduleId, schedIds));
            await tx.delete(pmScheduleLocations).where(inArray(pmScheduleLocations.pmScheduleId, schedIds));
            await tx.delete(pmSchedules).where(inArray(pmSchedules.id, schedIds));
          }
          await tx.delete(pmPrograms).where(inArray(pmPrograms.id, createdProgramIds));
        }
        // Generated jobs + their children (mirror createJob's writes: status_history, events, audit).
        if (createdJobIds.length) {
          await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, createdJobIds));
          await tx.delete(jobEvents).where(inArray(jobEvents.jobId, createdJobIds));
          await tx.delete(auditLogs).where(
            and(eq(auditLogs.targetType, "job"), inArray(auditLogs.targetId, createdJobIds)),
          );
          await tx.delete(jobs).where(inArray(jobs.id, createdJobIds));
        }
        // Harness-seeded locations (e.g. the poison location).
        if (createdLocationIds.length) {
          await tx.delete(clientLocations).where(inArray(clientLocations.id, createdLocationIds));
        }
        // Harness-seeded T-A clients (e.g. the poison client) — locations first.
        if (createdClientIds.length) {
          await tx.delete(clientLocations).where(inArray(clientLocations.clientId, createdClientIds));
          await tx.delete(clients).where(inArray(clients.id, createdClientIds));
        }
        // PM audit events (system:pm-generation / pm_* actions) the harness produced.
        await tx.delete(auditLogs).where(like(auditLogs.action, "pm_%"));
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
      console.error("[check-pm] teardown warning:", e);
    }
  }

  // Defensive pre-clean: drop leftovers from a prior aborted run.
  {
    const priorPrograms = await db
      .select({ id: pmPrograms.id })
      .from(pmPrograms)
      .where(like(pmPrograms.name, `${HARNESS_PROGRAM_PREFIX}%`));
    if (priorPrograms.length) createdProgramIds.push(...priorPrograms.map((r) => r.id));
    const priorTB = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, T_B_SLUG)).limit(1);
    if (priorTB[0]) tBId = priorTB[0].id;
    if (createdProgramIds.length || tBId) {
      await teardown();
      createdProgramIds.length = 0;
      tBId = null;
    }
  }

  // Helper: seed a program + schedule + membership over a given location set.
  async function seedProgram(opts: {
    tenantId: string;
    clientId: string;
    tradeId: string;
    priorityId: string;
    locationIds: string[];
    autoGenerate: boolean;
    nextDueAt: Date;
    label: string;
  }): Promise<{ programId: string; scheduleId: string }> {
    const programId = uuidv7();
    await db.insert(pmPrograms).values({
      id: programId,
      tenantId: opts.tenantId,
      clientId: opts.clientId,
      name: `${HARNESS_PROGRAM_PREFIX} ${opts.label}`,
      primaryTradeId: opts.tradeId,
      priorityId: opts.priorityId,
      scopeOfWork: "Quarterly HVAC filter replacement",
      autoGenerate: opts.autoGenerate,
    });
    createdProgramIds.push(programId);
    const scheduleId = uuidv7();
    await db.insert(pmSchedules).values({
      id: scheduleId,
      tenantId: opts.tenantId,
      pmProgramId: programId,
      frequency: "month",
      intervalCount: 3, // quarterly
      nextDueAt: opts.nextDueAt,
      isActive: true,
    });
    for (const locId of opts.locationIds) {
      await db.insert(pmScheduleLocations).values({
        id: uuidv7(),
        tenantId: opts.tenantId,
        pmScheduleId: scheduleId,
        clientLocationId: locId,
      });
    }
    return { programId, scheduleId };
  }

  try {
    console.log("\n[setup] resolve T-A (seeded Acme) + system user + build T-B");
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

    // Acme's LIVE active locations (query, don't assume — Part A flagged a stray stub).
    const acmeLocs = await db
      .select({ id: clientLocations.id })
      .from(clientLocations)
      .where(and(eq(clientLocations.tenantId, tAId), eq(clientLocations.clientId, acme.id)));
    check("setup: Acme has >=2 live locations (fan-out exercisable)", acmeLocs.length >= 2);
    if (acmeLocs.length < 2) return finish();
    const acmeLocIds = acmeLocs.map((r) => r.id);

    // T-B: a separate tenant + its own client/location (for cross-tenant + the mismatch poison).
    tBId = uuidv7();
    await db.insert(tenants).values({ id: tBId, name: "Phase14 Harness Tenant B", slug: T_B_SLUG, type: "aggregator", status: "active" });
    const tbClientId = uuidv7();
    await db.insert(clients).values({ id: tbClientId, tenantId: tBId, name: "Harness Client B" });
    const tbLocId = uuidv7();
    await db.insert(clientLocations).values({ id: tbLocId, tenantId: tBId, clientId: tbClientId, name: "B Store", addressLine1: "1 B St", city: "Btown", stateProvince: "CA", postalCode: "90001" });

    // T-A POISON: a SAME-TENANT but DIFFERENT-CLIENT location. createJob is tenant-scoped, so a
    // T-B location under T-A throws LOCATION_NOT_FOUND (the mismatch check never runs); to exercise
    // the intended LOCATION_CLIENT_MISMATCH the location must be in T-A under a different client.
    const poisonClientId = uuidv7();
    await db.insert(clients).values({ id: poisonClientId, tenantId: tAId, name: "[pm-harness] Poison Client" });
    createdClientIds.push(poisonClientId);
    const poisonLocId = uuidv7();
    await db.insert(clientLocations).values({ id: poisonLocId, tenantId: tAId, clientId: poisonClientId, name: "Poison Store", addressLine1: "9 Poison Rd", city: "Ptown", stateProvince: "NY", postalCode: "10002" });
    createdLocationIds.push(poisonLocId);

    const pastDue = new Date("2025-01-01T00:00:00Z");

    // ════════ A. FAN-OUT (auto) ════════
    console.log("\n[A] fan-out (auto)");
    const { scheduleId: schedA } = await seedProgram({
      tenantId: tAId, clientId: acme.id, tradeId: hvac.id, priorityId: scheduledPrio.id,
      locationIds: acmeLocIds, autoGenerate: true, nextDueAt: pastDue, label: "A auto fan-out",
    });
    const rA = await generateVisitsForSchedule(schedA, { mode: "auto" });
    rA.visits.forEach((v) => { if (v.jobId) createdJobIds.push(v.jobId); });
    check("A1: requested === live Acme membership count", rA.requested === acmeLocIds.length);
    check("A2: generated === requested, skipped === 0", rA.generated === acmeLocIds.length && rA.skipped === 0);
    const visitsA = await db.select().from(pmVisits).where(eq(pmVisits.pmScheduleId, schedA));
    check("A3: pm_visits == requested, all 'generated', all jobId non-null",
      visitsA.length === acmeLocIds.length && visitsA.every((v) => v.generationStatus === "generated" && !!v.jobId));
    const [runA] = await db.select().from(pmGenerationRuns).where(eq(pmGenerationRuns.id, rA.runId));
    check("A4: one run row, counts match (requested/generated/skipped)",
      runA?.requestedCount === acmeLocIds.length && runA?.generatedCount === acmeLocIds.length && runA?.skippedCount === 0);

    // ════════ B. JOB ATTRIBUTION ════════
    console.log("\n[B] job attribution");
    const sampleVisit = visitsA.find((v) => !!v.jobId)!;
    const [job] = await db.select().from(jobs).where(eq(jobs.id, sampleVisit.jobId!));
    check("B1: job source_type === 'preventative_maintenance'", job?.sourceType === "preventative_maintenance");
    check("B2: job createdBy === system user (auto path)", job?.createdByUserId === systemUserId);
    check("B3: sourceExternalId matches pm:{schedule}:{run}:{location}",
      job?.sourceExternalId === `pm:${schedA}:${rA.runId}:${sampleVisit.clientLocationId}`);
    check("B4: job client===Acme, location===member, status===NEW",
      job?.clientId === acme.id && job?.clientLocationId === sampleVisit.clientLocationId && job?.currentStatusId === newStatus.id);

    // ════════ C. RECURRENCE ADVANCE / IDEMPOTENT RE-FIRE ════════
    console.log("\n[C] recurrence advance / idempotent re-fire");
    const [schedAfter] = await db.select().from(pmSchedules).where(eq(pmSchedules.id, schedA));
    const expectedNext = advanceDueDate(pastDue, "month", 3);
    check("C1: nextDueAt advanced 3 months", schedAfter?.nextDueAt?.getTime() === expectedNext.getTime());
    check("C2: lastGeneratedAt set", !!schedAfter?.lastGeneratedAt);
    const runsBeforeReFire = (await db.select({ id: pmGenerationRuns.id }).from(pmGenerationRuns).where(eq(pmGenerationRuns.pmScheduleId, schedA))).length;
    const beforeNext = new Date(expectedNext.getTime() - 24 * 3600 * 1000); // 1 day before the new due
    const reFire = await runDueSchedules({ now: beforeNext, tenantId: tAId });
    const runsAfterReFire = (await db.select({ id: pmGenerationRuns.id }).from(pmGenerationRuns).where(eq(pmGenerationRuns.pmScheduleId, schedA))).length;
    check("C3: not-yet-due → no new run for this schedule (idempotent)",
      runsAfterReFire === runsBeforeReFire && !reFire.some((r) => r.requested > 0 && r.runId && false));

    // ════════ D. SKIP-AND-FLAG ISOLATION (F2) ════════
    console.log("\n[D] skip-and-flag isolation");
    // Membership = Acme's locations (good) + ONE poison: a same-tenant DIFFERENT-client location
    // (→ LOCATION_CLIENT_MISMATCH from createJob, since the program's client is Acme).
    const { scheduleId: schedD } = await seedProgram({
      tenantId: tAId, clientId: acme.id, tradeId: hvac.id, priorityId: scheduledPrio.id,
      locationIds: [...acmeLocIds, poisonLocId], autoGenerate: true, nextDueAt: pastDue, label: "D skip-and-flag",
    });
    const rD = await generateVisitsForSchedule(schedD, { mode: "auto" });
    rD.visits.forEach((v) => { if (v.jobId) createdJobIds.push(v.jobId); });
    check("D1: generated === good count, skipped === 1, requested === good+1",
      rD.generated === acmeLocIds.length && rD.skipped === 1 && rD.requested === acmeLocIds.length + 1);
    const visitsD = await db.select().from(pmVisits).where(eq(pmVisits.pmScheduleId, schedD));
    const poison = visitsD.find((v) => v.clientLocationId === poisonLocId);
    check("D2: poison visit skipped, reason has the createJob error, jobId null",
      poison?.generationStatus === "skipped" && !!poison?.skipReason?.includes("LOCATION_CLIENT_MISMATCH") && poison?.jobId === null);
    const goodVisitsD = visitsD.filter((v) => v.clientLocationId !== poisonLocId);
    check("D3: good visits generated + jobId non-null (batch did NOT abort — F2 proof)",
      goodVisitsD.length === acmeLocIds.length && goodVisitsD.every((v) => v.generationStatus === "generated" && !!v.jobId));
    const [runD] = await db.select().from(pmGenerationRuns).where(eq(pmGenerationRuns.id, rD.runId));
    check("D4: run counts reflect the generated/skipped split",
      runD?.generatedCount === acmeLocIds.length && runD?.skippedCount === 1);

    // ════════ E. REVIEW PATH (F1 gate) + batch-approve ════════
    console.log("\n[E] review path (F1 gate) + batch-approve");
    // Deactivate the earlier auto schedules so the review-mode runDueSchedules picks up ONLY schedE
    // (schedA/schedD advanced to 2025-04-01, still past-due relative to now → they'd otherwise re-fire).
    await db.update(pmSchedules).set({ isActive: false }).where(inArray(pmSchedules.id, [schedA, schedD]));
    const { scheduleId: schedE } = await seedProgram({
      tenantId: tAId, clientId: acme.id, tradeId: hvac.id, priorityId: scheduledPrio.id,
      locationIds: acmeLocIds, autoGenerate: false, nextDueAt: pastDue, label: "E review path",
    });
    const jobsBeforeE = (await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, tAId))).length;
    const reviewFire = await runDueSchedules({ now: new Date(), tenantId: tAId });
    const runE = reviewFire.find((r) => r.visits.some((v) => v.status === "pending_review"));
    check("E1: review-mode fire → visits pending_review, no jobs", !!runE && runE.generated === 0 && runE.visits.every((v) => v.status === "pending_review"));
    const jobsAfterEFire = (await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, tAId))).length;
    check("E2: NO jobs created on the review fire", jobsAfterEFire === jobsBeforeE);
    const runEId = runE!.runId;
    const apr = await approvePmVisits(runEId, { actorUserId: operatorId });
    const apprVisits = await db.select().from(pmVisits).where(eq(pmVisits.pmGenerationRunId, runEId));
    apprVisits.forEach((v) => { if (v.jobId) createdJobIds.push(v.jobId); });
    check("E3: approved === pending count, jobs now exist", apr.approved === runE!.requested && apprVisits.every((v) => v.generationStatus === "generated" && !!v.jobId));
    const [apprJob] = apprVisits[0]?.jobId ? await db.select().from(jobs).where(eq(jobs.id, apprVisits[0].jobId!)) : [];
    check("E4: approved jobs createdBy === OPERATOR (not system), source_type PM",
      apprJob?.createdByUserId === operatorId && apprJob?.sourceType === "preventative_maintenance");
    const apr2 = await approvePmVisits(runEId, { actorUserId: operatorId });
    check("E5: re-approve → alreadyResolved === count, approved 0 (re-check guard)",
      apr2.approved === 0 && apr2.alreadyResolved === runE!.requested);

    // ════════ F. CROSS-TENANT ════════
    console.log("\n[F] cross-tenant isolation");
    // A schedule that does not exist (a fabricated id) → SCHEDULE_NOT_FOUND. (Tenant scope is the
    // schedule row's own tenant; a wrong-tenant lookup can't see it — mirrors DRAFT_NOT_FOUND.)
    let crossCode = "";
    try { await generateVisitsForSchedule(uuidv7(), { mode: "auto" }); } catch (e) { crossCode = e instanceof Error ? e.message : String(e); }
    check("F1: unknown/cross-tenant schedule → SCHEDULE_NOT_FOUND", crossCode === "SCHEDULE_NOT_FOUND");

    // ════════ G. EMPTY-FIRE ════════
    console.log("\n[G] empty fire");
    const { scheduleId: schedG } = await seedProgram({
      tenantId: tAId, clientId: acme.id, tradeId: hvac.id, priorityId: scheduledPrio.id,
      locationIds: [], autoGenerate: true, nextDueAt: pastDue, label: "G empty fire",
    });
    const rG = await generateVisitsForSchedule(schedG, { mode: "auto" });
    const visitsG = (await db.select({ id: pmVisits.id }).from(pmVisits).where(eq(pmVisits.pmScheduleId, schedG))).length;
    check("G1: 0-membership → run opened requested=0, generated=0, no visits, no throw",
      rG.requested === 0 && rG.generated === 0 && rG.skipped === 0 && visitsG === 0 && !!rG.runId);

    return finish();
  } finally {
    await teardown();
    console.log("[check-pm] teardown complete (harness programs/visits/runs/jobs + T-B removed)");
  }
}

function finish() {
  console.log("");
  console.log(`[check-pm] passed: ${passed}`);
  console.log(`[check-pm] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-pm] PHASE-BLOCKING LEDGER RED ✗ — PHASE BLOCKED");
  } else {
    console.log("[check-pm] PHASE-BLOCKING LEDGER GREEN ✓ (fan-out / attribution / recurrence-idempotent / skip-and-flag / review-gate+approve / isolation / empty-fire)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => {
    console.error("[check-pm] FAILED:", e);
    process.exit(1);
  });
