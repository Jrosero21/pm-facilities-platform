/**
 * scripts/check-job-bill-prefill.ts — CF-27.16 Piece 3 job-first "Bill this job" harness.
 *
 * Tests buildJobBillPrefill (the deterministic pre-fill) + billJobAction's CORE end-to-end
 * (createClientInvoice → prefill loop → $0 fallback; the thin action wrapper = requireTenant gate +
 * redirect, which can't run in a script, is not under test). Billing-model matrix + the cost-leak guard.
 *
 *  P1 RS itemized time-unit labor → agreed-rate line (tradeId/rateType, qty=hours, NO unitPrice) — not cost
 *  P2 RS materials → $0 + CLEAN description (no vendor cost) — not cost
 *  P3 RS no-invoice dispatch → agreed-rate labor line, quantity "1" (hours blank, not auto-filled)
 *  P4 RS no-rate trade → $0 fallback at insert (not cost) — never-block  [B3]
 *  P5 CP vendor line → vendor cost as the basis (this model DOES use cost), clean description
 *  P6 FLAT vendor line → $0 + clean description (not cost)
 *  P7 RS + FLAT: NO pre-fill description leaks the vendor cost ("vendor cost" / "$")
 *  B1 billJobAction core (RS) → draft client invoice + lines; agreed-rate line resolves to 95 + provenance
 *  B2 never-block: RS job with a no-invoice dispatch (Job #4) still bills
 *  B3 no-rate job → invoice created with the $0 line (never hard-fails)
 *
 * SANDBOX ONLY — hard-guarded (exit 2). Self-seed/teardown (0 leftover; reuses the seed operator).
 * Run: pnpm run db:check:job-bill-prefill
 */

export {};

