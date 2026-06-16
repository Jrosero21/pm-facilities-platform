/**
 * scripts/check-ready-to-bill-view.ts — CF-27.16 Piece 2 "Ready to invoice" view harness.
 *
 * Tests the readers directly (not the page): getReadyToBillRows + listJobs's clientId filter.
 *   R1 getReadyToBillRows({}) → ALL PENDING_INVOICE jobs (status is membership); IN_PROGRESS excluded
 *   R2 getReadyToBillRows({clientId: A}) → only Client A's PENDING_INVOICE jobs (the batch axis)
 *   R3 rows carry billing fields: handoffAt (non-null), cost, billedSoFar, margin, vendorCount
 *   R4 partially-billed job billedSoFar>0, not-billed job billedSoFar=0 — BOTH stay (never auto-removed)
 *   R5 multi-dispatch job: vendorCount = dispatch count; cost = Σ its approved vendor invoices (all vendors)
 *   R6 listJobs clientId filter (+ status), base listJobs unchanged
 *   R7 never-block: createClientInvoice works on a PENDING_INVOICE job AND a non-PENDING job
 *
 * SANDBOX ONLY — hard-guarded (exit 2). Self-seed/teardown (0 leftover; reuses the seed operator).
 * Run: pnpm run db:check:ready-to-bill-view
 */

export {};

