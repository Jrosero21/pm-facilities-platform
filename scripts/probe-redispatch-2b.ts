/**
 * scripts/probe-redispatch-2b.ts — SANDBOX probe for prepareRedispatchSuggestion (Phase 28 2b).
 *
 * Seeds (under phase9-seed-tenant) a job + 2 eligible vendors (active trade coverage + national
 * service area), dispatches vendor A to SENT (the "stuck" one), then exercises the WRITE path:
 *   - prepareRedispatchSuggestion(stuck = A) -> expect "prepared", a DRAFT to vendor B with
 *     replaces_assignment_id = A and the NTE carried forward.
 *   - call again -> expect "already_suggested" (idempotency: no 2nd DRAFT).
 * Self-tearing-down (namespaced [REDISPATCH-2B]). SANDBOX ONLY. Throwaway.
 *
 *   pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/probe-redispatch-2b.ts
 */

export {};

// ===== SANDBOX GUARD — module top, before any @/server/db import =====
const RAW = process.env.DATABASE_URL;
if (!RAW) { console.error("[probe-2b] DATABASE_URL not set — refusing."); process.exit(2); }
const sandboxUrl = RAW.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[probe-2b] refusing: resolved URL is not a *_sandbox DB."); process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[probe-2b] sandbox target confirmed: ${sandboxUrl.replace(/\/\/[^@]+@/, "//<creds>@")}`);

const MARKER = "[REDISPATCH-2B]";
const TENANT_SLUG = "phase9-seed-tenant";
const OPERATOR_EMAIL = "operator@phase9seed.test";

