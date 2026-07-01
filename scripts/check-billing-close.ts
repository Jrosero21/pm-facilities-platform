/**
 * scripts/check-billing-close.ts — markBillingClosed behavior + advanceJobStatus extraSet path.
 *
 * Coverage for the billing-close → CLOSED_BILLED transition (the first billing writer that crosses
 * into the operational job lifecycle, refactored onto the shared advanceJobStatus helper). Proves:
 *   - status → CLOSED_BILLED
 *   - jobs.closed_at set (extraSet carried closed_at in the same update)
 *   - a jobStatusHistory row from=<seed status> to=CLOSED_BILLED (note preserved)
 *   - a second call throws JobAlreadyBillingClosed (the throw-guard kept at the call site)
 *
 * SANDBOX ONLY — hard-guarded (exit 2). Self-seeds tenant/client/location/job, self-teardown.
 * Run: pnpm run db:check:billing-close
 */

export {};

const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) { console.error("[check-billing-close] DATABASE_URL not set"); process.exit(2); }
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-billing-close] refusing: resolved URL is not a *_sandbox DB."); process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-billing-close] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "billing-close-harness-tenant";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const { tenants, clients, clientLocations, jobs, jobStatusHistory, jobEvents, jobBillingEvents, auditLogs } =
    await import("@/server/schema");
  const { eq, and, sql } = await import("drizzle-orm");
  const { getJobStatusByCode } = await import("@/server/job-reference");
  const { markBillingClosed } = await import("@/server/billing/close");
  const { JobAlreadyBillingClosed } = await import("@/server/billing/errors");

  async function teardownTenant(id: string) {
    await db.transaction(async (tx) => {
      await tx.delete(jobBillingEvents).where(eq(jobBillingEvents.tenantId, id));
      await tx.delete(jobEvents).where(eq(jobEvents.tenantId, id));
      await tx.delete(jobStatusHistory).where(eq(jobStatusHistory.tenantId, id));
      await tx.delete(auditLogs).where(eq(auditLogs.tenantId, id));
      await tx.delete(jobs).where(eq(jobs.tenantId, id));
      await tx.delete(clientLocations).where(eq(clientLocations.tenantId, id));
      await tx.delete(clients).where(eq(clients.tenantId, id));
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
    const completed = await getJobStatusByCode("COMPLETED");
    const closedBilled = await getJobStatusByCode("CLOSED_BILLED");
    check("setup: COMPLETED + CLOSED_BILLED statuses exist", !!completed && !!closedBilled);
    if (!completed || !closedBilled) return finish();

    // ════ SEED ════ a job at COMPLETED (billing close transitions from any non-closed status)
    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Billing-Close Harness" });
    const clientA = uuidv7();
    await db.insert(clients).values({ id: clientA, tenantId: tId, name: "BC Client" });
    const locA = uuidv7();
    await db.insert(clientLocations).values({ id: locA, tenantId: tId, clientId: clientA, name: "Loc", addressLine1: "1 Test St", city: "Testville", stateProvince: "NV", postalCode: "89101" });
    const jobId = uuidv7();
    await db.insert(jobs).values({ id: jobId, tenantId: tId, jobNumber: 1, clientId: clientA, clientLocationId: locA, currentStatusId: completed.id, problemDescription: "Billing-close harness job" });

    // ════ ACT ════
    await markBillingClosed({ tenantId: tId, jobId, actorUserId: null, note: "harness close" });

    // ════ ASSERT ════
    const [after] = await db.select({ statusId: jobs.currentStatusId, closedAt: jobs.closedAt }).from(jobs).where(and(eq(jobs.tenantId, tId), eq(jobs.id, jobId)));
    check("status → CLOSED_BILLED", after?.statusId === closedBilled.id, `got ${after?.statusId}`);
    check("jobs.closed_at set (extraSet carried it in the same update)", after?.closedAt != null, `got ${after?.closedAt}`);

    const hist = await db.select({ fromStatusId: jobStatusHistory.fromStatusId, toStatusId: jobStatusHistory.toStatusId, note: jobStatusHistory.note })
      .from(jobStatusHistory).where(and(eq(jobStatusHistory.tenantId, tId), eq(jobStatusHistory.jobId, jobId)));
    const closeRow = hist.find((h) => h.toStatusId === closedBilled.id);
    check("jobStatusHistory COMPLETED → CLOSED_BILLED written", !!closeRow && closeRow.fromStatusId === completed.id,
      closeRow ? `from=${closeRow.fromStatusId}` : "no close-row");
    check("history note preserved ('harness close')", closeRow?.note === "harness close", `got ${closeRow?.note}`);

    // double-close → throws the guard
    let threw = false, isGuard = false;
    try { await markBillingClosed({ tenantId: tId, jobId, actorUserId: null }); }
    catch (e) { threw = true; isGuard = e instanceof JobAlreadyBillingClosed; }
    check("double-close THROWS JobAlreadyBillingClosed (guard preserved)", threw && isGuard, `threw=${threw} guard=${isGuard}`);

    return finish();
  } finally {
    if (tId) await teardownTenant(tId);
    const leftover = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG));
    console.log(`[check-billing-close] teardown leftover tenants: ${leftover.length} (expect 0)`);
  }
}

main().then(() => process.exit(failed.length === 0 ? 0 : 1)).catch((e) => { console.error("THREW:", e); process.exit(1); });