const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) { console.error("[check-rtbv] DATABASE_URL not set"); process.exit(2); }
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[check-rtbv] refusing: resolved URL is not a *_sandbox DB."); process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-rtbv] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "ready-to-bill-view-harness-tenant";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, jobs, jobStatuses, jobStatusHistory, jobEvents, auditLogs,
    users, trades, vendors, jobVendorAssignments, jobVendorAssignmentStatusHistory,
    vendorInvoices, vendorInvoiceLineItems, clientInvoices, clientInvoiceLineItems,
  } = await import("@/server/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { getJobStatusByCode } = await import("@/server/job-reference");
  const { getDispatchAssignmentStatusByCode } = await import("@/server/dispatch-reference");
  const { listJobs, markJobReadyToBill } = await import("@/server/jobs");
  const { getReadyToBillRows } = await import("@/server/analytics/ready-to-bill");
  const { createClientInvoice } = await import("@/server/billing/client-invoices");

  async function teardownTenant(id: string) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
      await tx.delete(clientInvoiceLineItems).where(eq(clientInvoiceLineItems.tenantId, id));
      await tx.delete(clientInvoices).where(eq(clientInvoices.tenantId, id));
      await tx.delete(vendorInvoiceLineItems).where(eq(vendorInvoiceLineItems.tenantId, id));
      await tx.delete(vendorInvoices).where(eq(vendorInvoices.tenantId, id));
      await tx.delete(jobVendorAssignmentStatusHistory).where(eq(jobVendorAssignmentStatusHistory.tenantId, id));
      await tx.delete(jobVendorAssignments).where(eq(jobVendorAssignments.tenantId, id));
      await tx.delete(jobEvents).where(eq(jobEvents.tenantId, id));
      await tx.delete(jobStatusHistory).where(eq(jobStatusHistory.tenantId, id));
      await tx.delete(jobs).where(eq(jobs.tenantId, id));
      await tx.delete(auditLogs).where(eq(auditLogs.tenantId, id));
      await tx.delete(clientLocations).where(eq(clientLocations.tenantId, id));
      await tx.delete(clients).where(eq(clients.tenantId, id));
      await tx.delete(tenants).where(eq(tenants.id, id));
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
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
    const inProg = await getJobStatusByCode("IN_PROGRESS");
    const accepted = await getDispatchAssignmentStatusByCode("ACCEPTED");
    const onSite = await getDispatchAssignmentStatusByCode("ON_SITE");
    check("setup: operator + HANDY + IN_PROGRESS + dispatch statuses resolve",
      !!operator && !!handy && !!inProg && !!accepted && !!onSite);
    if (!operator || !handy || !inProg || !accepted || !onSite) return finish();

    // ════ SEED ════
    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "RTB-View Harness" });
    const clientA = uuidv7(), clientB = uuidv7();
    await db.insert(clients).values([
      { id: clientA, tenantId: tId, name: "Client A" },
      { id: clientB, tenantId: tId, name: "Client B" },
    ]);
    const locA = uuidv7(), locB = uuidv7();
    await db.insert(clientLocations).values([
      { id: locA, tenantId: tId, clientId: clientA, name: "LocA", addressLine1: "1 St", city: "X", stateProvince: "NV", postalCode: "89101" },
      { id: locB, tenantId: tId, clientId: clientB, name: "LocB", addressLine1: "2 St", city: "X", stateProvince: "NV", postalCode: "89101" },
    ]);
    const vendorId = uuidv7();
    await db.insert(vendors).values({ id: vendorId, tenantId: tId, name: "RTB Vendor" });

    let jn = 0;
    const mkJob = async (clientId: string, locId: string, statusId: string) => {
      const id = uuidv7();
      await db.insert(jobs).values({ id, tenantId: tId, jobNumber: ++jn, clientId, clientLocationId: locId, primaryTradeId: handy.id, currentStatusId: statusId, problemDescription: "rtbv" });
      return id;
    };
    const handoff = async (jobId: string) => markJobReadyToBill({ tenantId: tId, jobId, actorUserId: operator.id });
    const mkSentClientInvoice = async (jobId: string, clientId: string, total: string) => {
      await db.insert(clientInvoices).values({ id: uuidv7(), tenantId: tId, jobId, clientId, status: "sent", total });
    };
    const mkApprovedVendorInvoice = async (jobId: string, assignmentId: string | null, total: string) => {
      await db.insert(vendorInvoices).values({ id: uuidv7(), tenantId: tId, jobId, vendorId, assignmentId, status: "approved", total });
    };
    const mkAssign = async (jobId: string, statusId: string) => {
      const id = uuidv7();
      await db.insert(jobVendorAssignments).values({ id, tenantId: tId, jobId, vendorId, currentStatusId: statusId,
        matchedTradeId: handy.id, matchedTradeWasPrimary: true, tightestGeoAtDispatch: "postal_code",
        matchedGeoTypesAtDispatch: ["postal_code"], complianceStatusAtDispatch: "ok" });
      return id;
    };

    // Client A: jA1 partially-billed, jA2 not-billed, jA3 multi-dispatch; jA4 IN_PROGRESS (not ready)
    const jA1 = await mkJob(clientA, locA, inProg.id);
    await mkSentClientInvoice(jA1, clientA, "500.00"); await handoff(jA1);
    const jA2 = await mkJob(clientA, locA, inProg.id); await handoff(jA2);
    const jA3 = await mkJob(clientA, locA, inProg.id);
    const a31 = await mkAssign(jA3, accepted.id), a32 = await mkAssign(jA3, onSite.id);
    await mkApprovedVendorInvoice(jA3, a31, "100.00"); await mkApprovedVendorInvoice(jA3, a32, "200.00");
    await handoff(jA3);
    const jA4 = await mkJob(clientA, locA, inProg.id); // stays IN_PROGRESS
    // Client B: jB1, jB2 PENDING_INVOICE
    const jB1 = await mkJob(clientB, locB, inProg.id); await handoff(jB1);
    const jB2 = await mkJob(clientB, locB, inProg.id); await handoff(jB2);

    // ════ R1 — all PENDING_INVOICE jobs (IN_PROGRESS excluded) ════
    const all = await getReadyToBillRows(tId, {});
    const allIds = new Set(all.map((r) => r.id));
    check("R1 getReadyToBillRows({}) → 5 PENDING_INVOICE jobs (A's 3 + B's 2)", all.length === 5);
    check("R1 IN_PROGRESS job NOT included (status is membership)", !allIds.has(jA4));
    check("R1 includes jA1,jA2,jA3,jB1,jB2", [jA1, jA2, jA3, jB1, jB2].every((id) => allIds.has(id)));

    // ════ R2 — client filter (the batch axis) ════
    const aRows = await getReadyToBillRows(tId, { clientId: clientA });
    const aIds = new Set(aRows.map((r) => r.id));
    check("R2 getReadyToBillRows({clientId:A}) → only A's 3 jobs", aRows.length === 3 && [jA1, jA2, jA3].every((id) => aIds.has(id)));
    check("R2 Client B's jobs excluded", !aIds.has(jB1) && !aIds.has(jB2));

    // ════ R3 — billing fields present ════
    const r1 = all.find((r) => r.id === jA1)!;
    check("R3 row has handoffAt (non-null), cost, billedSoFar, margin, vendorCount",
      !!r1 && r1.handoffAt !== null && typeof r1.cost === "string" && typeof r1.billedSoFar === "string" && typeof r1.margin === "string" && typeof r1.vendorCount === "number");

    // ════ R4 — partially-billed vs not, both stay ════
    const r2 = all.find((r) => r.id === jA2)!;
    check("R4 jA1 partially billed: billedSoFar=500.00, cost=0.00, margin=500.00",
      r1.billedSoFar === "500.00" && r1.cost === "0.00" && r1.margin === "500.00", `billed=${r1.billedSoFar} cost=${r1.cost} margin=${r1.margin}`);
    check("R4 jA2 not billed: billedSoFar=0.00 — and STILL in the list (never auto-removed)",
      r2.billedSoFar === "0.00" && allIds.has(jA2), `billed=${r2.billedSoFar}`);

    // ════ R5 — multi-dispatch rollup ════
    const r3 = all.find((r) => r.id === jA3)!;
    check("R5 multi-dispatch: vendorCount=2 (both dispatches)", r3.vendorCount === 2, `got ${r3.vendorCount}`);
    check("R5 cost rolls up all vendor invoices: cost=300.00 (100+200), margin=-300.00",
      r3.cost === "300.00" && r3.margin === "-300.00", `cost=${r3.cost} margin=${r3.margin}`);

    // ════ R6 — listJobs clientId filter + base unchanged ════
    const aAll = await listJobs(tId, { clientId: clientA });
    check("R6 listJobs({clientId:A}) → A's 4 jobs (all statuses, incl. IN_PROGRESS jA4)", aAll.length === 4 && new Set(aAll.map((j) => j.id)).has(jA4));
    const aPending = await listJobs(tId, { statusId: (await getJobStatusByCode("PENDING_INVOICE"))!.id, clientId: clientA });
    check("R6 listJobs({status:PENDING_INVOICE, clientId:A}) → A's 3 pending", aPending.length === 3);
    const baseAll = await listJobs(tId, {});
    check("R6 base listJobs({}) → all 6 non-archived jobs (unchanged behavior)", baseAll.length === 6);

    // ════ R7 — never-block: billing works regardless of status ════
    const ciPending = await createClientInvoice({ tenantId: tId, jobId: jB1, clientId: clientB, createdByUserId: operator.id });
    const ciNonPending = await createClientInvoice({ tenantId: tId, jobId: jA4, clientId: clientA, createdByUserId: operator.id });
    check("R7 never-block: createClientInvoice works on a PENDING_INVOICE job AND a non-PENDING job",
      !!ciPending?.id && !!ciNonPending?.id);

    return finish();
  } finally {
    if (tId) await teardownTenant(tId);
    const leftover = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG));
    console.log(`[check-rtbv] teardown leftover tenants: ${leftover.length} (expect 0)`);
  }
}

main().then(() => process.exit(failed.length === 0 ? 0 : 1)).catch((e) => { console.error("THREW:", e); process.exit(1); });
