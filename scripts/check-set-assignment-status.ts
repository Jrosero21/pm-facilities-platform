/**
 * scripts/check-set-assignment-status.ts — operator hand-advance (setAssignmentStatus) harness.
 *
 * Proves: free-move forward; history from→to with operator changedBy; audit provenance
 * (actor=operator/via=operator_console); re-open from a terminal status; same-status no-op writes
 * NO history; DRAFT and SENT both rejected.
 *
 * SANDBOX ONLY — hard-guarded (exit 2). Self-seeds tenant/client/location/job/vendor/assignment,
 * self-teardown (0 leftover). Run: pnpm run db:check:set-assignment-status
 */

export {};

const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) { console.error("[check-set-status] DATABASE_URL not set"); process.exit(2); }
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[check-set-status] refusing: resolved URL is not a *_sandbox DB."); process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-set-status] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "set-status-harness-tenant";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, jobs, jobStatuses, users, trades, vendors,
    jobVendorAssignments, jobVendorAssignmentStatusHistory, auditLogs,
  } = await import("@/server/schema");
  const { eq, and, sql } = await import("drizzle-orm");
  const { getDispatchAssignmentStatusByCode } = await import("@/server/dispatch-reference");
  const { setAssignmentStatus } = await import("@/server/dispatch");

  async function teardownTenant(id: string) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
      await tx.delete(jobVendorAssignmentStatusHistory).where(eq(jobVendorAssignmentStatusHistory.tenantId, id));
      await tx.delete(auditLogs).where(eq(auditLogs.tenantId, id));
      await tx.delete(jobVendorAssignments).where(eq(jobVendorAssignments.tenantId, id));
      await tx.delete(jobs).where(eq(jobs.tenantId, id));
      await tx.delete(clientLocations).where(eq(clientLocations.tenantId, id));
      await tx.delete(clients).where(eq(clients.tenantId, id));
      await tx.delete(vendors).where(eq(vendors.tenantId, id));
      await tx.delete(tenants).where(eq(tenants.id, id));
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
    });
  }

  function finish() {
    console.log(`\n${failed.length === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed.length} failed`);
    if (failed.length) console.error("failed:", failed.join(" | "));
  }

  async function histCount(tId: string, aId: string): Promise<number> {
    const rows = await db.select({ id: jobVendorAssignmentStatusHistory.id })
      .from(jobVendorAssignmentStatusHistory)
      .where(and(eq(jobVendorAssignmentStatusHistory.tenantId, tId), eq(jobVendorAssignmentStatusHistory.assignmentId, aId)));
    return rows.length;
  }

  {
    const prior = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG)).limit(1);
    if (prior[0]) await teardownTenant(prior[0].id);
  }

  let tId = "";
  try {
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [handy] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HANDY"));
    const [statusNew] = await db.select({ id: jobStatuses.id }).from(jobStatuses).where(eq(jobStatuses.code, "NEW"));
    const accepted = await getDispatchAssignmentStatusByCode("ACCEPTED");
    const onSite = await getDispatchAssignmentStatusByCode("ON_SITE");
    const cancelled = await getDispatchAssignmentStatusByCode("CANCELLED");
    check("setup: operator + HANDY + NEW + ACCEPTED/ON_SITE/CANCELLED statuses exist",
      !!operator && !!handy && !!statusNew && !!accepted && !!onSite && !!cancelled);
    if (!operator || !handy || !statusNew || !accepted || !onSite || !cancelled) return finish();

    // ════ SEED ════
    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Set-Status Harness" });
    const clientA = uuidv7();
    await db.insert(clients).values({ id: clientA, tenantId: tId, name: "SS Client" });
    const locA = uuidv7();
    await db.insert(clientLocations).values({ id: locA, tenantId: tId, clientId: clientA, name: "Loc", addressLine1: "1 Test St", city: "Testville", stateProvince: "NV", postalCode: "89101" });
    const jobId = uuidv7();
    await db.insert(jobs).values({ id: jobId, tenantId: tId, jobNumber: 1, clientId: clientA, clientLocationId: locA, primaryTradeId: handy.id, currentStatusId: statusNew.id, problemDescription: "Set-status harness job" });
    const vendorId = uuidv7();
    await db.insert(vendors).values({ id: vendorId, tenantId: tId, name: "SS Vendor" });
    const aId = uuidv7();
    await db.insert(jobVendorAssignments).values({
      id: aId, tenantId: tId, jobId, vendorId, currentStatusId: accepted.id,
      matchedTradeId: handy.id, matchedTradeWasPrimary: true,
      tightestGeoAtDispatch: "postal_code", matchedGeoTypesAtDispatch: ["postal_code"],
      complianceStatusAtDispatch: "ok",
    });

    // 1) FREE-MOVE forward ACCEPTED → ON_SITE
    const r1 = await setAssignmentStatus({ tenantId: tId, assignmentId: aId, toCode: "ON_SITE", actorUserId: operator.id, note: "vendor called in" });
    const [a1] = await db.select({ statusId: jobVendorAssignments.currentStatusId }).from(jobVendorAssignments).where(eq(jobVendorAssignments.id, aId));
    check("free-move forward lands ON_SITE", a1?.statusId === onSite.id && r1.changed === true, `changed=${r1.changed}`);

    // 2) HISTORY written from=ACCEPTED to=ON_SITE, changedBy=operator
    const hrows = await db.select({ fromStatusId: jobVendorAssignmentStatusHistory.fromStatusId, toStatusId: jobVendorAssignmentStatusHistory.toStatusId, by: jobVendorAssignmentStatusHistory.changedByUserId })
      .from(jobVendorAssignmentStatusHistory).where(and(eq(jobVendorAssignmentStatusHistory.tenantId, tId), eq(jobVendorAssignmentStatusHistory.assignmentId, aId)));
    const hrow = hrows.find((h) => h.toStatusId === onSite.id);
    check("history ACCEPTED→ON_SITE with operator changedBy", !!hrow && hrow.fromStatusId === accepted.id && hrow.by === operator.id);

    // 3) AUDIT provenance actor=operator / via=operator_console / fromCode/toCode present
    const [aud] = await db.select({ metadata: auditLogs.metadata, action: auditLogs.action })
      .from(auditLogs).where(and(eq(auditLogs.tenantId, tId), eq(auditLogs.targetId, aId), eq(auditLogs.action, "job_vendor_assignment.status_set")));
    const meta: any = typeof aud?.metadata === "string" ? JSON.parse(aud.metadata) : aud?.metadata;
    check("audit provenance actor=operator / via=operator_console / fromCode=ACCEPTED toCode=ON_SITE",
      !!meta && meta.actor === "operator" && meta.via === "operator_console" && meta.fromCode === "ACCEPTED" && meta.toCode === "ON_SITE",
      JSON.stringify(meta));

    // 4) RE-OPEN from terminal: ON_SITE → CANCELLED (terminal) → ACCEPTED (free movement allows it)
    await setAssignmentStatus({ tenantId: tId, assignmentId: aId, toCode: "CANCELLED", actorUserId: operator.id });
    const r4 = await setAssignmentStatus({ tenantId: tId, assignmentId: aId, toCode: "ACCEPTED", actorUserId: operator.id });
    const [a4] = await db.select({ statusId: jobVendorAssignments.currentStatusId }).from(jobVendorAssignments).where(eq(jobVendorAssignments.id, aId));
    check("re-open from terminal CANCELLED → ACCEPTED succeeds", a4?.statusId === accepted.id && r4.changed === true);

    // 5) SAME-STATUS NO-OP: set ACCEPTED again → changed:false, history count unchanged
    const before = await histCount(tId, aId);
    const r5 = await setAssignmentStatus({ tenantId: tId, assignmentId: aId, toCode: "ACCEPTED", actorUserId: operator.id });
    const afterC = await histCount(tId, aId);
    check("same-status no-op: changed=false AND no history row", r5.changed === false && afterC === before, `before=${before} after=${afterC} changed=${r5.changed}`);

    // 6 & 7) DRAFT / SENT rejected
    let drew = false, dGuard = false;
    try { await setAssignmentStatus({ tenantId: tId, assignmentId: aId, toCode: "DRAFT", actorUserId: operator.id }); }
    catch (e) { drew = true; dGuard = e instanceof Error && e.message === "STATUS_NOT_OPERATOR_SETTABLE"; }
    check("DRAFT rejected (STATUS_NOT_OPERATOR_SETTABLE)", drew && dGuard);

    let srew = false, sGuard = false;
    try { await setAssignmentStatus({ tenantId: tId, assignmentId: aId, toCode: "SENT", actorUserId: operator.id }); }
    catch (e) { srew = true; sGuard = e instanceof Error && e.message === "STATUS_NOT_OPERATOR_SETTABLE"; }
    check("SENT rejected (STATUS_NOT_OPERATOR_SETTABLE)", srew && sGuard);

    return finish();
  } finally {
    if (tId) await teardownTenant(tId);
    const leftover = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG));
    console.log(`[check-set-status] teardown leftover tenants: ${leftover.length} (expect 0)`);
  }
}

main().then(() => process.exit(failed.length === 0 ? 0 : 1)).catch((e) => { console.error("THREW:", e); process.exit(1); });
