/**
 * scripts/probe-t2b.ts — SANDBOX probe for the auto-re-dispatch SWEEP (Phase 28 T2b).
 * Replicates the autoRedispatchSweepAction core (getExceptions → filter can_suggest → SEQUENTIAL
 * T1 loop → summary), since the server action needs a session. Mixed fleet + idempotent re-sweep +
 * per-job spend-cap halt. Namespaced [T2B]; saves/restores tenant_autonomy_settings. SANDBOX ONLY.
 *
 *   pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/probe-t2b.ts
 */

export {};

const RAW = process.env.DATABASE_URL;
if (!RAW) { console.error("[t2b] DATABASE_URL not set."); process.exit(2); }
const sandboxUrl = RAW.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) { console.error("[t2b] refusing: not *_sandbox."); process.exit(2); }
process.env.DATABASE_URL = sandboxUrl;
console.log(`[t2b] sandbox target confirmed: ${sandboxUrl.replace(/\/\/[^@]+@/, "//<creds>@")}`);

const MARKER = "[T2B]";
const TENANT_SLUG = "phase9-seed-tenant";
const AGENT_ID = "dispatch_router_v1";

async function main() {
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, trades, users,
    vendors, vendorLocations, vendorTradeCoverage, vendorServiceAreas,
    jobs, jobVendorAssignments, jobStatusHistory, jobEvents,
    jobVendorAssignmentStatusHistory, auditLogs, agentPolicies, tenantAutonomySettings,
    agentRuns, agentDecisions,
  } = await import("@/server/schema");
  const { eq, and, inArray, like, or, sql } = await import("drizzle-orm");
  const { v7: uuidv7 } = await import("uuid");
  const { createJob } = await import("@/server/jobs");
  const { createDispatch, sendDispatch } = await import("@/server/dispatch");
  const { autoRedispatchForStuckAssignment } = await import("@/server/auto-redispatch");
  const { getExceptions } = await import("@/server/analytics/exceptions");

  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  if (!/_sandbox$/.test(dbRows[0]?.db ?? "")) { console.error("[t2b] ABORT: not *_sandbox."); process.exit(2); }
  console.log("[t2b] connected DB confirmed:", dbRows[0]?.db);

  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TENANT_SLUG)).limit(1);
  const tenantId = tenant!.id;
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, tenantId)).limit(1);
  const [location] = await db.select({ id: clientLocations.id }).from(clientLocations).where(and(eq(clientLocations.tenantId, tenantId), eq(clientLocations.clientId, client!.id))).limit(1);
  const [trade] = await db.select({ id: trades.id }).from(trades).limit(1);
  const creatorId = (await db.select({ id: users.id }).from(users).limit(1))[0]!.id;

  async function makeVendor(label: string): Promise<string> {
    const vid = uuidv7();
    await db.insert(vendors).values({ id: vid, tenantId, name: `${MARKER} ${label}` });
    await db.insert(vendorLocations).values({ id: uuidv7(), tenantId, vendorId: vid, name: `${label} HQ`, addressLine1: "1 T2B Rd", city: "Metropolis", stateProvince: "NY", postalCode: "10001" });
    await db.insert(vendorTradeCoverage).values({ tenantId, vendorId: vid, tradeId: trade!.id, status: "active", isPrimary: true });
    await db.insert(vendorServiceAreas).values({ tenantId, vendorId: vid, areaType: "national", status: "active" });
    return vid;
  }
  // a stuck job: backdated SENT (past the DEFAULT 24h threshold) so it surfaces as can_suggest in getExceptions.
  async function makeStuck(nte: string): Promise<string> {
    const job = await createJob({ tenantId, clientId: client!.id, clientLocationId: location!.id, primaryTradeId: trade!.id, notToExceedAmount: nte, problemDescription: `${MARKER} sweep`, createdByUserId: creatorId });
    const vA = await makeVendor("Vendor A");
    await makeVendor("Vendor B");
    const a = await createDispatch({ tenantId, jobId: job.id, vendorId: vA, createdByUserId: creatorId });
    await sendDispatch({ tenantId, assignmentId: a.id, actorUserId: creatorId });
    await db.update(jobVendorAssignments).set({ sentAt: sql`(NOW() - INTERVAL 30 HOUR)` }).where(eq(jobVendorAssignments.id, a.id));
    return a.id;
  }
  async function setPolicy(policy: unknown) {
    await db.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tenantId), sql`${agentPolicies.clientId} IS NULL`, eq(agentPolicies.agentId, AGENT_ID)));
    await db.insert(agentPolicies).values({ tenantId, clientId: null, agentId: AGENT_ID, policy, status: "active" });
  }

  // Mirrors autoRedispatchSweepAction's core (sequential await-each loop).
  async function runSweep() {
    const exceptions = await getExceptions(tenantId);
    let swept = 0, autoSent = 0, heldForReview = 0, skipped = 0;
    const byReason: Record<string, number> = {};
    for (const e of exceptions) {
      if (e.kind !== "vendor_not_accepted" || e.redispatchState !== "can_suggest") continue;
      swept++;
      const r = await autoRedispatchForStuckAssignment({ tenantId, stuckAssignmentId: e.assignmentId });
      if (r.kind === "auto_sent") autoSent++;
      else if (r.kind === "prepared_blocked") { heldForReview++; byReason[r.blockedBy] = (byReason[r.blockedBy] ?? 0) + 1; }
      else { skipped++; byReason[r.reason] = (byReason[r.reason] ?? 0) + 1; }
    }
    return { swept, autoSent, heldForReview, skipped, byReason };
  }

  const savedTas = (await db.select().from(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tenantId)).limit(1))[0] ?? null;
  let allPass = true;
  const check = (n: string, c: boolean) => { console.log(`  ${c ? "PASS" : "FAIL"} — ${n}`); if (!c) allPass = false; };

  async function teardown() {
    const pV = await db.select({ id: vendors.id }).from(vendors).where(and(eq(vendors.tenantId, tenantId), like(vendors.name, `${MARKER}%`)));
    const vIds = pV.map((v) => v.id);
    const pJ = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.tenantId, tenantId), like(jobs.problemDescription, `${MARKER}%`)));
    const jIds = pJ.map((j) => j.id);
    const aRows = (jIds.length || vIds.length)
      ? await db.select({ id: jobVendorAssignments.id }).from(jobVendorAssignments).where(and(eq(jobVendorAssignments.tenantId, tenantId),
          or(jIds.length ? inArray(jobVendorAssignments.jobId, jIds) : undefined, vIds.length ? inArray(jobVendorAssignments.vendorId, vIds) : undefined)))
      : [];
    const aIds = aRows.map((r) => r.id);
    const runRows = jIds.length ? await db.select({ id: agentRuns.id }).from(agentRuns).where(inArray(agentRuns.jobId, jIds)) : [];
    const runIds = runRows.map((r) => r.id);
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
      if (runIds.length) { await tx.delete(agentDecisions).where(inArray(agentDecisions.agentRunId, runIds)); await tx.delete(agentRuns).where(inArray(agentRuns.id, runIds)); }
      if (aIds.length) {
        await tx.delete(jobVendorAssignmentStatusHistory).where(inArray(jobVendorAssignmentStatusHistory.assignmentId, aIds));
        await tx.delete(auditLogs).where(inArray(auditLogs.targetId, aIds));
        await tx.delete(jobVendorAssignments).where(inArray(jobVendorAssignments.id, aIds));
      }
      if (vIds.length) {
        await tx.delete(vendorTradeCoverage).where(inArray(vendorTradeCoverage.vendorId, vIds));
        await tx.delete(vendorServiceAreas).where(inArray(vendorServiceAreas.vendorId, vIds));
        await tx.delete(vendorLocations).where(inArray(vendorLocations.vendorId, vIds));
        await tx.delete(vendors).where(inArray(vendors.id, vIds));
      }
      if (jIds.length) {
        await tx.delete(auditLogs).where(inArray(auditLogs.targetId, jIds));
        await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, jIds));
        await tx.delete(jobEvents).where(inArray(jobEvents.jobId, jIds));
        await tx.delete(jobs).where(inArray(jobs.id, jIds));
      }
      await tx.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tenantId), eq(agentPolicies.agentId, AGENT_ID)));
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
    });
    return { jobs: jIds.length, vendors: vIds.length, assignments: aIds.length };
  }

  console.log("[t2b] pre-clean:", await teardown());
  await db.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tenantId));
  await setPolicy({ requiresReview: false, autonomyEnabled: true, conditions: { maxNteAmount: 1000 } });

  try {
    // SCENARIO A — mixed fleet: 2 auto_send ($800, pass) + 1 prepared_blocked ($1200, fail conditions)
    console.log("\n[t2b] A) mixed sweep → 2 auto_sent + 1 prepared_blocked");
    await makeStuck("800.00");
    await makeStuck("800.00");
    await makeStuck("1200.00");
    const a = await runSweep();
    console.log("   summary:", a);
    check("swept 3", a.swept === 3);
    check("autoSent 2", a.autoSent === 2);
    check("heldForReview 1", a.heldForReview === 1);
    check("skipped 0", a.skipped === 0);
    check("byReason nte_over_threshold 1", a.byReason["policy_condition:nte_over_threshold"] === 1);

    // SCENARIO B — idempotent re-sweep: auto_sent jobs ghosted (gone), held one has a DRAFT (suggestion_ready)
    console.log("\n[t2b] B) re-sweep → swept 0 (no double-action)");
    const b = await runSweep();
    console.log("   summary:", b);
    check("re-sweep swept 0", b.swept === 0);

    // SCENARIO C — per-job spend cap halts a re-dispatch (proves the spend gate is live in the sweep)
    console.log("\n[t2b] C) per-job spend cap → prepared_blocked:spend_ceiling");
    await db.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tenantId));
    await db.insert(tenantAutonomySettings).values({ tenantId, killSwitch: false, maxCommittedPerJob: "100.00" });
    await makeStuck("800.00"); // NTE 800 > per-job cap 100
    const c = await runSweep();
    console.log("   summary:", c);
    check("swept 1", c.swept === 1);
    check("heldForReview 1 (not auto_sent)", c.heldForReview === 1 && c.autoSent === 0);
    check("blockedBy spend_ceiling", c.byReason["spend_ceiling"] === 1);
  } finally {
    await db.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tenantId));
    if (savedTas) await db.insert(tenantAutonomySettings).values(savedTas);
    console.log("\n[t2b] teardown:", await teardown());
  }

  console.log(`\n[t2b] ${allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("[t2b] ERROR:", e); process.exit(1); });
