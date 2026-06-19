/**
 * scripts/probe-ai-dispatch-realkey.ts — CF-AID.2 live real-key tiebreak probe.
 *
 * STANDALONE, MANUAL, SANDBOX-ONLY. Makes ONE real billed Anthropic call: seeds a close-call
 * pair where the runner-up is the better SEMANTIC fit (job asks for a split-system specialist;
 * the deterministic leader is a rooftop-RTU shop), forces the tiebreaker to fire, and reports
 * whether the live LLM swaps to the runner-up. NOT in CI — keys stay present (the opposite of
 * scripts/check-ai-dispatch.ts, which unsets them for the mock path). Self-seeds + tears down by
 * tracked id; NEVER deletes the reused base tenant.
 *
 * Run: pnpm run probe:ai-dispatch-realkey
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[probe-realkey] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[probe-realkey] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[probe-realkey] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);
// NOTE: keys stay present — this probe WANTS the real provider. (No process.env delete here.)

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const SEED_TENANT_SLUG = "phase9-seed-tenant";
const AGENT = "dispatch_router_v1";
const TIEBREAKER_AGENT = "dispatch_tiebreaker_v1";
const AUTO_DRAFTED = "job_vendor_assignment.auto_drafted";

type RankMeta = {
  tiebreakSource?: string;
  tiebreakChangedPick?: boolean;
  tiebreakRationale?: string | null;
  vendorId?: string;
};

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, jobs, jobStatusHistory, jobEvents,
    vendors, trades, vendorTradeCoverage, vendorServiceAreas, vendorPerformanceScores,
    jobVendorAssignments, jobVendorAssignmentStatusHistory,
    auditLogs, users, agentRuns, agentDecisions, agentPolicies, tenantAutonomySettings,
    locationPreferredVendors,
  } = await import("@/server/schema");
  const { eq, and, inArray, sql } = await import("drizzle-orm");
  const { createJob } = await import("@/server/jobs");
  const { autoDispatchDraftForJob } = await import("@/server/auto-dispatch");
  const { resolveAgentPolicy } = await import("@/server/agents/config/policies");
  const { resolveDispatchTiebreakerRouting } = await import("@/server/agents/dispatch-tiebreaker/llm");
  const { resolveActivePrompt } = await import("@/server/agents/config/prompts");

  const createdClientIds: string[] = [];
  const createdLocationIds: string[] = [];
  const createdVendorIds: string[] = [];
  const createdJobIds: string[] = [];
  let tAId = "";

  async function teardown() {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
        if (createdJobIds.length) {
          const aRows = await tx.select({ id: jobVendorAssignments.id }).from(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, createdJobIds));
          const aIds = aRows.map((r) => r.id);
          const runRows = await tx.select({ id: agentRuns.id }).from(agentRuns).where(and(inArray(agentRuns.agentId, [AGENT, TIEBREAKER_AGENT]), inArray(agentRuns.jobId, createdJobIds)));
          const runIds = runRows.map((r) => r.id);
          if (runIds.length) {
            await tx.delete(agentDecisions).where(inArray(agentDecisions.agentRunId, runIds));
            await tx.delete(agentRuns).where(inArray(agentRuns.id, runIds));
          }
          if (aIds.length) {
            await tx.delete(jobVendorAssignmentStatusHistory).where(inArray(jobVendorAssignmentStatusHistory.assignmentId, aIds));
            await tx.delete(auditLogs).where(inArray(auditLogs.targetId, aIds)); // auto_drafted
            await tx.delete(jobVendorAssignments).where(inArray(jobVendorAssignments.id, aIds));
          }
          await tx.delete(auditLogs).where(inArray(auditLogs.targetId, createdJobIds)); // job.created
          await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, createdJobIds));
          await tx.delete(jobEvents).where(inArray(jobEvents.jobId, createdJobIds));
          await tx.delete(jobs).where(inArray(jobs.id, createdJobIds));
        }
        if (createdVendorIds.length) {
          const lpvRows = await tx.select({ id: locationPreferredVendors.id }).from(locationPreferredVendors).where(inArray(locationPreferredVendors.vendorId, createdVendorIds));
          const lpvIds = lpvRows.map((r) => r.id);
          if (lpvIds.length) await tx.delete(auditLogs).where(inArray(auditLogs.targetId, lpvIds));
          await tx.delete(locationPreferredVendors).where(inArray(locationPreferredVendors.vendorId, createdVendorIds));
          await tx.delete(vendorPerformanceScores).where(inArray(vendorPerformanceScores.vendorId, createdVendorIds));
          await tx.delete(vendorTradeCoverage).where(inArray(vendorTradeCoverage.vendorId, createdVendorIds));
          await tx.delete(vendorServiceAreas).where(inArray(vendorServiceAreas.vendorId, createdVendorIds));
          await tx.delete(vendors).where(inArray(vendors.id, createdVendorIds));
        }
        if (createdLocationIds.length) await tx.delete(clientLocations).where(inArray(clientLocations.id, createdLocationIds));
        if (createdClientIds.length) await tx.delete(clients).where(inArray(clients.id, createdClientIds));
        if (tAId) {
          await tx.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tAId), eq(agentPolicies.agentId, AGENT)));
          await tx.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tAId));
        }
        // NOTE: phase9-seed-tenant is REUSED — never delete the tenant row.
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
      });
    } catch (e) { console.error("[probe-realkey] teardown warning:", e); }
  }

  try {
    const [tA] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SEED_TENANT_SLUG));
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [hvac] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HVAC"));
    if (!tA || !operator || !hvac) {
      console.error("[probe-realkey] BASE SEED MISSING — need tenant 'phase9-seed-tenant', operator 'operator@phase9seed.test', trade 'HVAC'.");
      return finish(2);
    }
    check("setup: base seed (T-A + operator + HVAC) exists", true);
    tAId = tA.id;
    // defensive pre-clean of any leftover tenant policy for AGENT
    await db.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tAId), eq(agentPolicies.agentId, AGENT)));

    const clientA = uuidv7();
    await db.insert(clients).values({ id: clientA, tenantId: tAId, name: "AI-dispatch realkey Client" });
    createdClientIds.push(clientA);

    async function mkLocation(name: string, stateProvince: string): Promise<string> {
      const id = uuidv7();
      await db.insert(clientLocations).values({
        id, tenantId: tAId, clientId: clientA, name,
        addressLine1: "1 Test Way", city: "Metropolis", stateProvince, postalCode: "10001",
      });
      createdLocationIds.push(id);
      return id;
    }
    async function seedVendor(name: string, stateCode: string): Promise<string> {
      const id = uuidv7();
      await db.insert(vendors).values({ id, tenantId: tAId, name });
      createdVendorIds.push(id);
      await db.insert(vendorTradeCoverage).values({ id: uuidv7(), tenantId: tAId, vendorId: id, tradeId: hvac.id, vendorLocationId: null, isPrimary: true, status: "active" });
      await db.insert(vendorServiceAreas).values({ id: uuidv7(), tenantId: tAId, vendorId: id, vendorLocationId: null, areaType: "state", stateCode, status: "active" });
      return id;
    }
    async function perf(vendorId: string, completionRate: string, totalDispatches: number): Promise<void> {
      await db.insert(vendorPerformanceScores).values({
        tenantId: tAId, vendorId, tradeId: hvac.id, totalDispatches, completionRate, status: "active",
      });
    }
    async function mkJob(locationId: string, label: string): Promise<string> {
      const j = await createJob({ tenantId: tAId, clientId: clientA, clientLocationId: locationId, primaryTradeId: hvac.id, problemDescription: label, createdByUserId: operator.id });
      createdJobIds.push(j.id);
      return j.id;
    }

    // ---- the close-call scenario: runner-up is the better SEMANTIC fit ----
    const L = await mkLocation("AI-dispatch realkey Loc", "NY");
    const vLEADER = await seedVendor("Metro Rooftop RTU Specialists", "NY"); await perf(vLEADER, "80.00", 30);  // ~0.757 → #1
    const vRUNNER = await seedVendor("Apex Split-System & Ductless Pros", "NY"); await perf(vRUNNER, "78.00", 30); // ~0.740 → #2, within epsilon
    const J = await mkJob(L, "Ductless mini-split head in the back office is leaking and not cooling; need a split-system specialist.");

    // Enable firing on the ROUTER policy (mode read off resolved.raw of dispatch_router_v1). autonomy stays OFF.
    await db.insert(agentPolicies).values({
      tenantId: tAId, clientId: null, agentId: AGENT,
      policy: { requiresReview: true, tiebreakerMode: "always_on_close_call" }, status: "active",
    });

    // ════════ PRE-CALL HARD GATES (abort before the billed call if any fail) ════════
    console.log("\n[pre-call gates]");
    const routing = resolveDispatchTiebreakerRouting();
    const routingOk = routing.mode === "direct" && (routing as { provider?: string }).provider === "anthropic";
    check("gate: routing is direct/anthropic (real key loaded, NOT mock)", routingOk, JSON.stringify(routing));
    if (!routingOk) {
      console.error("[probe-realkey] KEY NOT LOADED — routing is mock, aborting before any call");
      return finish(2);
    }
    const res = await resolveAgentPolicy(tAId, AGENT, clientA);
    const resMode = (res.raw as { tiebreakerMode?: unknown } | null)?.tiebreakerMode;
    const policyOk = resMode === "always_on_close_call" && res.autonomyEnabled === false;
    check("gate: resolver sees tiebreakerMode='always_on_close_call' + autonomy off", policyOk, JSON.stringify({ resMode, autonomyEnabled: res.autonomyEnabled }));
    if (!policyOk) { console.error("[probe-realkey] firing not enabled as expected — aborting before any call"); return finish(2); }
    let promptOk = false;
    try { await resolveActivePrompt(tAId, TIEBREAKER_AGENT); promptOk = true; } catch (e) { promptOk = false; console.error(`[probe-realkey] resolveActivePrompt threw: ${(e as Error).message}`); }
    check("gate: resolveActivePrompt(dispatch_tiebreaker_v1) resolves (does not throw)", promptOk);
    if (!promptOk) { console.error("[probe-realkey] tiebreaker prompt missing in sandbox — aborting before any call"); return finish(2); }

    // ════════ THE BILLED CALL ════════
    console.log("\n[live call] invoking autoDispatchDraftForJob → ONE real Anthropic call inside the tiebreaker…");
    const r = await autoDispatchDraftForJob(tAId, J);

    // ---- read back the tiebreaker run ----
    const tbRuns = await db.select({
      status: agentRuns.status, model: agentRuns.model,
      inputTokens: agentRuns.inputTokens, outputTokens: agentRuns.outputTokens,
      errorMessage: agentRuns.errorMessage,
    }).from(agentRuns).where(and(eq(agentRuns.tenantId, tAId), eq(agentRuns.agentId, TIEBREAKER_AGENT), eq(agentRuns.jobId, J)));
    const tb = tbRuns[0];
    console.log("\n[tiebreaker run]");
    console.log(`  status=${tb?.status}  model=${tb?.model}  inputTokens=${tb?.inputTokens}  outputTokens=${tb?.outputTokens}`);
    if (tb?.status === "failed") console.log(`  errorMessage=${tb?.errorMessage}`);
    check("run: exactly 1 dispatch_tiebreaker_v1 run for the job", tbRuns.length === 1, `runs=${tbRuns.length}`);
    check("run: model is NOT 'mock' (a real provider was used)", tb?.model !== "mock", JSON.stringify(tb?.model));
    if (tb?.status === "succeeded") {
      check("run: succeeded with real anthropic/ model + >0 tokens", String(tb?.model).startsWith("anthropic/") && Number(tb?.inputTokens) > 0 && Number(tb?.outputTokens) > 0, JSON.stringify(tb));
    }

    // ---- read back the auto_drafted audit metadata ----
    const assignmentId = r.outcome === "drafted_pending" ? r.assignmentId : "";
    const auditRows = assignmentId
      ? await db.select({ metadata: auditLogs.metadata }).from(auditLogs).where(and(eq(auditLogs.targetId, assignmentId), eq(auditLogs.action, AUTO_DRAFTED))).limit(1)
      : [];
    const meta = (auditRows[0] ? (typeof auditRows[0].metadata === "string" ? JSON.parse(auditRows[0].metadata) : auditRows[0].metadata) : null) as RankMeta | null;
    const draftedVendor = r.outcome === "drafted_pending" ? r.vendorId : (meta?.vendorId ?? null);
    console.log("\n[draft + tiebreak decision]");
    console.log(`  draftedVendorId=${draftedVendor}`);
    console.log(`  tiebreakSource=${meta?.tiebreakSource}  tiebreakChangedPick=${meta?.tiebreakChangedPick}`);
    console.log(`  tiebreakRationale=${meta?.tiebreakRationale ?? "(none)"}`);
    console.log(`  vLEADER=${vLEADER} (Metro Rooftop RTU Specialists)`);
    console.log(`  vRUNNER=${vRUNNER} (Apex Split-System & Ductless Pros)`);

    // ---- verdict (printed, not hard-asserted on swap) ----
    console.log("\n[verdict]");
    if (tb?.status === "failed") {
      console.log(`  ⚑ TIEBREAKER CALL FAILED: ${tb?.errorMessage} — deterministic leader stood (degradation path verified, valid outcome).`);
    } else if (meta?.tiebreakChangedPick === true && draftedVendor === vRUNNER) {
      console.log(`  ★ LIVE SWAP: AI chose the runner-up (better semantic fit) — ${meta?.tiebreakRationale}`);
    } else if (meta?.tiebreakChangedPick === true && draftedVendor === vLEADER) {
      console.log(`  ? AI confirmed leader (changed flag set but drafted the leader — report honestly): ${meta?.tiebreakRationale}`);
    } else {
      console.log(`  • NO SWAP: AI returned low-confidence or chose the leader — deterministic stood. (Valid outcome.) rationale=${meta?.tiebreakRationale ?? "(none)"}`);
    }

    // ---- hard: router gate unchanged (autonomy off → nothing auto-sent) ----
    check("router: still drafted_pending / not_enabled (autonomy off — nothing auto-sent)",
      r.outcome === "drafted_pending" && (r as { blockedBy: string }).blockedBy === "not_enabled", JSON.stringify(r));

    return finish(failed.length > 0 ? 1 : 0);
  } finally {
    await teardown();
    console.log("[probe-realkey] teardown complete");
  }
}

let exitCode = 0;
function finish(code: number) {
  exitCode = code;
  console.log("");
  console.log(`[probe-realkey] passed: ${passed}`);
  console.log(`[probe-realkey] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : exitCode))
  .catch((e) => { console.error("[probe-realkey] FAILED:", e); process.exit(1); });
