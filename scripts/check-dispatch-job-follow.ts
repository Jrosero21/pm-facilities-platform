/**
 * scripts/check-dispatch-job-follow.ts — single-vendor dispatch→job auto-follow harness.
 *
 * Proves applyDispatchJobFollow via BOTH cores:
 *   A operator ON_SITE (single)        → job DISPATCHED → IN_PROGRESS
 *   B operator WORK_COMPLETE (single)  → job IN_PROGRESS → PENDING_INVOICE
 *   C operator ON_SITE (MULTI, 2 active) → job UNCHANGED (n != 1)
 *   D operator ON_SITE, job at PENDING_INVOICE → NO regress (forward-only)
 *   E operator ON_SITE, job ON_HOLD     → stays ON_HOLD (ON_HOLD not a fromCode)
 *   F operator CONFIRMED (unmapped)     → job unchanged
 *   G vendor markOnSite (single)        → job DISPATCHED → IN_PROGRESS (vendor-core wiring)
 *
 * SANDBOX ONLY — hard-guarded (exit 2). Self-seed/teardown (0 leftover).
 * Run: pnpm run db:check:dispatch-job-follow
 */

export {};

const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) { console.error("[check-follow] DATABASE_URL not set"); process.exit(2); }
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-follow] refusing: resolved URL is not a *_sandbox DB."); process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-follow] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "dispatch-follow-harness-tenant";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, jobs, jobStatuses, jobStatusHistory, users, trades, vendors,
    jobVendorAssignments, jobVendorAssignmentStatusHistory, auditLogs, vendorCheckIns,
  } = await import("@/server/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { getDispatchAssignmentStatusByCode } = await import("@/server/dispatch-reference");
  const { getJobStatusByCode } = await import("@/server/job-reference");
  const { setAssignmentStatus } = await import("@/server/dispatch");
  const { markOnSite } = await import("@/server/vendor/assignment-actions");

  async function teardownTenant(id: string) {
    await db.transaction(async (tx) => {
      await tx.delete(vendorCheckIns).where(eq(vendorCheckIns.tenantId, id));
      await tx.delete(jobVendorAssignmentStatusHistory).where(eq(jobVendorAssignmentStatusHistory.tenantId, id));
      await tx.delete(jobStatusHistory).where(eq(jobStatusHistory.tenantId, id));
      await tx.delete(auditLogs).where(eq(auditLogs.tenantId, id));
      await tx.delete(jobVendorAssignments).where(eq(jobVendorAssignments.tenantId, id));
      await tx.delete(jobs).where(eq(jobs.tenantId, id));
      await tx.delete(clientLocations).where(eq(clientLocations.tenantId, id));
      await tx.delete(clients).where(eq(clients.tenantId, id));
      await tx.delete(vendors).where(eq(vendors.tenantId, id));
      await tx.delete(tenants).where(eq(tenants.id, id));
    });
  }
  function finish() {
    console.log(`\n${failed.length === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed.length} failed`);
    if (failed.length) console.error("failed:", failed.join(" | "));
  }

  {
    const prior = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG)).limit(1);
    if (prior[0]) await teardownTenant(prior[0].id);
  }

  let tId = "";
  try {
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [handy] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HANDY"));
    const J: Record<string, string> = {};
    for (const c of ["NEW", "DISPATCHED", "IN_PROGRESS", "PENDING_INVOICE", "ON_HOLD"]) {
      const s = await getJobStatusByCode(c); if (s) J[c] = s.id;
    }
    const D: Record<string, string> = {};
    for (const c of ["CONFIRMED", "ON_SITE", "ACCEPTED"]) {
      const s = await getDispatchAssignmentStatusByCode(c); if (s) D[c] = s.id;
    }
    check("setup: operator + HANDY + needed job/dispatch statuses resolve",
      !!operator && !!handy && !!J.NEW && !!J.DISPATCHED && !!J.IN_PROGRESS && !!J.PENDING_INVOICE && !!J.ON_HOLD && !!D.CONFIRMED && !!D.ON_SITE && !!D.ACCEPTED);
    if (!operator || !handy || !J.NEW || !J.DISPATCHED || !J.IN_PROGRESS || !J.PENDING_INVOICE || !J.ON_HOLD || !D.CONFIRMED || !D.ON_SITE || !D.ACCEPTED) return finish();

    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Dispatch-Follow Harness" });
    const clientA = uuidv7();
    await db.insert(clients).values({ id: clientA, tenantId: tId, name: "DF Client" });
    const locA = uuidv7();
    await db.insert(clientLocations).values({ id: locA, tenantId: tId, clientId: clientA, name: "Loc", addressLine1: "1 St", city: "X", stateProvince: "NV", postalCode: "89101" });
    const vendorId = uuidv7();
    await db.insert(vendors).values({ id: vendorId, tenantId: tId, name: "DF Vendor" });

    let jobNum = 0;
    const mkJob = async (jobStatusId: string) => {
      const id = uuidv7();
      await db.insert(jobs).values({ id, tenantId: tId, jobNumber: ++jobNum, clientId: clientA, clientLocationId: locA, primaryTradeId: handy.id, currentStatusId: jobStatusId, problemDescription: "follow harness" });
      return id;
    };
    const mkAssign = async (jobId: string, dispatchStatusId: string) => {
      const id = uuidv7();
      await db.insert(jobVendorAssignments).values({
        id, tenantId: tId, jobId, vendorId, currentStatusId: dispatchStatusId,
        matchedTradeId: handy.id, matchedTradeWasPrimary: true,
        tightestGeoAtDispatch: "postal_code", matchedGeoTypesAtDispatch: ["postal_code"], complianceStatusAtDispatch: "ok",
      });
      return id;
    };
    const jobStatus = async (jobId: string) => (await db.select({ s: jobs.currentStatusId }).from(jobs).where(eq(jobs.id, jobId)))[0]?.s;

    // A) operator ON_SITE single → DISPATCHED→IN_PROGRESS
    const jA = await mkJob(J.DISPATCHED); const aA = await mkAssign(jA, D.CONFIRMED);
    await setAssignmentStatus({ tenantId: tId, assignmentId: aA, toCode: "ON_SITE", actorUserId: operator.id });
    check("A operator ON_SITE (single) → job IN_PROGRESS", (await jobStatus(jA)) === J.IN_PROGRESS);

    // B) operator WORK_COMPLETE single → IN_PROGRESS→PENDING_INVOICE
    const jB = await mkJob(J.IN_PROGRESS); const aB = await mkAssign(jB, D.ON_SITE);
    await setAssignmentStatus({ tenantId: tId, assignmentId: aB, toCode: "WORK_COMPLETE", actorUserId: operator.id });
    check("B operator WORK_COMPLETE (single) → job PENDING_INVOICE", (await jobStatus(jB)) === J.PENDING_INVOICE);

    // C) MULTI (2 active) ON_SITE → unchanged
    const jC = await mkJob(J.DISPATCHED); const aC1 = await mkAssign(jC, D.CONFIRMED); await mkAssign(jC, D.ACCEPTED);
    await setAssignmentStatus({ tenantId: tId, assignmentId: aC1, toCode: "ON_SITE", actorUserId: operator.id });
    check("C ON_SITE with 2 active dispatches → job UNCHANGED (DISPATCHED)", (await jobStatus(jC)) === J.DISPATCHED);

    // D) forward-only: job at PENDING_INVOICE, ON_SITE → no regress
    const jD = await mkJob(J.PENDING_INVOICE); const aD = await mkAssign(jD, D.CONFIRMED);
    await setAssignmentStatus({ tenantId: tId, assignmentId: aD, toCode: "ON_SITE", actorUserId: operator.id });
    check("D forward-only: job PENDING_INVOICE not regressed by ON_SITE", (await jobStatus(jD)) === J.PENDING_INVOICE);

    // E) ON_HOLD job, ON_SITE → stays ON_HOLD
    const jE = await mkJob(J.ON_HOLD); const aE = await mkAssign(jE, D.CONFIRMED);
    await setAssignmentStatus({ tenantId: tId, assignmentId: aE, toCode: "ON_SITE", actorUserId: operator.id });
    check("E ON_HOLD job not auto-advanced (ON_HOLD not a fromCode)", (await jobStatus(jE)) === J.ON_HOLD);

    // F) unmapped (CONFIRMED) → job unchanged
    const jF = await mkJob(J.DISPATCHED); const aF = await mkAssign(jF, D.ACCEPTED);
    await setAssignmentStatus({ tenantId: tId, assignmentId: aF, toCode: "CONFIRMED", actorUserId: operator.id });
    check("F unmapped dispatch status (CONFIRMED) → job unchanged", (await jobStatus(jF)) === J.DISPATCHED);

    // G) VENDOR core markOnSite single → DISPATCHED→IN_PROGRESS (proves the vendor wiring)
    const jG = await mkJob(J.DISPATCHED); const aG = await mkAssign(jG, D.CONFIRMED);
    await markOnSite({ assignmentId: aG, tenantId: tId, vendorScope: new Set([vendorId]), actor: { kind: "user", userId: operator.id } });
    check("G vendor markOnSite (single) → job IN_PROGRESS (vendor-core wiring)", (await jobStatus(jG)) === J.IN_PROGRESS);

    return finish();
  } finally {
    if (tId) await teardownTenant(tId);
    const leftover = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG));
    console.log(`[check-follow] teardown leftover tenants: ${leftover.length} (expect 0)`);
  }
}

main().then(() => process.exit(failed.length === 0 ? 0 : 1)).catch((e) => { console.error("THREW:", e); process.exit(1); });
