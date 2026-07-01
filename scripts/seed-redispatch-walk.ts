/**
 * scripts/seed-redispatch-walk.ts — KEPT walkable scenario for the re-dispatch UI (Phase 28).
 *
 * Leaves a stuck vendor_not_accepted exception with an ELIGIBLE ALTERNATE so the browser walk can
 * exercise the re-dispatch flow. Namespaced [RD-WALK]; persists; SANDBOX ONLY.
 *
 * TWO MODES:
 *   • DEFAULT (rung-1 manual walk) — Suggest → suggestion_ready → Approve:
 *       pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/seed-redispatch-walk.ts
 *   • AUTONOMY (T2a "Auto-retry now" fires) — WALK_AUTONOMY=1 ADDITIONALLY sets an autonomyEnabled
 *     dispatch_router_v1 policy (conditions maxNteAmount 1000, the $800 job PASSES) + ensures no
 *     blocking tenant_autonomy_settings, so clicking "Auto-retry now" AUTO-SENDS:
 *       WALK_AUTONOMY=1 pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/seed-redispatch-walk.ts
 *   • TEARDOWN — removes the walk rows AND the autonomy policy AND the live-click agent runs:
 *       pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/seed-redispatch-walk.ts teardown
 *
 * The walk job carries a measurable NTE ($800) in BOTH modes (harmless to the rung-1 walk; required
 * for the autonomous path's spend gate — a null NTE blocks on unmeasurable_nte).
 */

export {};

// ===== SANDBOX GUARD =====
const RAW = process.env.DATABASE_URL;
if (!RAW) { console.error("[rd-walk] DATABASE_URL not set — refusing."); process.exit(2); }
const sandboxUrl = RAW.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[rd-walk] refusing: resolved URL is not a *_sandbox DB."); process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[rd-walk] sandbox target confirmed: ${sandboxUrl.replace(/\/\/[^@]+@/, "//<creds>@")}`);

const MARKER = "[RD-WALK]";
const TENANT_SLUG = "phase9-seed-tenant";
const OPERATOR_EMAIL = "operator@phase9seed.test";
const DISPATCH_AGENT_ID = "dispatch_router_v1";