const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) { console.error("[check-jbp] DATABASE_URL not set"); process.exit(2); }
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[check-jbp] refusing: resolved URL is not a *_sandbox DB."); process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-jbp] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "job-bill-prefill-harness-tenant";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, clientRates, jobs, jobStatuses, jobStatusHistory, jobEvents, auditLogs,
    users, trades, vendors, jobVendorAssignments, jobVendorAssignmentStatusHistory,
    vendorInvoices, vendorInvoiceLineItems, clientInvoices, clientInvoiceLineItems,
  } = await import("@/server/schema");
  const { eq, and, sql } = await import("drizzle-orm");
  const { getJobStatusByCode } = await import("@/server/job-reference");
  const { getDispatchAssignmentStatusByCode } = await import("@/server/dispatch-reference");
  const { createClientRate } = await import("@/server/billing/client-rates");
  const { createClientInvoice, addClientInvoiceLineItem } = await import("@/server/billing/client-invoices");
  const { buildJobBillPrefill } = await import("@/server/analytics/job-bill-prefill");

  // Mirrors billJobAction's core (sans the requireTenant gate + redirect): create the draft, then
  // pre-fill each line; a line with no resolvable rate and no cost falls back to $0 (never-block).
  async function runBillJobCore(tenantId: string, jobId: string, clientId: string, operatorId: string): Promise<string> {
    const { id } = await createClientInvoice({ tenantId, jobId, clientId, createdByUserId: operatorId });
    const prefill = await buildJobBillPrefill(tenantId, jobId);
    for (const line of prefill) {
      const input = {
        tenantId, clientInvoiceId: id,
        category: line.category as "labor" | "materials" | "equipment" | "trip" | "permit" | "fee" | "tax" | "other",
        description: line.description, quantity: line.quantity, unit: line.unit ?? null,
        unitPrice: line.unitPrice, markupPercent: line.markupPercent,
        tradeId: line.tradeId ?? null, rateType: line.rateType,
      };
      try { await addClientInvoiceLineItem(input); }
      catch (e) {
        if (e instanceof Error && e.message === "INVALID_LINE_UNIT_PRICE") await addClientInvoiceLineItem({ ...input, unitPrice: "0.00" });
        else throw e;
      }
    }
    return id;
  }

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
      await tx.delete(clientRates).where(eq(clientRates.tenantId, id));
      await tx.delete(auditLogs).where(eq(auditLogs.tenantId, id));
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
  const leaks = (desc: string) => desc.toLowerCase().includes("vendor cost") || desc.includes("$");

  {
    const prior = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG)).limit(1);
    if (prior[0]) await teardownTenant(prior[0].id);
  }

  let tId = "";
  try {
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [handy] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HANDY"));
    const [elec] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "ELEC"));
    const inProg = await getJobStatusByCode("IN_PROGRESS");
    const wc = await getDispatchAssignmentStatusByCode("WORK_COMPLETE");
    const accepted = await getDispatchAssignmentStatusByCode("ACCEPTED");
    check("setup: operator + HANDY + ELEC + IN_PROGRESS + dispatch statuses", !!operator && !!handy && !!elec && !!inProg && !!wc && !!accepted);
    if (!operator || !handy || !elec || !inProg || !wc || !accepted) return finish();

    // ════ SEED ════
    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Job-Bill-Prefill Harness" });
    const cRS = uuidv7(), cCP = uuidv7(), cFLAT = uuidv7();
    await db.insert(clients).values([
      { id: cRS, tenantId: tId, name: "RS Client", billingModel: "rate_sheet" },
      { id: cCP, tenantId: tId, name: "CP Client", billingModel: "cost_plus" },
      { id: cFLAT, tenantId: tId, name: "Flat Client", billingModel: "flat" },
    ]);
    const lRS = uuidv7(), lCP = uuidv7(), lFLAT = uuidv7();
    await db.insert(clientLocations).values([
      { id: lRS, tenantId: tId, clientId: cRS, name: "L", addressLine1: "1", city: "X", stateProvince: "NV", postalCode: "89101" },
      { id: lCP, tenantId: tId, clientId: cCP, name: "L", addressLine1: "1", city: "X", stateProvince: "NV", postalCode: "89101" },
      { id: lFLAT, tenantId: tId, clientId: cFLAT, name: "L", addressLine1: "1", city: "X", stateProvince: "NV", postalCode: "89101" },
    ]);
    await createClientRate({ tenantId: tId, clientId: cRS, actorUserId: operator.id, tradeId: handy.id, rateType: "hourly", amount: "95" });
    const vendorId = uuidv7();
    await db.insert(vendors).values({ id: vendorId, tenantId: tId, name: "JBP Vendor" });

    let jn = 0;
    const mkJob = async (clientId: string, locId: string, tradeId: string) => {
      const id = uuidv7();
      await db.insert(jobs).values({ id, tenantId: tId, jobNumber: ++jn, clientId, clientLocationId: locId, primaryTradeId: tradeId, currentStatusId: inProg.id, problemDescription: "jbp" });
      return id;
    };
    const mkAssign = async (jobId: string, statusId: string) => {
      const id = uuidv7();
      await db.insert(jobVendorAssignments).values({ id, tenantId: tId, jobId, vendorId, currentStatusId: statusId,
        matchedTradeId: handy.id, matchedTradeWasPrimary: true, tightestGeoAtDispatch: "postal_code", matchedGeoTypesAtDispatch: ["postal_code"], complianceStatusAtDispatch: "ok" });
      return id;
    };
    const mkVendorInvoice = async (jobId: string, assignmentId: string, lines: { category: string; description: string; quantity: string; unit: string | null; unitPrice: string }[]) => {
      const vi = uuidv7();
      await db.insert(vendorInvoices).values({ id: vi, tenantId: tId, jobId, vendorId, assignmentId, status: "received", total: "0" });
      await db.insert(vendorInvoiceLineItems).values(lines.map((l, i) => ({
        id: uuidv7(), tenantId: tId, vendorInvoiceId: vi, lineNumber: i + 1,
        category: l.category as typeof vendorInvoiceLineItems.$inferInsert["category"],
        description: l.description, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice,
      })));
      return vi;
    };

    // RS job: dispatch A (vendor invoice: itemized hr labor 60 + materials 40) + dispatch B WORK_COMPLETE (no invoice)
    const jRS = await mkJob(cRS, lRS, handy.id);
    const aRSa = await mkAssign(jRS, accepted.id);
    await mkVendorInvoice(jRS, aRSa, [
      { category: "labor", description: "On-site labor", quantity: "3", unit: "hr", unitPrice: "60" },
      { category: "materials", description: "Parts and supplies", quantity: "1", unit: null, unitPrice: "40" },
    ]);
    await mkAssign(jRS, wc.id); // dispatch B — WORK_COMPLETE, NO vendor invoice (Job #4 case)

    // CP job: 1 dispatch + vendor invoice (labor 100, materials 50)
    const jCP = await mkJob(cCP, lCP, handy.id);
    const aCP = await mkAssign(jCP, accepted.id);
    await mkVendorInvoice(jCP, aCP, [
      { category: "labor", description: "Labor", quantity: "1", unit: null, unitPrice: "100" },
      { category: "materials", description: "Materials", quantity: "1", unit: null, unitPrice: "50" },
    ]);

    // FLAT job: 1 dispatch + vendor invoice
    const jFLAT = await mkJob(cFLAT, lFLAT, handy.id);
    const aFLAT = await mkAssign(jFLAT, accepted.id);
    await mkVendorInvoice(jFLAT, aFLAT, [{ category: "labor", description: "Flat job work", quantity: "1", unit: null, unitPrice: "70" }]);

    // no-rate RS job: primary trade ELEC (no client_rate), one dispatch, no vendor invoice
    const jNoRate = await mkJob(cRS, lRS, elec.id);
    await mkAssign(jNoRate, wc.id);

    // ════ buildJobBillPrefill ════
    const pRS = await buildJobBillPrefill(tId, jRS);
    const rsLaborItemized = pRS.find((l) => l.category === "labor" && l.unit === "hr");
    check("P1 RS itemized labor → agreed-rate line (tradeId/rateType, qty=3, NO unitPrice; not vendor cost 60)",
      !!rsLaborItemized && rsLaborItemized.tradeId === handy.id && rsLaborItemized.rateType === "hourly" && Number(rsLaborItemized.quantity) === 3 && rsLaborItemized.unitPrice === undefined,
      JSON.stringify(rsLaborItemized));
    const rsMaterials = pRS.find((l) => l.category === "materials");
    check("P2 RS materials → $0 + clean description (no vendor cost 40)",
      !!rsMaterials && rsMaterials.unitPrice === "0.00" && !leaks(rsMaterials.description), JSON.stringify(rsMaterials));
    const rsNoInvoice = pRS.find((l) => l.category === "labor" && l.unit == null && l.quantity === "1" && l.tradeId === handy.id);
    check("P3 RS no-invoice dispatch → agreed-rate labor, quantity '1' (hours blank), no auto-filled unitPrice",
      !!rsNoInvoice && rsNoInvoice.unitPrice === undefined, JSON.stringify(rsNoInvoice));

    const pCP = await buildJobBillPrefill(tId, jCP);
    const cpLabor = pCP.find((l) => l.category === "labor");
    const cpMat = pCP.find((l) => l.category === "materials");
    check("P5 CP vendor lines → vendor COST as basis (labor 100, materials 50), clean descriptions",
      !!cpLabor && Number(cpLabor.unitPrice) === 100 && !leaks(cpLabor.description) && !!cpMat && Number(cpMat.unitPrice) === 50 && !leaks(cpMat.description),
      `labor=${cpLabor?.unitPrice} mat=${cpMat?.unitPrice}`);

    const pFLAT = await buildJobBillPrefill(tId, jFLAT);
    const flatLine = pFLAT.find((l) => l.category === "labor");
    check("P6 FLAT vendor line → $0 + clean description (not vendor cost 70)",
      !!flatLine && flatLine.unitPrice === "0.00" && !leaks(flatLine.description), JSON.stringify(flatLine));

    check("P7 RS + FLAT pre-fill: NO description leaks the vendor cost",
      [...pRS, ...pFLAT].every((l) => !leaks(l.description)));

    // ════ billJobAction core (end-to-end) ════
    const ciRS = await runBillJobCore(tId, jRS, cRS, operator.id);
    const [ciRow] = await db.select({ status: clientInvoices.status, jobId: clientInvoices.jobId }).from(clientInvoices).where(eq(clientInvoices.id, ciRS));
    const rsLines = await db.select().from(clientInvoiceLineItems).where(and(eq(clientInvoiceLineItems.tenantId, tId), eq(clientInvoiceLineItems.clientInvoiceId, ciRS)));
    const agreedLine = rsLines.find((l) => l.category === "labor" && l.unit === "hr");
    check("B1 billJobAction core (RS) → draft client invoice, job-keyed", ciRow?.status === "draft" && ciRow?.jobId === jRS);
    check("B1 agreed-rate line resolved to 95 + provenance (tradeId/rateType, markup null)",
      !!agreedLine && agreedLine.unitPrice === "95.00" && agreedLine.tradeId === handy.id && agreedLine.rateType === "hourly" && agreedLine.markupPercent === null,
      agreedLine ? `price=${agreedLine.unitPrice} trade=${!!agreedLine.tradeId} markup=${agreedLine.markupPercent}` : "no line");
    check("B2 never-block: RS job with a no-invoice dispatch (Job #4) still billed (3 lines incl. blank-hours)",
      rsLines.length === 3 && rsLines.some((l) => l.category === "labor" && l.unit == null && Number(l.quantity) === 1));

    const ciNoRate = await runBillJobCore(tId, jNoRate, cRS, operator.id);
    const noRateLines = await db.select().from(clientInvoiceLineItems).where(and(eq(clientInvoiceLineItems.tenantId, tId), eq(clientInvoiceLineItems.clientInvoiceId, ciNoRate)));
    check("P4/B3 no-rate job → invoice created with the $0 line (never hard-fails, not vendor cost)",
      noRateLines.length === 1 && noRateLines[0].unitPrice === "0.00", JSON.stringify(noRateLines.map((l) => l.unitPrice)));

    return finish();
  } finally {
    if (tId) await teardownTenant(tId);
    const leftover = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG));
    console.log(`[check-jbp] teardown leftover tenants: ${leftover.length} (expect 0)`);
  }
}

main().then(() => process.exit(failed.length === 0 ? 0 : 1)).catch((e) => { console.error("THREW:", e); process.exit(1); });
