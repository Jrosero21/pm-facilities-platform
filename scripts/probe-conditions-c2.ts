/**
 * scripts/probe-conditions-c2.ts — SANDBOX probe for the policy-conditions GATE wire (Phase 28 C2).
 *
 * Isolates the CONDITION branch of auto-dispatch's `permitted` gate: sets autonomyEnabled:true +
 * clears the tenant ceilings (no kill-switch, no spend/token caps) so the ONLY thing that can gate
 * is the conditions block. Then drives autoDispatchDraftForJob and asserts the outcome/blockedBy.
 *   PASS            — $800 PLUMBING ROUTINE own-client, under all blocks → auto_advanced
 *   NTE over        — $1200 vs maxNteAmount 1000 → policy_condition:nte_over_threshold
 *   TRADE blocked   — job trade in blockedTradeCodes → policy_condition:trade_blocked
 *   conditionless   — autonomyEnabled:true, NO conditions → no-op → auto_advanced
 * Self-tearing-down (namespaced [COND-C2]; saves/restores tenant_autonomy_settings). SANDBOX ONLY.
 *
 *   pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/probe-conditions-c2.ts
 */

export {};

const RAW = process.env.DATABASE_URL;
if (!RAW) { console.error("[c2] DATABASE_URL not set."); process.exit(2); }
const sandboxUrl = RAW.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) { console.error("[c2] refusing: not a *_sandbox DB."); process.exit(2); }
process.env.DATABASE_URL = sandboxUrl;
console.log(`[c2] sandbox target confirmed: ${sandboxUrl.replace(/\/\/[^@]+@/, "//<creds>@")}`);

const MARKER = "[COND-C2]";
const TENANT_SLUG = "phase9-seed-tenant";
const OPERATOR_EMAIL = "operator@phase9seed.test";
const AGENT_ID = "dispatch_router_v1";

