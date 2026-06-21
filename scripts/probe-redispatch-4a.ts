/**
 * scripts/probe-redispatch-4a.ts — SANDBOX read-probe for the re-dispatch exception STATE.
 *
 * Verifies getExceptions' vendor_not_accepted row carries the right redispatchState:
 *   - stuck + under cap, no draft         -> "can_suggest" (attemptCount 1, suggestion null)
 *   - after prepareRedispatchSuggestion    -> "suggestion_ready" (suggestion = {draftId, draftVendorName})
 *   - stuck + 3 SENT attempts on the job   -> "exhausted_max_attempts" (attemptCount 3, suggestion null)
 * SENT rows are backdated past the DEFAULT 24h threshold so isStuck is true. Self-tearing-down
 * (namespaced [REDISPATCH-4A]). SANDBOX ONLY. Throwaway.
 *
 *   pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/probe-redispatch-4a.ts
 */

export {};

// ===== SANDBOX GUARD =====
const RAW = process.env.DATABASE_URL;
if (!RAW) { console.error("[probe-4a] DATABASE_URL not set — refusing."); process.exit(2); }
const sandboxUrl = RAW.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[probe-4a] refusing: resolved URL is not a *_sandbox DB."); process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[probe-4a] sandbox target confirmed: ${sandboxUrl.replace(/\/\/[^@]+@/, "//<creds>@")}`);

const MARKER = "[REDISPATCH-4A]";
const TENANT_SLUG = "phase9-seed-tenant";
const OPERATOR_EMAIL = "operator@phase9seed.test";

