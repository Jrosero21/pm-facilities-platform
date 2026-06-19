/**
 * scripts/check-ai-dispatch.ts — AI-assisted dispatch re-rank harness (deterministic half).
 *
 * Proves the deterministic re-rank end-to-end against the LIVE matcher + scorer + governed
 * auto-dispatch, reading the ranking back from the autonomy-never-silent audit row. Autonomy is
 * OFF for the base tenant (platform default {requiresReview:true}, no opt-in), so every scenario
 * lands drafted_pending / not_enabled — the draft + ranking record still prove the pick; nothing
 * is auto-sent. The gate path staying intact IS part of the proof.
 *
 *   S1 — re-rank fires; thin-perfect loses to thick-strong (3 candidates).
 *   S2 — preferred vendor with NO performance row still wins top (4 candidates).
 *   S3 — close-call flag fires when the top two are within the tiebreak epsilon (2 candidates).
 *
 * SANDBOX ONLY. Reuses the phase9-seed-tenant base seed (tenant/operator/HVAC). Self-seeds the
 * candidate fixtures + perf rows and tears down BY TRACKED ID under FK_CHECKS=0. Mirrors
 * scripts/check-phase-23.ts. Run: pnpm run db:check:ai-dispatch
 *
 * DEVIATION (flagged): the matcher's geo eligibility is vendor-wide + tenant-wide (candidacy is
 * trade + state, with NO location<->vendor link), so identical location facets cannot isolate
 * scenarios — every NY/HVAC vendor would be a candidate for every NY job, breaking the exact
 * ranking-length asserts. Each scenario therefore uses a DISTINCT state (S1 NY / S2 NJ / S3 CA)
 * for both the seeded service-area stateCode and the location stateProvince. The state value is
 * load-bearing only as the geo-match key; no assertion depends on it being "NY". The sandbox base
 * has 0 vendor_service_areas, so only the seeded vendors are ever candidates.
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-ai-dispatch] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[check-ai-dispatch] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-ai-dispatch] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const SEED_TENANT_SLUG = "phase9-seed-tenant";
const AGENT = "dispatch_router_v1";
const AUTO_DRAFTED = "job_vendor_assignment.auto_drafted";

type RankEntry = { vendorId: string; preferenceRank: number | null; trackRecordScore: number; hasRecord: boolean };
type RankMeta = {
  rule?: string;
  closeCall?: boolean;
  hasRecord?: boolean;
  preferenceRank?: number | null;
  trackRecordScore?: number;
  ranking?: RankEntry[];
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
  const { createLocationPreferredVendor } = await import("@/server/dispatch-routing");

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
          const runRows = await tx.select({ id: agentRuns.id }).from(agentRuns).where(and(eq(agentRuns.agentId, AGENT), inArray(agentRuns.jobId, createdJobIds)));
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
          // location_preferred_vendor rows + their created-audit rows (targetId = LPV row id)
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
          // defensive: our reused base tenant must carry no enabling policy/kill-switch for AGENT
          await tx.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tAId), eq(agentPolicies.agentId, AGENT)));
          await tx.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tAId));
        }
        // NOTE: phase9-seed-tenant is REUSED — never delete the tenant row.
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
      });
    } catch (e) { console.error("[check-ai-dispatch] teardown warning:", e); }
  }

  try {
    const [tA] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SEED_TENANT_SLUG));
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [hvac] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HVAC"));
    if (!tA || !operator || !hvac) {
      console.error("[check-ai-dispatch] BASE SEED MISSING — need tenant 'phase9-seed-tenant', operator 'operator@phase9seed.test', trade 'HVAC'. Run the base seed first.");
      return finish(2);
    }
    check("setup: base seed (T-A + operator + HVAC) exists", true);
    tAId = tA.id;
    // defensive pre-clean: ensure no leftover enabling policy/kill-switch from a prior partial run
    await db.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tAId), eq(agentPolicies.agentId, AGENT)));
    await db.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tAId));

    // ---- one client; one location per scenario (distinct state — see DEVIATION note) ----
    const clientA = uuidv7();
    await db.insert(clients).values({ id: clientA, tenantId: tAId, name: "AI-dispatch Client A" });
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
    // Seed a candidate vendor: vendors + HVAC primary coverage + state service-area.
    async function seedVendor(name: string, stateCode: string): Promise<string> {
      const id = uuidv7();
      await db.insert(vendors).values({ id, tenantId: tAId, name });
      createdVendorIds.push(id);
      await db.insert(vendorTradeCoverage).values({ id: uuidv7(), tenantId: tAId, vendorId: id, tradeId: hvac.id, vendorLocationId: null, isPrimary: true, status: "active" });
      await db.insert(vendorServiceAreas).values({ id: uuidv7(), tenantId: tAId, vendorId: id, vendorLocationId: null, areaType: "state", stateCode, status: "active" });
      return id;
    }
    // Perf row for (vendor, HVAC): id/period*/computed_at left to default/null (matches the populator).
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
    async function readRanking(assignmentId: string): Promise<RankMeta | null> {
      if (!assignmentId) return null;
      const rows = await db.select({ metadata: auditLogs.metadata }).from(auditLogs)
        .where(and(eq(auditLogs.targetId, assignmentId), eq(auditLogs.action, AUTO_DRAFTED))).limit(1);
      if (!rows[0]) return null;
      const m = rows[0].metadata;
      return (typeof m === "string" ? JSON.parse(m) : (m ?? null)) as RankMeta | null;
    }
    // Shared per-scenario harness: dispatch, silent-break guards, gate-intact + ranking-present checks.
    // Returns { meta, vendorId } or null when a silent-break guard already failed (caller short-circuits).
    async function runScenario(tag: string, jobId: string): Promise<{ meta: RankMeta; vendorId: string } | null> {
      const r = await autoDispatchDraftForJob(tAId, jobId);
      if (r.outcome === "no_candidates") {
        check(`${tag}: SEED produced candidates`, false,
          "matcher returned 0 candidates — check trade-coverage / service-area stateCode vs location stateProvince / postal");
        console.error(`[check-ai-dispatch] SEED FAILED (${tag}): matcher returned 0 candidates — check trade-coverage / service-area stateCode vs location stateProvince / location postal`);
        return null;
      }
      check(`${tag}: gate intact — drafted_pending / not_enabled (autonomy off)`,
        r.outcome === "drafted_pending" && (r as { blockedBy: string }).blockedBy === "not_enabled", JSON.stringify(r));
      const assignmentId = r.outcome === "drafted_pending" ? r.assignmentId : "";
      const vendorId = r.outcome === "drafted_pending" ? r.vendorId : "";
      const meta = await readRanking(assignmentId);
      if (!meta) {
        check(`${tag}: autonomy-never-silent — auto_drafted audit row present`, false,
          "no audit row for assignmentId — autonomy-never-silent broken or assignment not created");
        return null;
      }
      check(`${tag}: ranking record present + rule preferred-then-track-record`, meta.rule === "preferred-then-track-record", JSON.stringify(meta.rule));
      return { meta, vendorId };
    }

    // ════════ S1 — re-rank fires; thin-perfect loses (3 candidates, state NY) ════════
    console.log("\n[S1] re-rank fires + thin-perfect loses (L1 / NY)");
    const L1 = await mkLocation("AI-dispatch Loc L1", "NY");
    const vA = await seedVendor("AID_vA", "NY"); await perf(vA, "95.00", 50);  // shrink ~0.909
    const vB = await seedVendor("AID_vB", "NY"); await perf(vB, "70.00", 20);  // ~0.66
    const vC = await seedVendor("AID_vC", "NY"); await perf(vC, "100.00", 1);  // ~0.583 thin-perfect
    const J1 = await mkJob(L1, "AI-dispatch S1 HVAC job");
    const s1 = await runScenario("S1", J1);
    if (s1) {
      const ids = (s1.meta.ranking ?? []).map((v) => v.vendorId);
      check("S1a: ranking.length === 3", (s1.meta.ranking?.length ?? 0) === 3, JSON.stringify(ids));
      check("S1b: order === [vA, vB, vC]", JSON.stringify(ids) === JSON.stringify([vA, vB, vC]), JSON.stringify(ids));
      check("S1c: closeCall === false", s1.meta.closeCall === false, JSON.stringify(s1.meta.closeCall));
      check("S1d: top hasRecord === true", s1.meta.hasRecord === true, JSON.stringify(s1.meta.hasRecord));
      check("S1e: picked vendor === vA (ranked top)", s1.vendorId === vA, `${s1.vendorId}`);
    }

    // ════════ S2 — preferred with NO record still wins (4 candidates, state NJ) ════════
    console.log("\n[S2] preferred (no record) wins top (L2 / NJ)");
    const L2 = await mkLocation("AI-dispatch Loc L2", "NJ");
    const vA2 = await seedVendor("AID_vA2", "NJ"); await perf(vA2, "95.00", 50);
    const vB2 = await seedVendor("AID_vB2", "NJ"); await perf(vB2, "70.00", 20);
    const vC2 = await seedVendor("AID_vC2", "NJ"); await perf(vC2, "100.00", 1);
    const vP = await seedVendor("AID_vP", "NJ"); // NO perf row
    await createLocationPreferredVendor({ tenantId: tAId, clientLocationId: L2, tradeId: hvac.id, vendorId: vP, priority: 1, createdByUserId: operator.id });
    const J2 = await mkJob(L2, "AI-dispatch S2 HVAC job");
    const s2 = await runScenario("S2", J2);
    if (s2) {
      const ranking = s2.meta.ranking ?? [];
      check("S2a: ranking.length === 4", ranking.length === 4, JSON.stringify(ranking.map((v) => v.vendorId)));
      check("S2b: ranking[0].vendorId === vP", ranking[0]?.vendorId === vP, `${ranking[0]?.vendorId}`);
      check("S2c: ranking[0].preferenceRank === 1", ranking[0]?.preferenceRank === 1, JSON.stringify(ranking[0]?.preferenceRank));
      check("S2d: ranking[0].hasRecord === false", ranking[0]?.hasRecord === false, JSON.stringify(ranking[0]?.hasRecord));
      check("S2e: closeCall === false (preference settles top two)", s2.meta.closeCall === false, JSON.stringify(s2.meta.closeCall));
      check("S2f: picked vendor === vP", s2.vendorId === vP, `${s2.vendorId}`);
    }

    // ════════ S3 — close-call flag fires (2 candidates, state CA) ════════
    console.log("\n[S3] close-call flag fires (L3 / CA)");
    const L3 = await mkLocation("AI-dispatch Loc L3", "CA");
    const vD = await seedVendor("AID_vD", "CA"); await perf(vD, "80.00", 30); // ~0.757
    const vE = await seedVendor("AID_vE", "CA"); await perf(vE, "78.00", 30); // ~0.74 (diff ~0.017 < 0.05)
    const J3 = await mkJob(L3, "AI-dispatch S3 HVAC job");
    const s3 = await runScenario("S3", J3);
    if (s3) {
      const ids = (s3.meta.ranking ?? []).map((v) => v.vendorId);
      check("S3a: top two === [vD, vE]", JSON.stringify(ids.slice(0, 2)) === JSON.stringify([vD, vE]), JSON.stringify(ids));
      check("S3b: closeCall === true", s3.meta.closeCall === true, JSON.stringify(s3.meta.closeCall));
      check("S3c: picked vendor === vD", s3.vendorId === vD, `${s3.vendorId}`);
    }

    return finish(failed.length > 0 ? 1 : 0);
  } finally {
    await teardown();
    console.log("[check-ai-dispatch] teardown complete");
  }
}

let exitCode = 0;
function finish(code: number) {
  exitCode = code;
  console.log("");
  console.log(`[check-ai-dispatch] passed: ${passed}`);
  console.log(`[check-ai-dispatch] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-ai-dispatch] AI-DISPATCH RE-RANK LEDGER RED ✗ — BLOCKED");
  } else if (code === 2) {
    console.log("[check-ai-dispatch] BASE SEED MISSING — could not run.");
  } else {
    console.log("[check-ai-dispatch] AI-DISPATCH RE-RANK LEDGER GREEN ✓ (re-rank + thin-perfect-loses / preferred-no-record-wins / close-call-flag)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : exitCode))
  .catch((e) => { console.error("[check-ai-dispatch] FAILED:", e); process.exit(1); });
