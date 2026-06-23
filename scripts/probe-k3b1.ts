/**
 * scripts/probe-k3b1.ts — K3b-1 probe (CF-23.1). Proves the tenant-key wiring on the REPRESENTATIVE
 * scope-generator orchestrator, both halves:
 *   PART A (offline, no DB): generateScope FORWARDS input.providerKeys → buildProviderModel apiKey
 *     (registry spy; the spy records during buildCandidates, before the stub-model generateObject
 *     throw, which is caught). undefined → singleton (no-op); {anthropic:k} → factory key.
 *   PART B (sandbox, MOCK mode): runScopeGenerator end-to-end → the orchestrator resolves the tenant
 *     key + flags agent_decisions.metadata. (a) no key → keySource "platform"; (b) seeded key →
 *     "tenant"; (c) tampered blob → tenantKeyError "decrypt_failed" + platform fallback (never throws).
 *
 * The other 3 orchestrators (rewriter/invoice/proposal) got the BYTE-IDENTICAL 4-line edit
 * (diff-verified) + tsc; their generateX forwarding is the same one-liner K3a already proved
 * buildCandidates honors. Scope is the live-proven representative.
 *
 *   pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/probe-k3b1.ts
 */

import assert from "node:assert/strict";

const RAW = process.env.DATABASE_URL;
if (!RAW) { console.error("[k3b1] DATABASE_URL not set."); process.exit(2); }
const sandboxUrl = RAW.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) { console.error("[k3b1] refusing: not *_sandbox."); process.exit(2); }
process.env.DATABASE_URL = sandboxUrl;
console.log(`[k3b1] sandbox target confirmed: ${sandboxUrl.replace(/\/\/[^@]+@/, "//<creds>@")}`);

const MARKER = "[K3B1]";
const TENANT_SLUG = "phase9-seed-tenant";

