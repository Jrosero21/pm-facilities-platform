/**
 * scripts/check-invoice-rate-sheet.ts — Phase (ii) Unit 2b invoice rate-sheet harness.
 *
 * Acceptance proof for the invoice-creator's rate_sheet fork (draft-build + publish provenance):
 *   DRAFT-BUILD FORK (runInvoiceCreator, mock LLM → the real index.ts join loop) — CONSERVATIVE
 *   time-unit rule: only an EXPLICIT recognized time unit fills the agreed rate; everything else blanks:
 *     D1   rate_sheet labor, unit='hr' → unit_price = the AGREED rate (75, NOT vendor 72), markup null,
 *          suggestedUnitPrice + trade/rate provenance, vendorUnitPrice = 72 (reference)
 *     D1b  VARIANT time unit ('hrs') → also fills 75 (flexible case-insensitive recognition)
 *     Dbare BARE quantity (qty=4, unit=null) → BLANK (quantity alone NEVER fills — the operator's real
 *          vendor data case); vendor cost shown as reference
 *     D2   rate_sheet LUMPED labor (qty=1, no time unit) → unit_price BLANK "", vendorUnitPrice ref
 *     D3   rate_sheet MATERIALS → unit_price BLANK "", markup null, vendorUnitPrice = 50 (reference)
 *     D4   rate_sheet labor (unit='hr') with NO rate on file for the trade → BLANK (never marked up)
 *     D5   cost_plus client → every line unit_price = vendor cost, markup = rule markup, NO vendorUnitPrice,
 *          NO provenance (byte-identical to pre-2b)
 *   PUBLISH PROVENANCE (server re-verify — addClientInvoiceLineItem):
 *     P1 publish rate_sheet labor at 75 (== agreed) with tradeId → trade_id=HANDY + rate_type=hourly + markup null
 *     P2 publish rate_sheet labor OVERRIDDEN to 200 (≠75) with tradeId → NO provenance, markup null (rate_sheet)
 *     P3 publish rate_sheet materials at an operator price (80) → NO provenance, markup null (no auto-markup)
 *     P4 publish cost_plus → markup = rule markup applied, NO provenance (cost_plus unchanged)
 *
 * No real LLM — INVOICE_CREATOR_MOCK forces the deterministic stub (the mock emits no reconciliation,
 * so the join loop maps the SEEDED vendor lines verbatim — full control of category/unit/cost). Rates
 * are operator-entered contractual data. SANDBOX ONLY — hard-guarded (exit 2). Self-seeds tenant + 2
 * clients + jobs + vendor invoices + drafts, reuses the global seed operator + real seeded trades.
 * Self-teardown. Run: pnpm run db:check:invoice-rate-sheet
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-invoice-rate-sheet] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-invoice-rate-sheet] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
process.env.INVOICE_CREATOR_MOCK = "1"; // deterministic stub — no real LLM call
console.log(`[check-invoice-rate-sheet] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "invoice-rate-sheet-harness-tenant";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, clientRates, clientBillingRules, auditLogs, users, trades,
    jobs, jobStatuses, vendors, vendorInvoices, vendorInvoiceLineItems, invoiceDrafts, invoiceReviews,
    clientInvoices, clientInvoiceLineItems, jobBillingEvents, agentRuns, agentToolCalls, agentDecisions,
  } = await import("@/server/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { createClientRate } = await import("@/server/billing/client-rates");
  const { createClientBillingRule } = await import("@/server/billing/billing-rules");
  const { listClientInvoiceLineItems } = await import("@/server/billing/client-invoices");
  const { runInvoiceCreator } = await import("@/server/agents/invoice-creator");
  const { createInvoiceDraft, listInvoiceDraftsForJobDetailed } =
    await import("@/server/agents/invoice-creator/drafts");
  const { createInvoiceReview } = await import("@/server/agents/invoice-creator/reviews");
  const { publishInvoiceDraft } = await import("@/server/agents/invoice-creator/publish");

  type DraftContent = Parameters<typeof createInvoiceDraft>[0]["proposedInvoice"];

  let tId = "";

  async function teardownTenant(id: string) {
    await db.transaction(async (tx) => {
      // children-first by tracked tenant id
      await tx.delete(clientInvoiceLineItems).where(eq(clientInvoiceLineItems.tenantId, id));
      await tx.delete(clientInvoices).where(eq(clientInvoices.tenantId, id));
      await tx.delete(invoiceReviews).where(eq(invoiceReviews.tenantId, id));
      await tx.delete(invoiceDrafts).where(eq(invoiceDrafts.tenantId, id));
      await tx.delete(jobBillingEvents).where(eq(jobBillingEvents.tenantId, id));
      await tx.delete(agentToolCalls).where(eq(agentToolCalls.tenantId, id));
      await tx.delete(agentDecisions).where(eq(agentDecisions.tenantId, id));
      await tx.delete(agentRuns).where(eq(agentRuns.tenantId, id));
      await tx.delete(vendorInvoiceLineItems).where(eq(vendorInvoiceLineItems.tenantId, id));
      await tx.delete(vendorInvoices).where(eq(vendorInvoices.tenantId, id));
      await tx.delete(vendors).where(eq(vendors.tenantId, id));
      await tx.delete(jobs).where(eq(jobs.tenantId, id));
      await tx.delete(clientLocations).where(eq(clientLocations.tenantId, id));
      await tx.delete(clientRates).where(eq(clientRates.tenantId, id));
      await tx.delete(clientBillingRules).where(eq(clientBillingRules.tenantId, id));
      await tx.delete(auditLogs).where(eq(auditLogs.tenantId, id));
      await tx.delete(clients).where(eq(clients.tenantId, id));
      await tx.delete(tenants).where(eq(tenants.id, id));
    });
  }

  // pre-clean a leftover harness tenant (idempotency)
  {
    const prior = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG)).limit(1);
    if (prior[0]) await teardownTenant(prior[0].id);
  }

  const leftover = async () =>
    (await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG))).length;

  try {
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [handy] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HANDY"));
    const [elec] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "ELEC"));
    const [statusDone] = await db.select({ id: jobStatuses.id }).from(jobStatuses).where(eq(jobStatuses.code, "COMPLETED"));
    check("setup: seed operator + HANDY/ELEC trades + COMPLETED status exist",
      !!operator && !!handy && !!elec && !!statusDone);
    if (!operator || !handy || !elec || !statusDone) return finish();

    // ════════ SEED ════════
    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Invoice Rate-Sheet Harness Tenant" });

    const clientA = uuidv7(); // rate_sheet
    const clientB = uuidv7(); // cost_plus
    await db.insert(clients).values({ id: clientA, tenantId: tId, name: "Rate-Sheet Client A", billingModel: "rate_sheet" });
    await db.insert(clients).values({ id: clientB, tenantId: tId, name: "Cost-Plus Client B", billingModel: "cost_plus" });

    // Client B default billing rule (markup 20%) — the cost-plus markup applied at publish (P4 / D5).
    await createClientBillingRule({
      tenantId: tId, clientId: clientB, actorUserId: operator.id, name: "Default", markupPercent: "20", isDefault: true,
    });

    const locA = uuidv7();
    const locB = uuidv7();
    const loc = (id: string, clientId: string, name: string) => ({
      id, tenantId: tId, clientId, name,
      addressLine1: "1 Test St", city: "Testville", stateProvince: "NV", postalCode: "89101",
    });
    await db.insert(clientLocations).values([loc(locA, clientA, "Loc A"), loc(locB, clientB, "Loc B")]);

    const jobA = uuidv7();     // clientA / rate_sheet, primary HANDY (D1/D2/D3 + P1/P2/P3)
    const jobAelec = uuidv7(); // clientA / rate_sheet, primary ELEC (no ELEC rate) (D4)
    const jobB = uuidv7();     // clientB / cost_plus (D5 + P4)
    const mkJob = (id: string, num: number, clientId: string, locId: string, tradeId: string) => ({
      id, tenantId: tId, jobNumber: num, clientId, clientLocationId: locId,
      primaryTradeId: tradeId, currentStatusId: statusDone.id, problemDescription: "Invoice harness job",
    });
    await db.insert(jobs).values([
      mkJob(jobA, 1, clientA, locA, handy.id),
      mkJob(jobAelec, 2, clientA, locA, elec.id),
      mkJob(jobB, 3, clientB, locB, handy.id),
    ]);

    // Rate: clientA HANDY hourly 75 (the agreed rate). No ELEC rate on file (drives D4 blank).
    await createClientRate({ tenantId: tId, clientId: clientA, actorUserId: operator.id, tradeId: handy.id, rateType: "hourly", amount: "75" });

    const vendorId = uuidv7();
    await db.insert(vendors).values({ id: vendorId, tenantId: tId, name: "Test Vendor" });

    // Seed a vendor invoice + lines on a job. Lines: [itemized labor hr/4/72, lumped labor (no unit), materials 50].
    const seedVendorInvoice = async (
      jobId: string,
      lines: { category: string; description: string; quantity: string; unit: string | null; unitPrice: string }[],
    ): Promise<string> => {
      const viId = uuidv7();
      const total = lines.reduce((s, l) => s + parseFloat(l.unitPrice) * parseFloat(l.quantity), 0).toFixed(2);
      await db.insert(vendorInvoices).values({
        id: viId, tenantId: tId, jobId, vendorId, status: "received", subtotal: total, total,
      });
      await db.insert(vendorInvoiceLineItems).values(
        lines.map((l, i) => ({
          id: uuidv7(), tenantId: tId, vendorInvoiceId: viId, lineNumber: i + 1,
          category: l.category as typeof vendorInvoiceLineItems.$inferInsert["category"],
          description: l.description, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice,
        })),
      );
      return viId;
    };

    // jobA (rate_sheet) — covers every detection case (found by description in the asserts below).
    // CONSERVATIVE time-unit rule: only an explicit recognized time unit fills the agreed rate.
    const A_LINES = [
      { category: "labor", description: "labor-hr", quantity: "4", unit: "hr", unitPrice: "72" },     // explicit time unit → FILLS 75
      { category: "labor", description: "labor-hrs", quantity: "3", unit: "hrs", unitPrice: "60" },    // VARIANT time unit → FILLS 75
      { category: "labor", description: "labor-bareqty", quantity: "4", unit: null, unitPrice: "80" }, // BARE qty, no unit → BLANK
      { category: "labor", description: "labor-lump", quantity: "1", unit: null, unitPrice: "300" },   // lump → BLANK
      { category: "materials", description: "materials", quantity: "1", unit: null, unitPrice: "50" }, // materials → BLANK
    ];
    // jobB (cost_plus) — unchanged 3-line set for the byte-identical regression check (D5).
    const B_LINES = [
      { category: "labor", description: "Itemized labor", quantity: "4", unit: "hr", unitPrice: "72" },
      { category: "labor", description: "Lumped labor", quantity: "1", unit: null, unitPrice: "300" },
      { category: "materials", description: "Parts", quantity: "1", unit: null, unitPrice: "50" },
    ];
    const viA = await seedVendorInvoice(jobA, A_LINES);
    const viAelec = await seedVendorInvoice(jobAelec, [
      { category: "labor", description: "ELEC labor", quantity: "3", unit: "hr", unitPrice: "60" }, // time unit but NO rate → BLANK
    ]);
    const viB = await seedVendorInvoice(jobB, B_LINES);

    // ════════ DRAFT-BUILD FORK (runInvoiceCreator mock → real index.ts) ════════
    console.log("\n[D] DRAFT-BUILD FORK — runInvoiceCreator (mock LLM) over the real join loop");
    const draftLines = async (jobId: string, vendorInvoiceId: string) => {
      await runInvoiceCreator({ tenantId: tId, jobId, vendorInvoiceId, triggeredByUserId: operator.id });
      const detailed = await listInvoiceDraftsForJobDetailed(tId, jobId);
      const pend = detailed.filter((d) => d.status === "pending_review")[0];
      return pend?.proposedInvoice.lineItems ?? [];
    };

    const aLines = await draftLines(jobA, viA);
    const byDesc = (d: string) => aLines.find((l) => l.description === d);
    const aHr = byDesc("labor-hr");
    const aHrs = byDesc("labor-hrs");
    const aBare = byDesc("labor-bareqty");
    const aLump = byDesc("labor-lump");
    const aMat = byDesc("materials");
    check("D1: rate_sheet itemized labor (unit 'hr') → unit_price 75.00 (agreed rate, NOT vendor 72), markup null, provenance + vendor ref 72",
      aHr?.unitPrice === "75.00" && aHr?.markupPercent == null && aHr?.suggestedUnitPrice === "75.00"
        && aHr?.tradeId === handy.id && aHr?.rateType === "hourly" && aHr?.vendorUnitPrice === "72.00",
      JSON.stringify({ up: aHr?.unitPrice, mk: aHr?.markupPercent, sug: aHr?.suggestedUnitPrice, tr: aHr?.tradeId === handy.id, vr: aHr?.vendorUnitPrice }));
    check("D1b: VARIANT time unit ('hrs') → fills 75.00 (flexible case-insensitive recognition), provenance + vendor ref 60",
      aHrs?.unitPrice === "75.00" && aHrs?.markupPercent == null && aHrs?.tradeId === handy.id && aHrs?.vendorUnitPrice === "60.00",
      JSON.stringify({ up: aHrs?.unitPrice, tr: aHrs?.tradeId === handy.id, vr: aHrs?.vendorUnitPrice }));
    // CF-27.15: a bare/lump labor line with a rate ON FILE (hours unknown) stays BLANK-priced but
    // CARRIES agreedRate + tradeId (never suggestedUnitPrice), so the review can offer "enter hours →
    // agreed rate". So tradeId === handy.id here (NOT null); the blank-price invariant is what matters.
    check("Dbare: BARE quantity (qty=4, unit=null, no time unit) → BLANK price; CF-27.15 carries tradeId (rate on file), no suggestion, vendor ref 80",
      aBare?.unitPrice === "" && aBare?.suggestedUnitPrice == null && aBare?.tradeId === handy.id && aBare?.vendorUnitPrice === "80.00",
      JSON.stringify({ up: aBare?.unitPrice, sug: aBare?.suggestedUnitPrice, tr: aBare?.tradeId, vr: aBare?.vendorUnitPrice }));
    check("D2: rate_sheet lumped labor (qty=1, no time unit) → unit_price BLANK, no suggestion, CF-27.15 tradeId carried, vendor ref 300",
      aLump?.unitPrice === "" && aLump?.suggestedUnitPrice == null && aLump?.tradeId === handy.id && aLump?.vendorUnitPrice === "300.00",
      JSON.stringify({ up: aLump?.unitPrice, sug: aLump?.suggestedUnitPrice, tr: aLump?.tradeId, vr: aLump?.vendorUnitPrice }));
    check("D3: rate_sheet materials → unit_price BLANK, markup null, vendor ref 50",
      aMat?.unitPrice === "" && aMat?.markupPercent == null && aMat?.vendorUnitPrice === "50.00" && aMat?.tradeId == null,
      JSON.stringify({ up: aMat?.unitPrice, mk: aMat?.markupPercent, vr: aMat?.vendorUnitPrice }));

    const aelecLines = await draftLines(jobAelec, viAelec);
    const aelecLab = aelecLines.find((l) => l.category === "labor");
    check("D4: rate_sheet itemized labor, NO rate on file for the trade (ELEC) → BLANK (never marked up)",
      aelecLab?.unitPrice === "" && aelecLab?.markupPercent == null && aelecLab?.tradeId == null && aelecLab?.vendorUnitPrice === "60.00",
      JSON.stringify({ up: aelecLab?.unitPrice, mk: aelecLab?.markupPercent, vr: aelecLab?.vendorUnitPrice }));

    const bLines = await draftLines(jobB, viB);
    const bCostPrices = new Set(bLines.map((l) => l.unitPrice));
    const bAllCostPlus = bLines.length === 3
      && bLines.every((l) => l.markupPercent === "20.000" && l.vendorUnitPrice === undefined
        && l.tradeId === undefined && l.suggestedUnitPrice === undefined)
      && ["72.00", "300.00", "50.00"].every((p) => bCostPrices.has(p)); // unit_price == vendor cost, order-independent
    check("D5: cost_plus → ALL lines unit_price = vendor cost, markup = rule 20.000, NO vendorUnitPrice/provenance (byte-identical)",
      bAllCostPlus,
      JSON.stringify(bLines.map((l) => ({ up: l.unitPrice, mk: l.markupPercent, vr: l.vendorUnitPrice ?? null, tr: l.tradeId ?? null }))));

    // ════════ PUBLISH PROVENANCE (server re-verify) ════════
    console.log("\n[P] PUBLISH PROVENANCE — addClientInvoiceLineItem re-verifies the agreed rate");
    const publishOne = async (
      jobId: string,
      clientId: string,
      vendorInvoiceId: string,
      line: Record<string, unknown>,
    ): Promise<Awaited<ReturnType<typeof listClientInvoiceLineItems>>[number]> => {
      const runId = uuidv7();
      await db.insert(agentRuns).values({ id: runId, tenantId: tId, agentId: "invoice_creator_v1", jobId, startedAt: new Date() });
      const draft = await createInvoiceDraft({
        tenantId: tId, jobId, agentRunId: runId, vendorInvoiceId, clientId,
        proposedInvoice: { lineItems: [line], lumpFlag: false } as unknown as DraftContent,
      });
      await createInvoiceReview({ tenantId: tId, draftId: draft.id, reviewerUserId: operator.id, decision: "approve", editedContent: null });
      const { clientInvoiceId } = await publishInvoiceDraft({ tenantId: tId, jobId, draftId: draft.id, actorUserId: operator.id });
      return (await listClientInvoiceLineItems(tId, clientInvoiceId))[0];
    };

    // P1 — rate_sheet labor kept at the agreed rate (75) with the trade → provenance recorded.
    const p1 = await publishOne(jobA, clientA, viA, {
      category: "labor", description: "HVAC labor", quantity: "4", unit: "hr",
      unitPrice: "75.00", markupPercent: null, tradeId: handy.id, rateType: "hourly",
    });
    check("P1: rate_sheet labor 75 == agreed → trade_id=HANDY + rate_type=hourly + markup null (server-verified)",
      p1?.unitPrice === "75.00" && p1?.tradeId === handy.id && p1?.rateType === "hourly" && p1?.markupPercent === null,
      JSON.stringify({ up: p1?.unitPrice, tr: p1?.tradeId === handy.id, rt: p1?.rateType, mk: p1?.markupPercent }));

    // P2 — rate_sheet labor OVERRIDDEN to 200 (≠75) with the tradeId still tagged → provenance dropped.
    const p2 = await publishOne(jobA, clientA, viA, {
      category: "labor", description: "HVAC labor", quantity: "4", unit: "hr",
      unitPrice: "200.00", markupPercent: null, tradeId: handy.id, rateType: "hourly",
    });
    check("P2: override 200 ≠ agreed 75 (tradeId tagged) → NO provenance (trade/rate null), markup null (rate_sheet)",
      p2?.unitPrice === "200.00" && p2?.tradeId === null && p2?.rateType === null && p2?.markupPercent === null,
      JSON.stringify({ up: p2?.unitPrice, tr: p2?.tradeId, rt: p2?.rateType, mk: p2?.markupPercent }));

    // P3 — rate_sheet materials at an operator price (80) → no provenance, no markup.
    const p3 = await publishOne(jobA, clientA, viA, {
      category: "materials", description: "Parts", quantity: "1", unit: null, unitPrice: "80.00", markupPercent: null,
    });
    check("P3: rate_sheet materials at operator price 80 → NO provenance, markup null (no auto-markup)",
      p3?.unitPrice === "80.00" && p3?.tradeId === null && p3?.rateType === null && p3?.markupPercent === null,
      JSON.stringify({ up: p3?.unitPrice, tr: p3?.tradeId, mk: p3?.markupPercent }));

    // P4 — cost_plus publish → rule markup applied, no provenance (regression: cost_plus unchanged).
    const p4 = await publishOne(jobB, clientB, viB, {
      category: "materials", description: "Parts", quantity: "1", unit: null, unitPrice: "50.00", markupPercent: "20.000",
    });
    check("P4: cost_plus → markup re-snapshot to rule 20.000, NO provenance, unit_price 50 (cost_plus unchanged)",
      p4?.unitPrice === "50.00" && p4?.markupPercent === "20.000" && p4?.tradeId === null && p4?.rateType === null,
      JSON.stringify({ up: p4?.unitPrice, mk: p4?.markupPercent, tr: p4?.tradeId }));

    console.log("\n[HONESTY]");
    console.log("  [check-invoice-rate-sheet] SEEDED-FIXTURE proof on the REAL draft-build + publish path.");
    console.log("  Mock LLM (no reconciliation) → the join loop maps the seeded vendor lines verbatim, so the");
    console.log("  fork runs on real category/unit/cost. Proves: rate_sheet itemized labor bills the AGREED");
    console.log("  rate (decoupled from vendor cost); lumped labor + materials + no-rate-on-file go BLANK;");
    console.log("  cost_plus is byte-identical; and publish RE-VERIFIES the agreed rate server-side before");
    console.log("  stamping provenance — an override or materials price records none, and cost_plus marks up.");

    // teardown + verify-empty IN-TALLY, then report
    await teardownTenant(tId);
    const n = await leftover();
    tId = "";
    check("teardown: 0 leftover harness tenants", n === 0, `found ${n}`);
    return finish();
  } finally {
    if (tId) {
      try { await teardownTenant(tId); } catch (e) { console.error("[check-invoice-rate-sheet] teardown warning:", e); }
    }
    console.log("[check-invoice-rate-sheet] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-invoice-rate-sheet] passed: ${passed}`);
  console.log(`[check-invoice-rate-sheet] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-invoice-rate-sheet] INVOICE-RATE-SHEET LEDGER RED ✗");
  } else {
    console.log("[check-invoice-rate-sheet] INVOICE-RATE-SHEET LEDGER GREEN ✓ (itemized labor → agreed rate / lumped+materials+no-rate → blank / cost_plus byte-identical / publish re-verifies provenance / override+materials drop it)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => { console.error("[check-invoice-rate-sheet] FAILED:", e); process.exit(1); });