async function main() {
  const mode = process.argv.includes("teardown") ? "teardown" : "seed";
  const autonomy = process.env.WALK_AUTONOMY === "1";

  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, trades, users,
    vendors, vendorLocations, vendorTradeCoverage, vendorServiceAreas,
    jobs, jobVendorAssignments, jobStatusHistory, jobEvents,
    jobVendorAssignmentStatusHistory, auditLogs,
    agentPolicies, tenantAutonomySettings, agentRuns, agentDecisions,
  } = await import("@/server/schema");
  const { eq, and, inArray, like, or, sql } = await import("drizzle-orm");
  const { v7: uuidv7 } = await import("uuid");
  const { createJob } = await import("@/server/jobs");
  const { createDispatch, sendDispatch } = await import("@/server/dispatch");
  const { activateAgentPolicy } = await import("@/server/agents/config/policies");
  const { conditionsSchema } = await import("@/server/agents/config/conditions");

  const { rows: dbRows } = (await db.execute(sql`SELECT current_database() AS db`)) as unknown as { rows: { db: string }[] };
  const dbName = dbRows[0]?.db ?? "";
  if (!/_sandbox$/.test(dbName)) { console.error(`[rd-walk] ABORT: DB "${dbName}" is not *_sandbox.`); process.exit(2); }
  console.log("[rd-walk] connected DB confirmed:", dbName);

  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TENANT_SLUG)).limit(1);
  if (!tenant) { console.error("[rd-walk] phase9-seed-tenant not found."); process.exit(2); }
  const tenantId = tenant.id;

  // ---------- TEARDOWN (removes walk rows + the live-click agent runs + the autonomy policy) ----------
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
    // The autonomy policy the walk set (tenant-level dispatch_router_v1) — phase9-seed-tenant had none before.
    const polRows = await db.select({ id: agentPolicies.id }).from(agentPolicies)
      .where(and(eq(agentPolicies.tenantId, tenantId), sql`${agentPolicies.clientId} IS NULL`, eq(agentPolicies.agentId, DISPATCH_AGENT_ID)));
    const polCount = polRows.length;
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
      // Remove the walk's autonomy policy — leaves NO enabled autonomous policy on the seed tenant.
      await tx.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tenantId), eq(agentPolicies.agentId, DISPATCH_AGENT_ID)));
    });
    return { jobs: jIds.length, vendors: vIds.length, assignments: aIds.length, agentRuns: runIds.length, autonomyPolicies: polCount };
  }

  if (mode === "teardown") {
    console.log("[rd-walk] teardown:", await teardown());
    process.exit(0);
  }

  // Idempotent: clear any prior [RD-WALK] rows (+ policy/runs) before re-seeding.
  await teardown();

  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, tenantId)).limit(1);
  const [location] = await db.select({ id: clientLocations.id }).from(clientLocations).where(and(eq(clientLocations.tenantId, tenantId), eq(clientLocations.clientId, client!.id))).limit(1);
  const [trade] = await db.select({ id: trades.id }).from(trades).limit(1);
  const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, OPERATOR_EMAIL)).limit(1);
  const creatorId = operator?.id ?? (await db.select({ id: users.id }).from(users).limit(1))[0]!.id;
  if (!client || !location || !trade) { console.error("[rd-walk] missing client/location/trade — run phase9 seed."); process.exit(2); }

  async function makeVendor(label: string): Promise<string> {
    const vid = uuidv7();
    await db.insert(vendors).values({ id: vid, tenantId, name: `${MARKER} ${label}` });
    await db.insert(vendorLocations).values({ id: uuidv7(), tenantId, vendorId: vid, name: `${label} HQ`, addressLine1: "1 Walk Rd", city: "Metropolis", stateProvince: "NY", postalCode: "10001" });
    await db.insert(vendorTradeCoverage).values({ tenantId, vendorId: vid, tradeId: trade!.id, status: "active", isPrimary: true });
    await db.insert(vendorServiceAreas).values({ tenantId, vendorId: vid, areaType: "national", status: "active" });
    return vid;
  }

  // measurable NTE ($800) in BOTH modes — harmless to the rung-1 walk; required for the autonomous spend gate.
  const job = await createJob({ tenantId, clientId: client.id, clientLocationId: location.id, primaryTradeId: trade.id, notToExceedAmount: "800.00", problemDescription: `${MARKER} walk-the-redispatch-flow`, createdByUserId: creatorId });
  const vA = await makeVendor("Vendor A (stuck)");
  await makeVendor("Vendor B (eligible alternate)"); // not assigned — the matcher will suggest it

  const a = await createDispatch({ tenantId, jobId: job.id, vendorId: vA, createdByUserId: creatorId, agreedNteAmount: "500.00", dispatchScope: `${MARKER} fix the unit` });
  await sendDispatch({ tenantId, assignmentId: a.id, actorUserId: creatorId });
  // backdate sent_at past the DEFAULT 24h threshold (job has no priority) so CF-19.1a flags it stuck.
  await db.update(jobVendorAssignments).set({ sentAt: sql`(NOW() - INTERVAL '30 hour')` }).where(eq(jobVendorAssignments.id, a.id));

  console.log(`\n[rd-walk] SEEDED:`);
  console.log(`  job        #${job.jobNumber}  id=${job.id}  (NTE $800)`);
  console.log(`  stuck SENT assignment (Vendor A): ${a.id}`);
  console.log(`  eligible alternate: Vendor B (unassigned)`);

  if (autonomy) {
    // (c) ensure no blocking tenant_autonomy_settings (kill-switch / ceilings) — clear only if present + blocking.
    const tas = (await db.select().from(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tenantId)).limit(1))[0] ?? null;
    if (tas && (tas.killSwitch || tas.maxCommittedPerJob || tas.maxCommittedPerDay || tas.maxCommittedPerTenant || tas.maxLlmTokensPerDay || tas.maxLlmTokensPerTenant)) {
      console.log(`  [autonomy] prior tenant_autonomy_settings would BLOCK (killSwitch=${tas.killSwitch}, caps set) — clearing it for the walk (NOT auto-restored; recreate if intentional).`);
      await db.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tenantId));
    } else {
      console.log(`  [autonomy] tenant_autonomy_settings: ${tas ? "present, non-blocking" : "none"} — autonomy not blocked by kill-switch/ceilings.`);
    }

    // (b) set an autonomyEnabled dispatch_router_v1 policy (validated), so $800 <= 1000 PASSES → auto-send.
    const conditions = conditionsSchema.parse({ maxNteAmount: 1000 });
    const policy = { requiresReview: false, autonomyEnabled: true, conditions };
    const polId = uuidv7();
    await db.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tenantId), sql`${agentPolicies.clientId} IS NULL`, eq(agentPolicies.agentId, DISPATCH_AGENT_ID)));
    await db.insert(agentPolicies).values({ id: polId, tenantId, clientId: null, agentId: DISPATCH_AGENT_ID, policy, status: "draft" });
    await activateAgentPolicy({ tenantId, agentId: DISPATCH_AGENT_ID, clientId: null, id: polId });
    console.log(`  [autonomy] policy set: dispatch_router_v1 tenant-level { autonomyEnabled: true, conditions: { maxNteAmount: 1000 } }`);

    console.log(`\n  AUTONOMY WALK READY. Log in as jnrosero@gmail.com on sandbox → /notifications → find the`);
    console.log(`  Stuck row for job #${job.jobNumber} → click "Auto-retry now" → expect: Vendor A → GHOSTED,`);
    console.log(`  Vendor B → SENT, outcome line "Auto-re-dispatched to the next vendor". (The manual`);
    console.log(`  "Suggest replacement" button also still works.)`);
  } else {
    console.log(`\n  Walk (manual): /notifications → the Stuck "Vendor not accepted" row → "Suggest replacement"`);
    console.log(`        → /jobs/${job.id}/dispatch/<draftId> → "Approve re-dispatch"`);
    console.log(`        → expect Vendor A GHOSTED + Vendor B SENT + job stays Dispatched.`);
    console.log(`  (For the AUTONOMOUS "Auto-retry now" walk, re-run with WALK_AUTONOMY=1.)`);
  }
  console.log(`\n  Clean up later:  pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/seed-redispatch-walk.ts teardown`);
  process.exit(0);
}

main().catch((e) => { console.error("[rd-walk] ERROR:", e); process.exit(1); });
