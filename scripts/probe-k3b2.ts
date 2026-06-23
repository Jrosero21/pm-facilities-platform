/**
 * scripts/probe-k3b2.ts — K3b-2 probe (CF-23.1): the DIVERGENT inline dispatch_tiebreaker site.
 *   PART A (offline): generateDispatchTiebreak FORWARDS input.providerKeys → buildProviderModel apiKey
 *     (registry spy; recorded during buildCandidates, before the stub-model generateObject throw).
 *   PART B (sandbox, MOCK tiebreaker): a close-call autoDispatchDraftForJob FIRES the inline orchestrator
 *     (no real LLM call) → the orchestrator resolves the tenant key + flags agent_decisions.metadata.
 *     LOAD-BEARING: metadata.keySource (LLM-key provenance) must NOT collide with the pre-existing
 *     metadata.source (the dispatch decision). (a) no key → keySource "platform"; (b) seeded key →
 *     "tenant"; (c) tampered blob → tenantKeyError "decrypt_failed" + platform; source unchanged throughout.
 *
 *   pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/probe-k3b2.ts
 */

import assert from "node:assert/strict";

const RAW = process.env.DATABASE_URL;
if (!RAW) { console.error("[k3b2] DATABASE_URL not set."); process.exit(2); }
const sandboxUrl = RAW.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) { console.error("[k3b2] refusing: not *_sandbox."); process.exit(2); }
process.env.DATABASE_URL = sandboxUrl;
console.log(`[k3b2] sandbox target confirmed: ${sandboxUrl.replace(/\/\/[^@]+@/, "//<creds>@")}`);

const TENANT_SLUG = "phase9-seed-tenant";
const AGENT = "dispatch_router_v1";
const TIEBREAKER_AGENT = "dispatch_tiebreaker_v1";

