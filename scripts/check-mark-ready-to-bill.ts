/**
 * scripts/check-mark-ready-to-bill.ts — CF-27.16 Piece 1 ops→accounting handoff harness.
 *
 * Tests markJobReadyToBill (the server fn directly; the ops role gate is ACTION-level, so this
 * exercises the fn's STATUS-guard + the job-level effects, role tested at the action elsewhere):
 *   H1 IN_PROGRESS → PENDING_INVOICE; job_status_history {IN_PROGRESS→PENDING_INVOICE} + job_events
 *      job.status_changed(reason ops_handoff) + audit job.ready_to_bill
 *   H2 ON_HOLD → PENDING_INVOICE (on-hold handoffable; not strict forward-only)
 *   H3 NEW → PENDING_INVOICE (any non-terminal allowed-from)
 *   H4 already PENDING_INVOICE → JOB_NOT_HANDOFFABLE; status unchanged; no extra history
 *   H5 terminal CLOSED → JOB_NOT_HANDOFFABLE; status unchanged
 *   H6 MULTI-VENDOR (2 active dispatches + a vendor invoice each) → handoff succeeds; the 2
 *      dispatches' statuses + the 2 vendor invoices are UNTOUCHED (purely job-level; no precondition)
 *   H7 NEVER-BLOCK: createClientInvoice({jobId}) works on a job that never hit PENDING_INVOICE
 *   H8 double-apply: 2nd call → JOB_NOT_HANDOFFABLE; no double history
 *
 * SANDBOX ONLY — hard-guarded (exit 2). Self-seed/teardown (0 leftover; reuses the seed operator).
 * Run: pnpm run db:check:mark-ready-to-bill
 */

export {};