async function main() {
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
  const { prepareRedispatchSuggestion } = await import("@/server/redispatch-suggestion");
  const { getExceptions } = await import("@/server/analytics/exceptions");

  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  const dbName = dbRows[0]?.db ?? "";
  if (!/_sandbox$/.test(dbName)) { console.error(`[probe-4a] ABORT: DB "${dbName}" is not *_sandbox.`); process.exit(2); }
  console.log("[probe-4a] connected DB confirmed:", dbName);

  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TENANT_SLUG)).limit(1);
  if (!tenant) { console.error("[probe-4a] phase9-seed-tenant not found."); process.exit(2); }
  const tenantId = tenant.id;
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, tenantId)).limit(1);
  const [location] = await db.select({ id: clientLocations.id }).from(clientLocations).where(and(eq(clientLocations.tenantId, tenantId), eq(clientLocations.clientId, client!.id))).limit(1);
  const [trade] = await db.select({ id: trades.id }).from(trades).limit(1);
  const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, OPERATOR_EMAIL)).limit(1);
  const creatorId = operator?.id ?? (await db.select({ id: users.id }).from(users).limit(1))[0]!.id;
  if (!client || !location || !trade) { console.error("[probe-4a] missing client/location/trade."); process.exit(2); }

  async function makeVendor(label: string): Promise<string> {
    const vid = uuidv7();
    await db.insert(vendors).values({ id: vid, tenantId, name: `${MARKER} ${label}` });
    await db.insert(vendorLocations).values({ id: uuidv7(), tenantId, vendorId: vid, name: `${label} HQ`, addressLine1: "1 Probe Rd", city: "Metropolis", stateProvince: "NY", postalCode: "10001" });
    await db.insert(vendorTradeCoverage).values({ tenantId, vendorId: vid, tradeId: trade!.id, status: "active", isPrimary: true });
    await db.insert(vendorServiceAreas).values({ tenantId, vendorId: vid, areaType: "national", status: "active" });
    return vid;
  }
  async function makeJob(label: string): Promise<string> {
    const j = await createJob({ tenantId, clientId: client!.id, clientLocationId: location!.id, primaryTradeId: trade!.id, problemDescription: `${MARKER} ${label}`, createdByUserId: creatorId });
    return j.id;
  }
  // dispatch + send + backdate sent_at past the DEFAULT 24h threshold so the row is stuck.
  async function dispatchStuck(jobId: string, vendorId: string): Promise<string> {
    const a = await createDispatch({ tenantId, jobId, vendorId, createdByUserId: creatorId });
    await sendDispatch({ tenantId, assignmentId: a.id, actorUserId: creatorId });
    await db.update(jobVendorAssignments).set({ sentAt: sql`(NOW() - INTERVAL 30 HOUR)` }).where(eq(jobVendorAssignments.id, a.id));
    return a.id;
  }

  type Exc = Awaited<ReturnType<typeof getExceptions>>[number];
  function findRow(exc: Exc[], assignmentId: string): Extract<Exc, { kind: "vendor_not_accepted" }> | null {
    const row = exc.find((e) => e.kind === "vendor_not_accepted" && e.assignmentId === assignmentId);
    return row && row.kind === "vendor_not_accepted" ? row : null;
  }

  let allPass = true;
  const check = (n: string, c: boolean) => { console.log(`  ${c ? "PASS" : "FAIL"} — ${n}`); if (!c) allPass = false; };

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
  console.log("[probe-4a] pre-clean:", await teardown());

  // ========== can_suggest -> suggestion_ready ==========
  console.log("\n[probe-4a] can_suggest -> suggestion_ready");
  const job1 = await makeJob("state job");
  const vA = await makeVendor("Vendor A");
  const vBId = await makeVendor("Vendor B");
  const stuckA = await dispatchStuck(job1, vA);

  const exc1 = await getExceptions(tenantId);
  const row1 = findRow(exc1, stuckA);
  console.log("  row1:", row1 && { isStuck: row1.isStuck, state: row1.redispatchState, attempts: row1.attemptCount, suggestion: row1.suggestion });
  check("row found + isStuck", !!row1 && row1.isStuck);
  check("state == can_suggest", row1?.redispatchState === "can_suggest");
  check("attemptCount == 1", row1?.attemptCount === 1);
  check("suggestion == null", row1?.suggestion === null);

  const prep = await prepareRedispatchSuggestion({ tenantId, jobId: job1, stuckAssignmentId: stuckA, createdByUserId: creatorId });
  if (prep.kind !== "prepared") { console.error("[probe-4a] prepare did not return prepared:", prep); process.exit(1); }
  const [vBName] = await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, vBId)).limit(1);

  const exc2 = await getExceptions(tenantId);
  const row2 = findRow(exc2, stuckA);
  console.log("  row2:", row2 && { state: row2.redispatchState, attempts: row2.attemptCount, suggestion: row2.suggestion });
  check("state == suggestion_ready", row2?.redispatchState === "suggestion_ready");
  check("suggestion.draftId == prepared DRAFT", row2?.suggestion?.draftId === prep.draftAssignmentId);
  check("suggestion.draftVendorName == B", row2?.suggestion?.draftVendorName === vBName?.name);
  check("attemptCount still 1 (B draft not sent)", row2?.attemptCount === 1);

  // ========== exhausted_max_attempts (3 SENT on the job) ==========
  console.log("\n[probe-4a] exhausted_max_attempts");
  const job2 = await makeJob("cap job");
  const v1 = await makeVendor("Cap V1");
  const v2 = await makeVendor("Cap V2");
  const v3 = await makeVendor("Cap V3");
  const s1 = await dispatchStuck(job2, v1);
  await dispatchStuck(job2, v2);
  await dispatchStuck(job2, v3);

  const exc3 = await getExceptions(tenantId);
  const rowCap = findRow(exc3, s1);
  console.log("  rowCap:", rowCap && { state: rowCap.redispatchState, attempts: rowCap.attemptCount, suggestion: rowCap.suggestion });
  check("cap row isStuck", !!rowCap && rowCap.isStuck);
  check("attemptCount == 3", rowCap?.attemptCount === 3);
  check("state == exhausted_max_attempts", rowCap?.redispatchState === "exhausted_max_attempts");
  check("suggestion == null", rowCap?.suggestion === null);

  console.log("\n[probe-4a] teardown:", await teardown());
  console.log(`\n[probe-4a] ${allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("[probe-4a] ERROR:", e); process.exit(1); });
