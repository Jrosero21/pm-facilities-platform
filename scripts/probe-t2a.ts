/**
 * scripts/probe-t2a.ts — SANDBOX probe for the per-job auto-re-dispatch entry (Phase 28 T2a).
 * Re-proves T1 through the exact path the autoRedispatchOneAction wraps (the server action needs a
 * session, so we call autoRedispatchForStuckAssignment directly with the same inputs the action passes).
 * 3 outcomes: PERMITTED → auto_sent · CONDITION-BLOCK → prepared_blocked · AUTONOMY-OFF → skipped.
 * Namespaced [T2A]; saves/restores tenant_autonomy_settings. SANDBOX ONLY.
 *
 *   pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/probe-t2a.ts
 */

export {};

const RAW = process.env.DATABASE_URL;
if (!RAW) { console.error("[t2a] DATABASE_URL not set."); process.exit(2); }
const sandboxUrl = RAW.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) { console.error("[t2a] refusing: not *_sandbox."); process.exit(2); }
process.env.DATABASE_URL = sandboxUrl;
console.log(`[t2a] sandbox target confirmed: ${sandboxUrl.replace(/\/\/[^@]+@/, "//<creds>@")}`);

const MARKER = "[T2A]";
const TENANT_SLUG = "phase9-seed-tenant";
const AGENT_ID = "dispatch_router_v1";