async function main() {
  // direct-mode platform key (Part A reads it for routing); a fake — no network is ever made.
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "sk-ant-FAKE-platform";

  let pass = 0;
  const ok = (n: string) => { pass++; console.log(`  ok ${n}`); };

  // ───────────────────────── PART A — offline apiKey-flow (scope generateScope) ─────────────────────────
  console.log("\nPART A — generateScope forwards input.providerKeys → buildProviderModel (offline)");
  const { PROVIDER_REGISTRY } = await import("@/server/agents/providers");
  const { generateScope } = await import("@/server/agents/scope-generator/llm");
  const realBuild = PROVIDER_REGISTRY.anthropic.buildModel;
  const seenKeys: Array<string | undefined> = [];
  const routing = { mode: "direct" as const, provider: "anthropic" as const, modelId: "claude-sonnet-4-6", recordedModel: "anthropic/claude-sonnet-4-6" };
  const job = { problemDescription: "AC leak", tradeName: "HVAC", clientName: "X", locationName: "Y", priorityName: "P2" };
  try {
    PROVIDER_REGISTRY.anthropic.buildModel = (_b: string, apiKey?: string) => { seenKeys.push(apiKey); return {} as unknown as ReturnType<typeof realBuild>; };
    const callScope = (providerKeys: Record<string, string> | undefined) =>
      generateScope({ routing, systemPrompt: "s", job, temperature: 0.2, providerKeys, fewShot: [] } as unknown as Parameters<typeof generateScope>[0]);

    seenKeys.length = 0;
    try { await callScope(undefined); } catch { /* stub model → generateObject throws; spy already recorded */ }
    assert.ok(seenKeys.length >= 1, "buildCandidates was reached (spy recorded)");
    assert.ok(seenKeys.every((k) => k === undefined));
    ok("no providerKeys → buildProviderModel got apiKey undefined (env singleton, no-op)");

    seenKeys.length = 0;
    try { await callScope({ anthropic: "sk-probe" }); } catch { /* same */ }
    assert.ok(seenKeys.length >= 1 && seenKeys.every((k) => k === "sk-probe"));
    ok("providerKeys {anthropic:sk-probe} → buildProviderModel got the tenant key (factory)");
  } finally {
    PROVIDER_REGISTRY.anthropic.buildModel = realBuild;
  }

  // ───────────────────────── PART B — live orchestrator metadata (mock mode, sandbox) ─────────────────────────
  console.log("\nPART B — runScopeGenerator flags agent_decisions.metadata.keySource (live, mock mode)");
  const { generateSecretKey } = await import("@/server/security/secret-crypto");
  process.env.SECRET_ENCRYPTION_KEY = generateSecretKey(); // in-process test master key
  process.env.AGENT_MOCK = "1"; // global mock → generateScope returns mock; resolveLlmKey + logDecision still run

  const { db } = await import("@/server/db");
  const { tenants, clients, clientLocations, trades, users, jobs, jobStatusHistory, jobEvents, auditLogs,
    agentRuns, agentDecisions, agentToolCalls, tenantLlmKeys, jobScopeDrafts, jobScopeSteps, jobScopeReviews } = await import("@/server/schema");
  const { eq, and, inArray, like, sql } = await import("drizzle-orm");
  const { createJob } = await import("@/server/jobs");
  const { runScopeGenerator } = await import("@/server/agents/scope-generator");
  const { setTenantLlmKey } = await import("@/server/security/llm-keys");

  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  if (!/_sandbox$/.test(dbRows[0]?.db ?? "")) { console.error("[k3b1] ABORT: not *_sandbox."); process.exit(2); }
  console.log("[k3b1] connected DB confirmed:", dbRows[0]?.db);

  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TENANT_SLUG)).limit(1);
  const tenantId = tenant!.id;
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, tenantId)).limit(1);
  const [location] = await db.select({ id: clientLocations.id }).from(clientLocations).where(and(eq(clientLocations.tenantId, tenantId), eq(clientLocations.clientId, client!.id))).limit(1);
  const [trade] = await db.select({ id: trades.id }).from(trades).limit(1);
  const creatorId = (await db.select({ id: users.id }).from(users).limit(1))[0]!.id;

  async function teardown() {
    const jIds = (await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.tenantId, tenantId), like(jobs.problemDescription, `${MARKER}%`)))).map((j) => j.id);
    const runIds = jIds.length ? (await db.select({ id: agentRuns.id }).from(agentRuns).where(inArray(agentRuns.jobId, jIds))).map((r) => r.id) : [];
    const draftIds = jIds.length ? (await db.select({ id: jobScopeDrafts.id }).from(jobScopeDrafts).where(inArray(jobScopeDrafts.jobId, jIds))).map((d) => d.id) : [];
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
      if (jIds.length) await tx.delete(jobScopeSteps).where(inArray(jobScopeSteps.jobId, jIds));
      if (draftIds.length) { await tx.delete(jobScopeReviews).where(inArray(jobScopeReviews.draftId, draftIds)); await tx.delete(jobScopeDrafts).where(inArray(jobScopeDrafts.id, draftIds)); }
      if (runIds.length) { await tx.delete(agentDecisions).where(inArray(agentDecisions.agentRunId, runIds)); await tx.delete(agentToolCalls).where(inArray(agentToolCalls.agentRunId, runIds)); await tx.delete(agentRuns).where(inArray(agentRuns.id, runIds)); }
      if (jIds.length) { await tx.delete(auditLogs).where(inArray(auditLogs.targetId, jIds)); await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, jIds)); await tx.delete(jobEvents).where(inArray(jobEvents.jobId, jIds)); await tx.delete(jobs).where(inArray(jobs.id, jIds)); }
      await tx.delete(tenantLlmKeys).where(eq(tenantLlmKeys.tenantId, tenantId));
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
    });
    return { jobs: jIds.length, runs: runIds.length };
  }

  async function metaFor(runId: string): Promise<Record<string, unknown>> {
    const [d] = await db.select({ metadata: agentDecisions.metadata }).from(agentDecisions).where(eq(agentDecisions.agentRunId, runId)).limit(1);
    const m = d?.metadata;
    return (typeof m === "string" ? JSON.parse(m) : m) as Record<string, unknown>;
  }
  async function seedJob(): Promise<string> {
    const j = await createJob({ tenantId, clientId: client!.id, clientLocationId: location!.id, primaryTradeId: trade!.id, notToExceedAmount: "500.00", problemDescription: `${MARKER} scope`, createdByUserId: creatorId });
    return j.id;
  }

  console.log("[k3b1] pre-clean:", await teardown());
  try {
    // (a) no tenant key → platform
    await db.delete(tenantLlmKeys).where(eq(tenantLlmKeys.tenantId, tenantId));
    const ra = await runScopeGenerator({ tenantId, jobId: await seedJob() });
    const ma = await metaFor(ra.runId);
    console.log("   (a) metadata:", ma);
    assert.equal(ma.keySource, "platform"); assert.equal(ma.tenantKeyError, undefined);
    ok("no tenant key → metadata keySource 'platform', no tenantKeyError (backward-compatible)");

    // (b) seeded key → tenant
    await setTenantLlmKey({ tenantId, provider: "anthropic", plaintextKey: "sk-ant-test-K3B1" });
    const rb = await runScopeGenerator({ tenantId, jobId: await seedJob() });
    const mb = await metaFor(rb.runId);
    console.log("   (b) metadata:", mb);
    assert.equal(mb.keySource, "tenant");
    ok("seeded tenant key → metadata keySource 'tenant'");

    // (c) tampered blob → loud-flag fallback
    await db.update(tenantLlmKeys).set({ encryptedKey: "v1:GARBAGE:GARBAGE:GARBAGE" }).where(and(eq(tenantLlmKeys.tenantId, tenantId), eq(tenantLlmKeys.status, "active")));
    const rc = await runScopeGenerator({ tenantId, jobId: await seedJob() });
    const mc = await metaFor(rc.runId);
    console.log("   (c) metadata:", mc);
    assert.equal(mc.tenantKeyError, "decrypt_failed"); assert.equal(mc.keySource, "platform");
    ok("tampered blob → metadata tenantKeyError 'decrypt_failed' + keySource 'platform' (never threw)");
  } finally {
    console.log("[k3b1] teardown:", await teardown());
  }

  console.log(`\n[k3b1] ${pass} passed`);
  process.exit(0);
}

main().catch((e) => { console.error("[k3b1] ERROR:", e); process.exit(1); });
