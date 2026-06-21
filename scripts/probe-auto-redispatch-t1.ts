/**
 * scripts/probe-auto-redispatch-t1.ts — SANDBOX probe for the gate-governed autonomous re-dispatch
 * core (Phase 28 T1). Drives autoRedispatchForStuckAssignment under each gate outcome + the two
 * idempotency repeats. SANDBOX ONLY; namespaced [AUTORD-T1]; saves/restores tenant_autonomy_settings.
 *
 *   pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/probe-auto-redispatch-t1.ts
 */

export {};

const RAW = process.env.DATABASE_URL;
if (!RAW) { console.error("[t1] DATABASE_URL not set."); process.exit(2); }
const sandboxUrl = RAW.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) { console.error("[t1] refusing: not *_sandbox."); process.exit(2); }
process.env.DATABASE_URL = sandboxUrl;
console.log(`[t1] sandbox target confirmed: ${sandboxUrl.replace(/\/\/[^@]+@/, "//<creds>@")}`);

const MARKER = "[AUTORD-T1]";
const TENANT_SLUG = "phase9-seed-tenant";
const AGENT_ID = "dispatch_router_v1";

async function main() {
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, trades, users,
    vendors, vendorLocations, vendorTradeCoverage, vendorServiceAreas,
    jobs, jobVendorAssignments, jobStatusHistory, jobEvents, jobStatuses,
    jobVendorAssignmentStatusHistory, auditLogs, agentPolicies, tenantAutonomySettings,
    agentRuns, agentDecisions, dispatchAssignmentStatuses,
  } = await import("@/server/schema");
  const { eq, and, inArray, like, or, sql } = await import("drizzle-orm");
  const { v7: uuidv7 } = await import("uuid");
  const { createJob } = await import("@/server/jobs");
  const { createDispatch, sendDispatch } = await import("@/server/dispatch");
  const { autoRedispatchForStuckAssignment } = await import("@/server/auto-redispatch");

  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  if (!/_sandbox$/.test(dbRows[0]?.db ?? "")) { console.error("[t1] ABORT: not *_sandbox."); process.exit(2); }
  console.log("[t1] connected DB confirmed:", dbRows[0]?.db);

  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TENANT_SLUG)).limit(1);
  if (!tenant) { console.error("[t1] phase9-seed-tenant not found."); process.exit(2); }
  const tenantId = tenant.id;
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, tenantId)).limit(1);
  const [location] = await db.select({ id: clientLocations.id }).from(clientLocations).where(and(eq(clientLocations.tenantId, tenantId), eq(clientLocations.clientId, client!.id))).limit(1);
  const [trade] = await db.select({ id: trades.id }).from(trades).limit(1);
  const creatorId = (await db.select({ id: users.id }).from(users).limit(1))[0]!.id;
  if (!client || !location || !trade) { console.error("[t1] missing client/location/trade."); process.exit(2); }

  // ── helpers ──
  async function makeVendor(label: string): Promise<string> {
    const vid = uuidv7();
    await db.insert(vendors).values({ id: vid, tenantId, name: `${MARKER} ${label}` });
    await db.insert(vendorLocations).values({ id: uuidv7(), tenantId, vendorId: vid, name: `${label} HQ`, addressLine1: "1 T1 Rd", city: "Metropolis", stateProvince: "NY", postalCode: "10001" });
    await db.insert(vendorTradeCoverage).values({ tenantId, vendorId: vid, tradeId: trade!.id, status: "active", isPrimary: true });
    await db.insert(vendorServiceAreas).values({ tenantId, vendorId: vid, areaType: "national", status: "active" });
    return vid;
  }
  // a fresh job + a SENT (stuck) assignment to vendor A + an eligible alternate B.
  async function makeStuck(nte: string): Promise<string> {
    const job = await createJob({ tenantId, clientId: client!.id, clientLocationId: location!.id, primaryTradeId: trade!.id, notToExceedAmount: nte, problemDescription: `${MARKER} t1`, createdByUserId: creatorId });
    const vA = await makeVendor("Vendor A");
    await makeVendor("Vendor B"); // eligible alternate
    const a = await createDispatch({ tenantId, jobId: job.id, vendorId: vA, createdByUserId: creatorId });
    await sendDispatch({ tenantId, assignmentId: a.id, actorUserId: creatorId });
    return a.id;
  }
  async function setPolicy(policy: unknown) {
    await db.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tenantId), sql`${agentPolicies.clientId} IS NULL`, eq(agentPolicies.agentId, AGENT_ID)));
    await db.insert(agentPolicies).values({ tenantId, clientId: null, agentId: AGENT_ID, policy, status: "active" });
  }
  async function setTas(mode: "clear" | "kill") {
    await db.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tenantId));
    if (mode === "kill") await db.insert(tenantAutonomySettings).values({ tenantId, killSwitch: true });
  }
  async function asgStatus(id: string): Promise<string> {
    const [r] = await db.select({ code: dispatchAssignmentStatuses.code }).from(jobVendorAssignments)
      .innerJoin(dispatchAssignmentStatuses, eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id))
      .where(eq(jobVendorAssignments.id, id)).limit(1);
    return r?.code ?? "(none)";
  }
  async function jobOf(stuckId: string): Promise<string> {
    const [r] = await db.select({ jobId: jobVendorAssignments.jobId }).from(jobVendorAssignments).where(eq(jobVendorAssignments.id, stuckId)).limit(1);
    return r!.jobId;
  }
  async function jobStatus(jobId: string): Promise<string> {
    const [r] = await db.select({ code: jobStatuses.code }).from(jobs).innerJoin(jobStatuses, eq(jobs.currentStatusId, jobStatuses.id)).where(eq(jobs.id, jobId)).limit(1);
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

  console.log("[t1] pre-clean:", await teardown());
  const PERMIT = { requiresReview: false, autonomyEnabled: true, conditions: { maxNteAmount: 1000 } };

  try {
    // 1) PERMITTED → auto_sent
    console.log("\n[t1] 1) PERMITTED → auto_sent");
    await setTas("clear"); await setPolicy(PERMIT);
    const s1 = await makeStuck("800.00");
    const r1 = await autoRedispatchForStuckAssignment({ tenantId, stuckAssignmentId: s1 });
    console.log("   →", r1);
    check("kind auto_sent", r1.kind === "auto_sent");
    check("stuck A GHOSTED", (await asgStatus(s1)) === "GHOSTED");
    check("new B SENT", r1.kind === "auto_sent" && (await asgStatus(r1.sentAssignmentId)) === "SENT");
    check("job DISPATCHED", (await jobStatus(await jobOf(s1))) === "DISPATCHED");

    // 5) IDEMPOTENT REPEAT after auto_sent (same now-GHOSTED stuck)
    console.log("\n[t1] 5) repeat after auto_sent → skipped(not_stuck_sent)");
    const draftsBefore = await draftsReplacing(s1);
    const r5 = await autoRedispatchForStuckAssignment({ tenantId, stuckAssignmentId: s1 });
    console.log("   →", r5);
    check("kind skipped/not_stuck_sent", r5.kind === "skipped" && r5.reason === "not_stuck_sent");
    check("no spurious DRAFT (count unchanged)", (await draftsReplacing(s1)) === draftsBefore);

    // 2) AUTONOMY OFF → skipped(autonomy_off), no DRAFT
    console.log("\n[t1] 2) autonomy OFF → skipped(autonomy_off)");
    await setTas("clear"); await setPolicy({ requiresReview: true, autonomyEnabled: false });
    const s2 = await makeStuck("800.00");
    const r2 = await autoRedispatchForStuckAssignment({ tenantId, stuckAssignmentId: s2 });
    console.log("   →", r2);
    check("kind skipped/autonomy_off", r2.kind === "skipped" && r2.reason === "autonomy_off");
    check("NO DRAFT created (off means off)", (await draftsReplacing(s2)) === 0);
    check("stuck still SENT", (await asgStatus(s2)) === "SENT");

    // 3) KILL-SWITCH → skipped(autonomy_off)
    console.log("\n[t1] 3) kill-switch → skipped(autonomy_off)");
    await setTas("kill"); await setPolicy(PERMIT); // policy enabled, but kill switch on
    const s3 = await makeStuck("800.00");
    const r3 = await autoRedispatchForStuckAssignment({ tenantId, stuckAssignmentId: s3 });
    console.log("   →", r3);
    check("kind skipped/autonomy_off (kill-switch)", r3.kind === "skipped" && r3.reason === "autonomy_off");
    check("NO DRAFT created", (await draftsReplacing(s3)) === 0);
    check("stuck still SENT", (await asgStatus(s3)) === "SENT");

    // 4) CONDITION BLOCK → prepared_blocked
    console.log("\n[t1] 4) condition block → prepared_blocked");
    await setTas("clear"); await setPolicy({ requiresReview: false, autonomyEnabled: true, conditions: { maxNteAmount: 500 } });
    const s4 = await makeStuck("800.00"); // $800 > maxNteAmount 500
    const r4 = await autoRedispatchForStuckAssignment({ tenantId, stuckAssignmentId: s4 });
    console.log("   →", r4);
    check("kind prepared_blocked", r4.kind === "prepared_blocked");
    check("blockedBy policy_condition:nte_over_threshold", r4.kind === "prepared_blocked" && r4.blockedBy === "policy_condition:nte_over_threshold");
    check("a DRAFT EXISTS (pending for manual review)", (await draftsReplacing(s4)) === 1);
    check("stuck STILL SENT (autonomy did not act)", (await asgStatus(s4)) === "SENT");

    // 6) IDEMPOTENT REPEAT after prepared_blocked (same still-SENT stuck, pending DRAFT)
    console.log("\n[t1] 6) repeat after prepared_blocked → skipped(already_suggested)");
    const r6 = await autoRedispatchForStuckAssignment({ tenantId, stuckAssignmentId: s4 });
    console.log("   →", r6);
    check("kind skipped/already_suggested", r6.kind === "skipped" && r6.reason === "already_suggested");
    check("no 2nd DRAFT (count still 1)", (await draftsReplacing(s4)) === 1);
  } finally {
    await db.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tenantId));
    if (savedTas) await db.insert(tenantAutonomySettings).values(savedTas);
    console.log("\n[t1] teardown:", await teardown());
  }

  console.log(`\n[t1] ${allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("[t1] ERROR:", e); process.exit(1); });