const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) { console.error("[check-rtb] DATABASE_URL not set"); process.exit(2); }
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-rtb] refusing: resolved URL is not a *_sandbox DB."); process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-rtb] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "mark-ready-to-bill-harness-tenant";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, jobs, jobStatuses, jobStatusHistory, jobEvents, auditLogs,
    users, trades, vendors, jobVendorAssignments, jobVendorAssignmentStatusHistory,
    vendorInvoices, vendorInvoiceLineItems, clientInvoices, clientInvoiceLineItems,
  } = await import("@/server/schema");
  const { eq, and, sql } = await import("drizzle-orm");
  const { getJobStatusByCode } = await import("@/server/job-reference");
  const { getDispatchAssignmentStatusByCode } = await import("@/server/dispatch-reference");
  const { markJobReadyToBill } = await import("@/server/jobs");
  const { createClientInvoice } = await import("@/server/billing/client-invoices");

  async function teardownTenant(id: string) {
    await db.transaction(async (tx) => {
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
    });
  }
  function finish() {
    console.log(`\n${failed.length === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed.length} failed`);
    if (failed.length) console.error("failed:", failed.join(" | "));
  }
  const histCount = async (tId: string, jobId: string) =>
    (await db.select({ id: jobStatusHistory.id }).from(jobStatusHistory).where(and(eq(jobStatusHistory.tenantId, tId), eq(jobStatusHistory.jobId, jobId)))).length;
  const jobStatusId = async (jobId: string) =>
    (await db.select({ s: jobs.currentStatusId }).from(jobs).where(eq(jobs.id, jobId)))[0]?.s;

  {
    const prior = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG)).limit(1);
    if (prior[0]) await teardownTenant(prior[0].id);
  }

  let tId = "";
  try {
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [handy] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HANDY"));
    const S: Record<string, string> = {};
    for (const c of ["NEW", "DISPATCHED", "IN_PROGRESS", "ON_HOLD", "PENDING_INVOICE", "CLOSED"]) {
      const s = await getJobStatusByCode(c); if (s) S[c] = s.id;
    }
    const accepted = await getDispatchAssignmentStatusByCode("ACCEPTED");
    const onSite = await getDispatchAssignmentStatusByCode("ON_SITE");
    check("setup: operator + HANDY + job statuses + dispatch statuses resolve",
      !!operator && !!handy && Object.keys(S).length === 6 && !!accepted && !!onSite);
    if (!operator || !handy || Object.keys(S).length !== 6 || !accepted || !onSite) return finish();

    // ════ SEED ════
    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Ready-to-Bill Harness" });
    const clientA = uuidv7();
    await db.insert(clients).values({ id: clientA, tenantId: tId, name: "RTB Client" });
    const locA = uuidv7();
    await db.insert(clientLocations).values({ id: locA, tenantId: tId, clientId: clientA, name: "Loc", addressLine1: "1 St", city: "X", stateProvince: "NV", postalCode: "89101" });

    let n = 0;
    const mkJob = async (statusId: string) => {
      const id = uuidv7();
      await db.insert(jobs).values({ id, tenantId: tId, jobNumber: ++n, clientId: clientA, clientLocationId: locA, primaryTradeId: handy.id, currentStatusId: statusId, problemDescription: "rtb harness" });
      return id;
    };

    // H1 — IN_PROGRESS → PENDING_INVOICE + history/event/audit
    const jInProg = await mkJob(S.IN_PROGRESS);
    await markJobReadyToBill({ tenantId: tId, jobId: jInProg, actorUserId: operator.id, note: "ops done" });
    check("H1 status → PENDING_INVOICE", (await jobStatusId(jInProg)) === S.PENDING_INVOICE);
    const h1 = (await db.select({ from: jobStatusHistory.fromStatusId, to: jobStatusHistory.toStatusId })
      .from(jobStatusHistory).where(and(eq(jobStatusHistory.tenantId, tId), eq(jobStatusHistory.jobId, jInProg))))
      .find((r) => r.to === S.PENDING_INVOICE);
    check("H1 job_status_history {IN_PROGRESS → PENDING_INVOICE}", !!h1 && h1.from === S.IN_PROGRESS);
    const [ev] = await db.select({ t: jobEvents.eventType, m: jobEvents.metadata }).from(jobEvents)
      .where(and(eq(jobEvents.tenantId, tId), eq(jobEvents.jobId, jInProg), eq(jobEvents.eventType, "job.status_changed")));
    const evMeta = (typeof ev?.m === "string" ? JSON.parse(ev.m) : ev?.m) as Record<string, unknown> | null;
    check("H1 job_events job.status_changed (reason ops_handoff)", !!evMeta && evMeta.reason === "ops_handoff", JSON.stringify(evMeta));
    const aud = await db.select({ a: auditLogs.action }).from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tId), eq(auditLogs.targetId, jInProg), eq(auditLogs.action, "job.ready_to_bill")));
    check("H1 audit job.ready_to_bill", aud.length === 1);

    // H2 — ON_HOLD handoffable
    const jHold = await mkJob(S.ON_HOLD);
    await markJobReadyToBill({ tenantId: tId, jobId: jHold, actorUserId: operator.id });
    check("H2 ON_HOLD → PENDING_INVOICE (on-hold handoffable)", (await jobStatusId(jHold)) === S.PENDING_INVOICE);

    // H3 — NEW handoffable
    const jNew = await mkJob(S.NEW);
    await markJobReadyToBill({ tenantId: tId, jobId: jNew, actorUserId: operator.id });
    check("H3 NEW → PENDING_INVOICE", (await jobStatusId(jNew)) === S.PENDING_INVOICE);

    // H4 — already PENDING_INVOICE rejected
    const jPending = await mkJob(S.PENDING_INVOICE);
    const beforeH4 = await histCount(tId, jPending);
    let h4threw = false, h4guard = false;
    try { await markJobReadyToBill({ tenantId: tId, jobId: jPending, actorUserId: operator.id }); }
    catch (e) { h4threw = true; h4guard = e instanceof Error && e.message === "JOB_NOT_HANDOFFABLE"; }
    check("H4 already PENDING_INVOICE → JOB_NOT_HANDOFFABLE, status unchanged, no new history",
      h4threw && h4guard && (await jobStatusId(jPending)) === S.PENDING_INVOICE && (await histCount(tId, jPending)) === beforeH4);

    // H5 — terminal CLOSED rejected
    const jClosed = await mkJob(S.CLOSED);
    let h5threw = false, h5guard = false;
    try { await markJobReadyToBill({ tenantId: tId, jobId: jClosed, actorUserId: operator.id }); }
    catch (e) { h5threw = true; h5guard = e instanceof Error && e.message === "JOB_NOT_HANDOFFABLE"; }
    check("H5 terminal CLOSED → JOB_NOT_HANDOFFABLE, status unchanged",
      h5threw && h5guard && (await jobStatusId(jClosed)) === S.CLOSED);

    // H6 — MULTI-VENDOR: handoff succeeds, dispatches + vendor invoices UNTOUCHED
    const jMulti = await mkJob(S.IN_PROGRESS);
    const vendorId = uuidv7();
    await db.insert(vendors).values({ id: vendorId, tenantId: tId, name: "RTB Vendor" });
    const mkAssign = async (statusId: string) => {
      const id = uuidv7();
      await db.insert(jobVendorAssignments).values({ id, tenantId: tId, jobId: jMulti, vendorId, currentStatusId: statusId,
        matchedTradeId: handy.id, matchedTradeWasPrimary: true, tightestGeoAtDispatch: "postal_code",
        matchedGeoTypesAtDispatch: ["postal_code"], complianceStatusAtDispatch: "ok" });
      return id;
    };
    const a1 = await mkAssign(accepted.id);   // active, not complete
    const a2 = await mkAssign(onSite.id);     // active, not complete
    const mkVinv = async (assignmentId: string, total: string) => {
      const id = uuidv7();
      await db.insert(vendorInvoices).values({ id, tenantId: tId, jobId: jMulti, vendorId, assignmentId, status: "received", total });
      return id;
    };
    const vi1 = await mkVinv(a1, "100.00");
    const vi2 = await mkVinv(a2, "200.00");

    await markJobReadyToBill({ tenantId: tId, jobId: jMulti, actorUserId: operator.id });
    check("H6 multi-vendor handoff → job PENDING_INVOICE (NO dispatch precondition)", (await jobStatusId(jMulti)) === S.PENDING_INVOICE);
    const [a1after] = await db.select({ s: jobVendorAssignments.currentStatusId }).from(jobVendorAssignments).where(eq(jobVendorAssignments.id, a1));
    const [a2after] = await db.select({ s: jobVendorAssignments.currentStatusId }).from(jobVendorAssignments).where(eq(jobVendorAssignments.id, a2));
    check("H6 the 2 dispatches' statuses UNCHANGED (ACCEPTED + ON_SITE)", a1after?.s === accepted.id && a2after?.s === onSite.id);
    const [vi1after] = await db.select({ st: vendorInvoices.status, tot: vendorInvoices.total }).from(vendorInvoices).where(eq(vendorInvoices.id, vi1));
    const [vi2after] = await db.select({ st: vendorInvoices.status, tot: vendorInvoices.total }).from(vendorInvoices).where(eq(vendorInvoices.id, vi2));
    check("H6 the 2 vendor invoices UNTOUCHED (status received, totals intact)",
      vi1after?.st === "received" && vi1after?.tot === "100.00" && vi2after?.st === "received" && vi2after?.tot === "200.00");

    // H7 — NEVER-BLOCK: createClientInvoice works on a job that never hit PENDING_INVOICE
    const jNeverBill = await mkJob(S.DISPATCHED);
    const ci = await createClientInvoice({ tenantId: tId, jobId: jNeverBill, clientId: clientA, createdByUserId: operator.id });
    check("H7 never-block: createClientInvoice succeeds on a DISPATCHED job (no PENDING_INVOICE precondition)",
      !!ci?.id && (await jobStatusId(jNeverBill)) === S.DISPATCHED, ci?.id ?? "no id");

    // H8 — double-apply: 2nd call rejected, no double history
    const jIdem = await mkJob(S.DISPATCHED);
    await markJobReadyToBill({ tenantId: tId, jobId: jIdem, actorUserId: operator.id });
    const afterFirst = await histCount(tId, jIdem);
    let h8threw = false, h8guard = false;
    try { await markJobReadyToBill({ tenantId: tId, jobId: jIdem, actorUserId: operator.id }); }
    catch (e) { h8threw = true; h8guard = e instanceof Error && e.message === "JOB_NOT_HANDOFFABLE"; }
    check("H8 double-apply: 2nd → JOB_NOT_HANDOFFABLE, no extra history",
      h8threw && h8guard && (await histCount(tId, jIdem)) === afterFirst && (await jobStatusId(jIdem)) === S.PENDING_INVOICE);

    return finish();
  } finally {
    if (tId) await teardownTenant(tId);
    const leftover = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG));
    console.log(`[check-rtb] teardown leftover tenants: ${leftover.length} (expect 0)`);
  }
}

main().then(() => process.exit(failed.length === 0 ? 0 : 1)).catch((e) => { console.error("THREW:", e); process.exit(1); });
