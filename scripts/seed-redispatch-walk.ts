/**
 * scripts/seed-redispatch-walk.ts — KEPT walkable scenario for the re-dispatch UI (Phase 28 4b).
 *
 * Leaves a stuck vendor_not_accepted exception with an ELIGIBLE ALTERNATE so the browser walk can
 * exercise Suggest → suggestion_ready → Approve (the SENT-spread seed leaves no eligible alternate:
 * phase9 vendors have no trade coverage, so its stuck rows would only ever hit no_eligible_vendor).
 *
 * NOT self-teardown — it persists. Namespaced [RD-WALK] in job/vendor names so it is findable +
 * removable. SANDBOX ONLY.
 *
 *   pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/seed-redispatch-walk.ts
 *   pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/seed-redispatch-walk.ts teardown
 */

export {};

// ===== SANDBOX GUARD =====
const RAW = process.env.DATABASE_URL;
if (!RAW) { console.error("[rd-walk] DATABASE_URL not set — refusing."); process.exit(2); }
const sandboxUrl = RAW.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[rd-walk] refusing: resolved URL is not a *_sandbox DB."); process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[rd-walk] sandbox target confirmed: ${sandboxUrl.replace(/\/\/[^@]+@/, "//<creds>@")}`);

const MARKER = "[RD-WALK]";
const TENANT_SLUG = "phase9-seed-tenant";
const OPERATOR_EMAIL = "operator@phase9seed.test";

async function main() {
  const mode = process.argv.includes("teardown") ? "teardown" : "seed";

  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, trades, users,
    vendors, vendorLocations, vendorTradeCoverage, vendorServiceAreas,
    jobs, jobVendorAssignments, jobStatusHistory, jobEvents,
    jobVendorAssignmentStatusHistory, auditLogs,
  } = await import("@/server/schema");
  const { eq, and, inArray, like, or, sql } = await import("drizzle-orm");
  const { v7: uuidv7 } = await import("uuid");
  const { createJob } = await import("@/server/jobs");
  const { createDispatch, sendDispatch } = await import("@/server/dispatch");

  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  const dbName = dbRows[0]?.db ?? "";
  if (!/_sandbox$/.test(dbName)) { console.error(`[rd-walk] ABORT: DB "${dbName}" is not *_sandbox.`); process.exit(2); }
  console.log("[rd-walk] connected DB confirmed:", dbName);

  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TENANT_SLUG)).limit(1);
  if (!tenant) { console.error("[rd-walk] phase9-seed-tenant not found."); process.exit(2); }
  const tenantId = tenant.id;

  // ---------- TEARDOWN ----------
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
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
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
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
    });
    return { jobs: jIds.length, vendors: vIds.length, assignments: aIds.length };
  }

  if (mode === "teardown") {
    console.log("[rd-walk] teardown:", await teardown());
    process.exit(0);
  }

  // Idempotent: clear any prior [RD-WALK] rows before re-seeding.
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

  const job = await createJob({ tenantId, clientId: client.id, clientLocationId: location.id, primaryTradeId: trade.id, problemDescription: `${MARKER} walk-the-redispatch-flow`, createdByUserId: creatorId });
  const vA = await makeVendor("Vendor A (stuck)");
  await makeVendor("Vendor B (eligible alternate)"); // not assigned — the matcher will suggest it

  const a = await createDispatch({ tenantId, jobId: job.id, vendorId: vA, createdByUserId: creatorId, agreedNteAmount: "500.00", dispatchScope: `${MARKER} fix the unit` });
  await sendDispatch({ tenantId, assignmentId: a.id, actorUserId: creatorId });
  // backdate sent_at past the DEFAULT 24h threshold (job has no priority) so CF-19.1a flags it stuck.
  await db.update(jobVendorAssignments).set({ sentAt: sql`(NOW() - INTERVAL 30 HOUR)` }).where(eq(jobVendorAssignments.id, a.id));

  console.log(`\n[rd-walk] SEEDED:`);
  console.log(`  job        #${job.jobNumber}  id=${job.id}`);
  console.log(`  stuck SENT assignment (Vendor A): ${a.id}`);
  console.log(`  eligible alternate: Vendor B (unassigned)`);
  console.log(`\n  Walk: /notifications → the Stuck "Vendor not accepted" row → "Suggest replacement"`);
  console.log(`        → /jobs/${job.id}/dispatch/<draftId> → "Approve re-dispatch"`);
  console.log(`        → expect Vendor A GHOSTED + Vendor B SENT + job stays Dispatched.`);
  console.log(`\n  Clean up later:  pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/seed-redispatch-walk.ts teardown`);
  process.exit(0);
}

main().catch((e) => { console.error("[rd-walk] ERROR:", e); process.exit(1); });