async function main() {
  let pass = 0;
  const ok = (n: string) => { pass++; console.log(`  ok ${n}`); };

  // ───────── PART A — offline apiKey-flow (generateDispatchTiebreak) ─────────
  console.log("\nPART A — generateDispatchTiebreak forwards input.providerKeys → buildProviderModel (offline)");
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "sk-ant-FAKE-platform"; // direct routing; no network ever made
  const { PROVIDER_REGISTRY } = await import("@/server/agents/providers");
  const { generateDispatchTiebreak } = await import("@/server/agents/dispatch-tiebreaker/llm");
  const realBuild = PROVIDER_REGISTRY.anthropic.buildModel;
  const seenKeys: Array<string | undefined> = [];
  const routing = { mode: "direct" as const, provider: "anthropic" as const, modelId: "claude-sonnet-4-6", recordedModel: "anthropic/claude-sonnet-4-6" };
  try {
    PROVIDER_REGISTRY.anthropic.buildModel = (_b: string, apiKey?: string) => { seenKeys.push(apiKey); return {} as unknown as ReturnType<typeof realBuild>; };
    const callTb = (providerKeys: Record<string, string> | undefined) =>
      generateDispatchTiebreak({ routing, systemPrompt: "s", temperature: 0.2, failoverOrder: undefined, providerKeys, problemDescription: "x", pair: [{ vendorId: "v1", vendorName: "A", tradeContext: "x" }, { vendorId: "v2", vendorName: "B", tradeContext: "y" }] } as unknown as Parameters<typeof generateDispatchTiebreak>[0]);
    seenKeys.length = 0;
    try { await callTb(undefined); } catch { /* stub model → throws; spy already recorded */ }
    assert.ok(seenKeys.length >= 1 && seenKeys.every((k) => k === undefined));
    ok("no providerKeys → buildProviderModel got apiKey undefined (env singleton, no-op)");
    seenKeys.length = 0;
    try { await callTb({ anthropic: "sk-probe" }); } catch { /* same */ }
    assert.ok(seenKeys.length >= 1 && seenKeys.every((k) => k === "sk-probe"));
    ok("providerKeys {anthropic:sk-probe} → buildProviderModel got the tenant key (factory)");
  } finally {
    PROVIDER_REGISTRY.anthropic.buildModel = realBuild;
  }

  // ───────── PART B — live close-call dispatch, MOCK tiebreaker (metadata keySource vs source) ─────────
  console.log("\nPART B — close-call autoDispatchDraftForJob (mock tiebreaker) flags metadata.keySource (live)");
  process.env.DISPATCH_TIEBREAKER_MOCK = "1"; // tiebreaker fires but returns mock → NO real call; orchestrator still resolves key + logs
  const { generateSecretKey } = await import("@/server/security/secret-crypto");
  process.env.SECRET_ENCRYPTION_KEY = generateSecretKey();

  const { db } = await import("@/server/db");
  const { eq, and, inArray, sql } = await import("drizzle-orm");
  const { v7: uuidv7 } = await import("uuid");
  const { createJob } = await import("@/server/jobs");
  const { autoDispatchDraftForJob } = await import("@/server/auto-dispatch");
  const { setTenantLlmKey } = await import("@/server/security/llm-keys");
  const {
    tenants, users, trades, clients, clientLocations, vendors, vendorTradeCoverage, vendorServiceAreas,
    vendorPerformanceScores, locationPreferredVendors, jobs, jobVendorAssignments, jobVendorAssignmentStatusHistory,
    jobStatusHistory, jobEvents, auditLogs, agentRuns, agentDecisions, agentPolicies, tenantAutonomySettings, tenantLlmKeys,
  } = await import("@/server/schema");

  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  if (!/_sandbox$/.test(dbRows[0]?.db ?? "")) { console.error("[k3b2] ABORT: not *_sandbox."); process.exit(2); }
  console.log("[k3b2] connected DB confirmed:", dbRows[0]?.db);

  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TENANT_SLUG));
  const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
  const [hvac] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HVAC"));
  if (!tenant || !operator || !hvac) { console.error("[k3b2] base seed missing (phase9 tenant/operator/HVAC)."); process.exit(2); }
  const tenantId = tenant.id;

  const clientId = uuidv7();
  const locationId = uuidv7();
  const vLeader = uuidv7();
  const vRunner = uuidv7();
  const jobIds: string[] = [];

  async function teardown() {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
      if (jobIds.length) {
        const aIds = (await tx.select({ id: jobVendorAssignments.id }).from(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, jobIds))).map((r) => r.id);
        const runIds = (await tx.select({ id: agentRuns.id }).from(agentRuns).where(inArray(agentRuns.jobId, jobIds))).map((r) => r.id);
        if (runIds.length) { await tx.delete(agentDecisions).where(inArray(agentDecisions.agentRunId, runIds)); await tx.delete(agentRuns).where(inArray(agentRuns.id, runIds)); }
        if (aIds.length) { await tx.delete(jobVendorAssignmentStatusHistory).where(inArray(jobVendorAssignmentStatusHistory.assignmentId, aIds)); await tx.delete(auditLogs).where(inArray(auditLogs.targetId, aIds)); await tx.delete(jobVendorAssignments).where(inArray(jobVendorAssignments.id, aIds)); }
        await tx.delete(auditLogs).where(inArray(auditLogs.targetId, jobIds));
        await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, jobIds));
        await tx.delete(jobEvents).where(inArray(jobEvents.jobId, jobIds));
        await tx.delete(jobs).where(inArray(jobs.id, jobIds));
      }
      const vIds = [vLeader, vRunner];
      await tx.delete(locationPreferredVendors).where(inArray(locationPreferredVendors.vendorId, vIds));
      await tx.delete(vendorPerformanceScores).where(inArray(vendorPerformanceScores.vendorId, vIds));
      await tx.delete(vendorTradeCoverage).where(inArray(vendorTradeCoverage.vendorId, vIds));
      await tx.delete(vendorServiceAreas).where(inArray(vendorServiceAreas.vendorId, vIds));
      await tx.delete(vendors).where(inArray(vendors.id, vIds));
      await tx.delete(clientLocations).where(eq(clientLocations.id, locationId));
      await tx.delete(clients).where(eq(clients.id, clientId));
      await tx.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tenantId), eq(agentPolicies.agentId, AGENT)));
      await tx.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tenantId));
      await tx.delete(tenantLlmKeys).where(eq(tenantLlmKeys.tenantId, tenantId));
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
    });
  }
  async function seedCloseCall() {
    await db.insert(clients).values({ id: clientId, tenantId, name: "[K3B2] Client" });
    await db.insert(clientLocations).values({ id: locationId, tenantId, clientId, name: "[K3B2] Loc", addressLine1: "1 Test Way", city: "Metropolis", stateProvince: "NY", postalCode: "10001" });
    for (const [vid, name, rate] of [[vLeader, "[K3B2] Leader", "80.00"], [vRunner, "[K3B2] Runner", "78.00"]] as const) {
      await db.insert(vendors).values({ id: vid, tenantId, name });
      await db.insert(vendorTradeCoverage).values({ id: uuidv7(), tenantId, vendorId: vid, tradeId: hvac!.id, vendorLocationId: null, isPrimary: true, status: "active" });
      await db.insert(vendorServiceAreas).values({ id: uuidv7(), tenantId, vendorId: vid, vendorLocationId: null, areaType: "state", stateCode: "NY", status: "active" });
      await db.insert(vendorPerformanceScores).values({ tenantId, vendorId: vid, tradeId: hvac!.id, totalDispatches: 30, completionRate: rate, status: "active" });
    }
    await db.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tenantId), eq(agentPolicies.agentId, AGENT)));
    await db.insert(agentPolicies).values({ tenantId, clientId: null, agentId: AGENT, policy: { requiresReview: true, tiebreakerMode: "always_on_close_call" }, status: "active" });
  }
  async function mkJob(): Promise<string> {
    const j = await createJob({ tenantId, clientId, clientLocationId: locationId, primaryTradeId: hvac!.id, problemDescription: "Ductless mini-split leaking; need a split-system specialist.", createdByUserId: operator!.id });
    jobIds.push(j.id);
    return j.id;
  }
  async function tiebreakMeta(jobId: string): Promise<Record<string, unknown>> {
    const [run] = await db.select({ id: agentRuns.id }).from(agentRuns).where(and(eq(agentRuns.agentId, TIEBREAKER_AGENT), eq(agentRuns.jobId, jobId))).limit(1);
    if (!run) throw new Error("tiebreaker did not fire (no agent_runs row)");
    const [d] = await db.select({ metadata: agentDecisions.metadata }).from(agentDecisions).where(eq(agentDecisions.agentRunId, run.id)).limit(1);
    const m = d?.metadata;
    return (typeof m === "string" ? JSON.parse(m) : m) as Record<string, unknown>;
  }

  await teardown();
  await seedCloseCall();
  try {
    // (a) no tenant key → platform; capture the baseline dispatch `source`
    await db.delete(tenantLlmKeys).where(eq(tenantLlmKeys.tenantId, tenantId));
    const ma = await tiebreakMeta((await mkJob(), await autoDispatchDraftForJob(tenantId, jobIds[jobIds.length - 1]), jobIds[jobIds.length - 1]));
    console.log("   (a) metadata:", ma);
    assert.equal(ma.keySource, "platform"); assert.equal(ma.tenantKeyError, undefined);
    assert.ok(typeof ma.source === "string" && ma.source.length > 0); // dispatch field present + distinct key
    const baselineSource = ma.source;
    ok("no tenant key → keySource 'platform', no tenantKeyError; metadata.source (dispatch) present");
    ok(`source vs keySource NON-COLLISION (a): source='${baselineSource}' ≠ keySource='platform' (distinct keys)`);

    // (b) seeded key → tenant; source unchanged
    await setTenantLlmKey({ tenantId, provider: "anthropic", plaintextKey: "sk-ant-test-K3B2" });
    const jb = await mkJob(); await autoDispatchDraftForJob(tenantId, jb);
    const mb = await tiebreakMeta(jb);
    console.log("   (b) metadata:", mb);
    assert.equal(mb.keySource, "tenant");
    assert.equal(mb.source, baselineSource); // NOT overwritten by keySource
    ok("seeded key → keySource 'tenant'");
    ok(`source vs keySource NON-COLLISION (b): metadata.source still '${mb.source}' (dispatch field unchanged), keySource='tenant'`);

    // (c) tampered blob → loud-flag fallback; source unchanged
    await db.update(tenantLlmKeys).set({ encryptedKey: "v1:GARBAGE:GARBAGE:GARBAGE" }).where(and(eq(tenantLlmKeys.tenantId, tenantId), eq(tenantLlmKeys.status, "active")));
    const jc = await mkJob(); await autoDispatchDraftForJob(tenantId, jc);
    const mc = await tiebreakMeta(jc);
    console.log("   (c) metadata:", mc);
    assert.equal(mc.tenantKeyError, "decrypt_failed"); assert.equal(mc.keySource, "platform"); assert.equal(mc.source, baselineSource);
    ok("tampered blob → tenantKeyError 'decrypt_failed' + keySource 'platform', source unchanged, never threw");
  } finally {
    await teardown();
    console.log("[k3b2] teardown complete");
  }

  console.log(`\n[k3b2] ${pass} passed`);
  process.exit(0);
}

main().catch((e) => { console.error("[k3b2] ERROR:", e); process.exit(1); });