async function main() {
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, trades, users,
    vendors, vendorLocations, vendorTradeCoverage, vendorServiceAreas,
    jobs, jobVendorAssignments, jobStatusHistory, jobEvents,
    jobVendorAssignmentStatusHistory, auditLogs, agentPolicies, tenantAutonomySettings,
    agentRuns, agentDecisions, dispatchAssignmentStatuses,
  } = await import("@/server/schema");
  const { eq, and, inArray, like, or, sql } = await import("drizzle-orm");
  const { v7: uuidv7 } = await import("uuid");
  const { createJob } = await import("@/server/jobs");
  const { createDispatch, sendDispatch } = await import("@/server/dispatch");
  const { autoRedispatchForStuckAssignment } = await import("@/server/auto-redispatch");

  const { rows: dbRows } = (await db.execute(sql`SELECT current_database() AS db`)) as unknown as { rows: { db: string }[] };
  if (!/_sandbox$/.test(dbRows[0]?.db ?? "")) { console.error("[t2a] ABORT: not *_sandbox."); process.exit(2); }
  console.log("[t2a] connected DB confirmed:", dbRows[0]?.db);

  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TENANT_SLUG)).limit(1);
  const tenantId = tenant!.id;
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, tenantId)).limit(1);
  const [location] = await db.select({ id: clientLocations.id }).from(clientLocations).where(and(eq(clientLocations.tenantId, tenantId), eq(clientLocations.clientId, client!.id))).limit(1);
  const [trade] = await db.select({ id: trades.id }).from(trades).limit(1);
  const creatorId = (await db.select({ id: users.id }).from(users).limit(1))[0]!.id;

  async function makeVendor(label: string): Promise<string> {
    const vid = uuidv7();
    await db.insert(vendors).values({ id: vid, tenantId, name: `${MARKER} ${label}` });
    await db.insert(vendorLocations).values({ id: uuidv7(), tenantId, vendorId: vid, name: `${label} HQ`, addressLine1: "1 T2A Rd", city: "Metropolis", stateProvince: "NY", postalCode: "10001" });
    await db.insert(vendorTradeCoverage).values({ tenantId, vendorId: vid, tradeId: trade!.id, status: "active", isPrimary: true });
    await db.insert(vendorServiceAreas).values({ tenantId, vendorId: vid, areaType: "national", status: "active" });
    return vid;
  }
  async function makeStuck(nte: string): Promise<string> {
    const job = await createJob({ tenantId, clientId: client!.id, clientLocationId: location!.id, primaryTradeId: trade!.id, notToExceedAmount: nte, problemDescription: `${MARKER} t2a`, createdByUserId: creatorId });
    const vA = await makeVendor("Vendor A");
    await makeVendor("Vendor B");
    const a = await createDispatch({ tenantId, jobId: job.id, vendorId: vA, createdByUserId: creatorId });
    await sendDispatch({ tenantId, assignmentId: a.id, actorUserId: creatorId });
    return a.id;
  }
  async function setPolicy(policy: unknown) {
    await db.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tenantId), sql`${agentPolicies.clientId} IS NULL`, eq(agentPolicies.agentId, AGENT_ID)));
    await db.insert(agentPolicies).values({ tenantId, clientId: null, agentId: AGENT_ID, policy, status: "active" });
  }
  async function asgStatus(id: string): Promise<string> {
    const [r] = await db.select({ code: dispatchAssignmentStatuses.code }).from(jobVendorAssignments)
      .innerJoin(dispatchAssignmentStatuses, eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id))
      .where(eq(jobVendorAssignments.id, id)).limit(1);
    return r?.code ?? "(none)";
  }
  async function draftsReplacing(stuckId: string): Promise<number> {
    return (await db.select({ id: jobVendorAssignments.id }).from(jobVendorAssignments).where(eq(jobVendorAssignments.replacesAssignmentId, stuckId))).length;
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
    });
    return { jobs: jIds.length, vendors: vIds.length, assignments: aIds.length };
  }

  console.log("[t2a] pre-clean:", await teardown());
  await db.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tenantId));

  try {
    // PERMITTED → auto_sent
    console.log("\n[t2a] PERMITTED → auto_sent");
    await setPolicy({ requiresReview: false, autonomyEnabled: true, conditions: { maxNteAmount: 1000 } });
    const s1 = await makeStuck("800.00");
    const r1 = await autoRedispatchForStuckAssignment({ tenantId, stuckAssignmentId: s1 });
    console.log("   →", r1);
    check("auto_sent", r1.kind === "auto_sent");
    check("stuck GHOSTED", (await asgStatus(s1)) === "GHOSTED");
    check("new SENT", r1.kind === "auto_sent" && (await asgStatus(r1.sentAssignmentId)) === "SENT");

    // CONDITION-BLOCK → prepared_blocked
    console.log("\n[t2a] CONDITION-BLOCK → prepared_blocked");
    await setPolicy({ requiresReview: false, autonomyEnabled: true, conditions: { maxNteAmount: 500 } });
    const s2 = await makeStuck("800.00");
    const r2 = await autoRedispatchForStuckAssignment({ tenantId, stuckAssignmentId: s2 });
    console.log("   →", r2);
    check("prepared_blocked", r2.kind === "prepared_blocked");
    check("blockedBy policy_condition:nte_over_threshold", r2.kind === "prepared_blocked" && r2.blockedBy === "policy_condition:nte_over_threshold");
    check("DRAFT pending exists", (await draftsReplacing(s2)) === 1);
    check("stuck still SENT", (await asgStatus(s2)) === "SENT");

    // AUTONOMY-OFF → skipped:autonomy_off
    console.log("\n[t2a] AUTONOMY-OFF → skipped:autonomy_off");
    await setPolicy({ requiresReview: true, autonomyEnabled: false });
    const s3 = await makeStuck("800.00");
    const r3 = await autoRedispatchForStuckAssignment({ tenantId, stuckAssignmentId: s3 });
    console.log("   →", r3);
    check("skipped/autonomy_off", r3.kind === "skipped" && r3.reason === "autonomy_off");
    check("no DRAFT", (await draftsReplacing(s3)) === 0);
  } finally {
    await db.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tenantId));
    if (savedTas) await db.insert(tenantAutonomySettings).values(savedTas);
    console.log("\n[t2a] teardown:", await teardown());
  }

  console.log(`\n[t2a] ${allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("[t2a] ERROR:", e); process.exit(1); });