async function main() {
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, trades, users,
    vendors, vendorLocations, vendorTradeCoverage, vendorServiceAreas,
    jobs, jobVendorAssignments, jobStatusHistory, jobEvents,
    jobVendorAssignmentStatusHistory, auditLogs, dispatchAssignmentStatuses,
  } = await import("@/server/schema");
  const { eq, and, inArray, like, or, sql } = await import("drizzle-orm");
  const { v7: uuidv7 } = await import("uuid");
  const { createJob } = await import("@/server/jobs");
  const { createDispatch, sendDispatch } = await import("@/server/dispatch");
  const { prepareRedispatchSuggestion } = await import("@/server/redispatch-suggestion");

  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  const dbName = dbRows[0]?.db ?? "";
  if (!/_sandbox$/.test(dbName)) { console.error(`[probe-2b] ABORT: DB "${dbName}" is not *_sandbox.`); process.exit(2); }
  console.log("[probe-2b] connected DB confirmed:", dbName);

  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TENANT_SLUG)).limit(1);
  if (!tenant) { console.error("[probe-2b] phase9-seed-tenant not found."); process.exit(2); }
  const tenantId = tenant.id;
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, tenantId)).limit(1);
  const [location] = await db.select({ id: clientLocations.id }).from(clientLocations).where(and(eq(clientLocations.tenantId, tenantId), eq(clientLocations.clientId, client!.id))).limit(1);
  const [trade] = await db.select({ id: trades.id }).from(trades).limit(1);
  const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, OPERATOR_EMAIL)).limit(1);
  const creatorId = operator?.id ?? (await db.select({ id: users.id }).from(users).limit(1))[0]!.id;
  if (!client || !location || !trade) { console.error("[probe-2b] missing client/location/trade — run phase9 seed."); process.exit(2); }

  // ---------- TEARDOWN (idempotent) ----------
  async function teardown() {
    const pVendors = await db.select({ id: vendors.id }).from(vendors).where(and(eq(vendors.tenantId, tenantId), like(vendors.name, `${MARKER}%`)));
    const vIds = pVendors.map((v) => v.id);
    const pJobs = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.tenantId, tenantId), like(jobs.problemDescription, `${MARKER}%`)));
    const jIds = pJobs.map((j) => j.id);
    const aRows = jIds.length || vIds.length
      ? await db.select({ id: jobVendorAssignments.id }).from(jobVendorAssignments).where(
          and(eq(jobVendorAssignments.tenantId, tenantId),
            or(jIds.length ? inArray(jobVendorAssignments.jobId, jIds) : undefined,
               vIds.length ? inArray(jobVendorAssignments.vendorId, vIds) : undefined)))
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

  console.log("[probe-2b] pre-clean:", await teardown());

  // ---------- SEED: 2 eligible vendors (active trade coverage + national service area) ----------
  async function makeVendor(label: string): Promise<string> {
    const vid = uuidv7();
    await db.insert(vendors).values({ id: vid, tenantId, name: `${MARKER} ${label}` });
    await db.insert(vendorLocations).values({ id: uuidv7(), tenantId, vendorId: vid, name: `${label} HQ`, addressLine1: "1 Probe Rd", city: "Metropolis", stateProvince: "NY", postalCode: "10001" });
    await db.insert(vendorTradeCoverage).values({ tenantId, vendorId: vid, tradeId: trade!.id, status: "active", isPrimary: true });
    await db.insert(vendorServiceAreas).values({ tenantId, vendorId: vid, areaType: "national", status: "active" });
    return vid;
  }
  const vA = await makeVendor("Vendor A");
  const vB = await makeVendor("Vendor B");

  const job = await createJob({
    tenantId, clientId: client.id, clientLocationId: location.id,
    primaryTradeId: trade.id,
    problemDescription: `${MARKER} cooler repair (2b probe)`,
    createdByUserId: creatorId,
  });

  // Dispatch vendor A → SENT (the "stuck" one), with an NTE + scope to test copy-forward.
  const aAssignment = await createDispatch({
    tenantId, jobId: job.id, vendorId: vA, createdByUserId: creatorId,
    agreedNteAmount: "750.00", dispatchScope: `${MARKER} original scope`,
  });
  await sendDispatch({ tenantId, assignmentId: aAssignment.id, actorUserId: creatorId });
  console.log(`[probe-2b] seeded: job #${job.jobNumber}, vendor A=${vA.slice(0, 8)} (SENT), vendor B=${vB.slice(0, 8)} (eligible)`);

  let allPass = true;
  const check = (name: string, cond: boolean) => { console.log(`  ${cond ? "PASS" : "FAIL"} — ${name}`); if (!cond) allPass = false; };

  // ---------- CALL 1: expect "prepared" ----------
  const r1 = await prepareRedispatchSuggestion({ tenantId, jobId: job.id, stuckAssignmentId: aAssignment.id, createdByUserId: creatorId });
  console.log("[probe-2b] call 1:", r1);
  check("call 1 -> prepared", r1.kind === "prepared");
  check("call 1 -> suggested vendor is B (not A)", r1.kind === "prepared" && r1.vendorId === vB);

  if (r1.kind === "prepared") {
    const [draft] = await db.select({
      id: jobVendorAssignments.id, vendorId: jobVendorAssignments.vendorId,
      replaces: jobVendorAssignments.replacesAssignmentId, nte: jobVendorAssignments.agreedNteAmount,
      statusCode: dispatchAssignmentStatuses.code,
    }).from(jobVendorAssignments)
      .innerJoin(dispatchAssignmentStatuses, eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id))
      .where(eq(jobVendorAssignments.id, r1.draftAssignmentId)).limit(1);
    console.log("[probe-2b] new DRAFT:", draft);
    check("DRAFT.replaces_assignment_id == stuck (A)", draft?.replaces === aAssignment.id);
    check("DRAFT.vendorId == B", draft?.vendorId === vB);
    check("DRAFT.statusCode == DRAFT", draft?.statusCode === "DRAFT");
    check("DRAFT.agreedNteAmount carried forward (750.00)", draft?.nte === "750.00");
  }

  // ---------- CALL 2: expect "already_suggested" (idempotency) ----------
  const r2 = await prepareRedispatchSuggestion({ tenantId, jobId: job.id, stuckAssignmentId: aAssignment.id, createdByUserId: creatorId });
  console.log("[probe-2b] call 2:", r2);
  check("call 2 -> already_suggested", r2.kind === "already_suggested");
  check("call 2 -> same DRAFT id (no 2nd created)", r2.kind === "already_suggested" && r1.kind === "prepared" && r2.existingDraftId === r1.draftAssignmentId);

  const draftsReplacingA = await db.select({ id: jobVendorAssignments.id })
    .from(jobVendorAssignments).innerJoin(dispatchAssignmentStatuses, eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id))
    .where(and(eq(jobVendorAssignments.jobId, job.id), eq(jobVendorAssignments.replacesAssignmentId, aAssignment.id), eq(dispatchAssignmentStatuses.code, "DRAFT")));
  check("exactly 1 DRAFT replaces the stuck assignment", draftsReplacingA.length === 1);

  // ---------- TEARDOWN ----------
  console.log("[probe-2b] teardown:", await teardown());

  console.log(`\n[probe-2b] ${allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("[probe-2b] ERROR:", e); process.exit(1); });