async function main() {
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, trades, priorities, users,
    vendors, vendorLocations, vendorTradeCoverage, vendorServiceAreas,
    jobs, jobVendorAssignments, jobStatusHistory, jobEvents,
    jobVendorAssignmentStatusHistory, auditLogs, agentPolicies, tenantAutonomySettings,
    agentRuns, agentDecisions,
  } = await import("@/server/schema");
  const { eq, and, inArray, like, or, sql } = await import("drizzle-orm");
  const { v7: uuidv7 } = await import("uuid");
  const { createJob } = await import("@/server/jobs");
  const { autoDispatchDraftForJob } = await import("@/server/auto-dispatch");

  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  if (!/_sandbox$/.test(dbRows[0]?.db ?? "")) { console.error("[c2] ABORT: not *_sandbox."); process.exit(2); }
  console.log("[c2] connected DB confirmed:", dbRows[0]?.db);

  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TENANT_SLUG)).limit(1);
  if (!tenant) { console.error("[c2] phase9-seed-tenant not found."); process.exit(2); }
  const tenantId = tenant.id;
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, tenantId)).limit(1);
  const [location] = await db.select({ id: clientLocations.id }).from(clientLocations).where(and(eq(clientLocations.tenantId, tenantId), eq(clientLocations.clientId, client!.id))).limit(1);
  const [trade] = await db.select({ id: trades.id, code: trades.code }).from(trades).limit(1);
  const [routine] = await db.select({ id: priorities.id, code: priorities.code }).from(priorities).where(and(eq(priorities.tenantId, tenantId), eq(priorities.code, "ROUTINE"))).limit(1);
  const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, OPERATOR_EMAIL)).limit(1);
  const creatorId = operator?.id ?? (await db.select({ id: users.id }).from(users).limit(1))[0]!.id;
  if (!client || !location || !trade || !routine) { console.error("[c2] missing client/location/trade/ROUTINE."); process.exit(2); }
  console.log(`[c2] using trade.code=${trade.code}, priority.code=${routine.code}, clientId=${client.id.slice(0, 8)}`);

  // one eligible vendor (national coverage) — a candidate for every probe job.
  async function makeVendor(label: string): Promise<string> {
    const vid = uuidv7();
    await db.insert(vendors).values({ id: vid, tenantId, name: `${MARKER} ${label}` });
    await db.insert(vendorLocations).values({ id: uuidv7(), tenantId, vendorId: vid, name: `${label} HQ`, addressLine1: "1 C2 Rd", city: "Metropolis", stateProvince: "NY", postalCode: "10001" });
    await db.insert(vendorTradeCoverage).values({ tenantId, vendorId: vid, tradeId: trade!.id, status: "active", isPrimary: true });
    await db.insert(vendorServiceAreas).values({ tenantId, vendorId: vid, areaType: "national", status: "active" });
    return vid;
  }

  // ── tenant_autonomy_settings: save + clear (no kill switch, no caps), restore in teardown ──
  const savedTas = (await db.select().from(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tenantId)).limit(1))[0] ?? null;
  async function clearTas() { await db.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tenantId)); }
  async function restoreTas() {
    await db.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tenantId));
    if (savedTas) await db.insert(tenantAutonomySettings).values(savedTas);
  }

  async function setPolicy(policy: unknown) {
    await db.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tenantId), isNullClient(), eq(agentPolicies.agentId, AGENT_ID)));
    await db.insert(agentPolicies).values({ tenantId, clientId: null, agentId: AGENT_ID, policy, status: "active" });
  }
  function isNullClient() { return sql`${agentPolicies.clientId} IS NULL`; }

  async function makeJob(nte: string): Promise<string> {
    const j = await createJob({
      tenantId, clientId: client!.id, clientLocationId: location!.id,
      primaryTradeId: trade!.id, priorityId: routine!.id, notToExceedAmount: nte,
      problemDescription: `${MARKER} cond probe`, createdByUserId: creatorId,
    });
    return j.id;
  }

  // ── TEARDOWN ──
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

  let allPass = true;
  const check = (n: string, c: boolean) => { console.log(`  ${c ? "PASS" : "FAIL"} — ${n}`); if (!c) allPass = false; };

  console.log("[c2] pre-clean:", await teardown());
  await clearTas();
  await makeVendor("Vendor"); // shared eligible vendor

  const BLOCKS = { blockedTradeCodes: ["__NOT_THIS__"], blockedPriorityCodes: ["EMERGENCY"], blockedClientIds: ["__OTHER__"] };

  try {
    // 1) PASS — $800, under maxNteAmount 1000, trade not blocked, ROUTINE, own client
    await setPolicy({ requiresReview: false, autonomyEnabled: true, conditions: { maxNteAmount: 1000, ...BLOCKS } });
    const r1 = await autoDispatchDraftForJob(tenantId, await makeJob("800.00"));
    console.log("  scenario PASS →", r1);
    check("PASS: outcome auto_advanced (conditions did not block)", r1.outcome === "auto_advanced");

    // 2) NTE over — $1200 vs maxNteAmount 1000
    await setPolicy({ requiresReview: false, autonomyEnabled: true, conditions: { maxNteAmount: 1000, ...BLOCKS } });
    const r2 = await autoDispatchDraftForJob(tenantId, await makeJob("1200.00"));
    console.log("  scenario NTE-OVER →", r2);
    check("NTE-over: drafted_pending", r2.outcome === "drafted_pending");
    check("NTE-over: blockedBy policy_condition:nte_over_threshold", (r2 as { blockedBy?: string }).blockedBy === "policy_condition:nte_over_threshold");

    // 3) TRADE blocked — job's own trade is in blockedTradeCodes
    await setPolicy({ requiresReview: false, autonomyEnabled: true, conditions: { maxNteAmount: 1000, blockedTradeCodes: [trade.code], blockedPriorityCodes: ["EMERGENCY"], blockedClientIds: ["__OTHER__"] } });
    const r3 = await autoDispatchDraftForJob(tenantId, await makeJob("800.00"));
    console.log("  scenario TRADE-BLOCKED →", r3);
    check("trade-blocked: drafted_pending", r3.outcome === "drafted_pending");
    check("trade-blocked: blockedBy policy_condition:trade_blocked", (r3 as { blockedBy?: string }).blockedBy === "policy_condition:trade_blocked");

    // 4) conditionless — autonomyEnabled, NO conditions → no-op → auto_advanced
    await setPolicy({ requiresReview: false, autonomyEnabled: true });
    const r4 = await autoDispatchDraftForJob(tenantId, await makeJob("800.00"));
    console.log("  scenario CONDITIONLESS →", r4);
    check("conditionless: outcome auto_advanced (no-op)", r4.outcome === "auto_advanced");
    check("conditionless: NOT a policy_condition block", !String((r4 as { blockedBy?: string }).blockedBy ?? "").startsWith("policy_condition"));
  } finally {
    await restoreTas();
    console.log("[c2] teardown:", await teardown());
  }

  console.log(`\n[c2] ${allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("[c2] ERROR:", e); process.exit(1); });
