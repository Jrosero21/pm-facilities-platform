/**
 * scripts/check-operator-enters-hours.ts — CF-27.15 operator-enters-hours-at-review harness.
 *
 * Acceptance proof for the agreedRate CARRY (draft-build) + the operator-hours publish path:
 *   DRAFT-BUILD (runInvoiceCreator, mock LLM → the real index.ts fork):
 *     D1 LUMPED labor on a rate_sheet job WITH a rate on file → draft line carries agreedRate='75.00' +
 *        tradeId=HANDY + rateType=hourly, unit_price STILL BLANK '', suggestedUnitPrice ABSENT (no chip/
 *        pre-fill). The carry — the rate is present though the line is blank (hours unknown).
 *     D2 ITEMIZED labor → unchanged (unit_price=75 agreed rate, suggestedUnitPrice set) — no regression.
 *     D3 lumped labor on a job whose trade has NO rate on file → agreedRate ABSENT (nothing to offer).
 *     D4 materials → agreedRate ABSENT (not a labor line).
 *   PUBLISH (operator-entered hours → agreed-rate line + provenance):
 *     P1 operator fills the lumped line at the agreed rate (unit_price=75, qty=5 hours, tradeId/rateType
 *        passed as serialize would) → line stores 75 / qty 5 / trade=HANDY / rate=hourly / markup null;
 *        extended = 5 × 75 = 375 (provenance recorded — it IS an agreed-rate line)
 *     P2 operator OVERRIDES with a raw price (120 ≠ agreed 75), no provenance passed → stores 120, NO
 *        provenance, markup null — the raw price wins, honestly no agreed-rate claim
 *     P3 lumped line left BLANK (operator didn't click the button) → publish THROWS — the agreed rate is
 *        NEVER auto-applied; the fill is operator-initiated only
 *
 * No real LLM — INVOICE_CREATOR_MOCK forces the deterministic stub (maps the SEEDED vendor lines
 * verbatim). SANDBOX ONLY — hard-guarded (exit 2). Self-seeds tenant + client + jobs + vendor invoices,
 * reuses the seed operator. Self-teardown. Run: pnpm run db:check:operator-enters-hours
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-operator-enters-hours] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-operator-enters-hours] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
process.env.INVOICE_CREATOR_MOCK = "1"; // deterministic stub — no real LLM call
console.log(`[check-operator-enters-hours] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "operator-enters-hours-harness-tenant";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, clientRates, auditLogs, users, trades,
    jobs, jobStatuses, vendors, vendorInvoices, vendorInvoiceLineItems,
    invoiceDrafts, invoiceReviews, clientInvoices, clientInvoiceLineItems,
    jobBillingEvents, agentRuns, agentToolCalls, agentDecisions,
  } = await import("@/server/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { createClientRate } = await import("@/server/billing/client-rates");
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
      await tx.delete(auditLogs).where(eq(auditLogs.tenantId, id));
      await tx.delete(clients).where(eq(clients.tenantId, id));
      await tx.delete(tenants).where(eq(tenants.id, id));
    });
  }

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
    check("setup: seed operator + HANDY/ELEC trades + COMPLETED status exist", !!operator && !!handy && !!elec && !!statusDone);
    if (!operator || !handy || !elec || !statusDone) return finish();

    // ════════ SEED ════════
    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Operator-Enters-Hours Harness Tenant" });
    const clientA = uuidv7();
    await db.insert(clients).values({ id: clientA, tenantId: tId, name: "Rate-Sheet Client", billingModel: "rate_sheet" });
    const locA = uuidv7();
    await db.insert(clientLocations).values({ id: locA, tenantId: tId, clientId: clientA, name: "Loc", addressLine1: "1 Test St", city: "Testville", stateProvince: "NV", postalCode: "89101" });

    const jobA = uuidv7();   // primary HANDY (has a rate)
    const jobNoRate = uuidv7(); // primary ELEC (no ELEC rate)
    await db.insert(jobs).values([
      { id: jobA, tenantId: tId, jobNumber: 1, clientId: clientA, clientLocationId: locA, primaryTradeId: handy.id, currentStatusId: statusDone.id, problemDescription: "Hours harness job" },
      { id: jobNoRate, tenantId: tId, jobNumber: 2, clientId: clientA, clientLocationId: locA, primaryTradeId: elec.id, currentStatusId: statusDone.id, problemDescription: "No-rate job" },
    ]);
    // HANDY hourly 75 only — no ELEC rate (drives D3).
    await createClientRate({ tenantId: tId, clientId: clientA, actorUserId: operator.id, tradeId: handy.id, rateType: "hourly", amount: "75" });

    const vendorId = uuidv7();
    await db.insert(vendors).values({ id: vendorId, tenantId: tId, name: "Hours Harness Vendor" });
    const seedVendorInvoice = async (jobId: string, lines: { category: string; description: string; quantity: string; unit: string | null; unitPrice: string }[]): Promise<string> => {
      const viId = uuidv7();
      await db.insert(vendorInvoices).values({ id: viId, tenantId: tId, jobId, vendorId, status: "received" });
      await db.insert(vendorInvoiceLineItems).values(
        lines.map((l, i) => ({
          id: uuidv7(), tenantId: tId, vendorInvoiceId: viId, lineNumber: i + 1,
          category: l.category as typeof vendorInvoiceLineItems.$inferInsert["category"],
          description: l.description, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice,
        })),
      );
      return viId;
    };

    const viA = await seedVendorInvoice(jobA, [
      { category: "labor", description: "itemized", quantity: "4", unit: "hr", unitPrice: "72" },  // D2
      { category: "labor", description: "lumped", quantity: "1", unit: null, unitPrice: "300" },   // D1
      { category: "materials", description: "materials", quantity: "1", unit: null, unitPrice: "50" }, // D4
    ]);
    const viNoRate = await seedVendorInvoice(jobNoRate, [
      { category: "labor", description: "norate", quantity: "1", unit: null, unitPrice: "200" },   // D3
    ]);

    // ════════ DRAFT-BUILD — the agreedRate carry ════════
    console.log("\n[D] DRAFT-BUILD — runInvoiceCreator (mock) → index.ts agreedRate carry");
    const draftLines = async (jobId: string, vendorInvoiceId: string) => {
      await runInvoiceCreator({ tenantId: tId, jobId, vendorInvoiceId, triggeredByUserId: operator.id });
      const detailed = await listInvoiceDraftsForJobDetailed(tId, jobId);
      return detailed.filter((d) => d.status === "pending_review")[0]?.proposedInvoice.lineItems ?? [];
    };
    const aLines = await draftLines(jobA, viA);
    const byDesc = (d: string) => aLines.find((l) => l.description === d);
    const dItem = byDesc("itemized");
    const dLump = byDesc("lumped");
    const dMat = byDesc("materials");

    check("D1: LUMPED labor (rate on file) → agreedRate '75.00' + trade=HANDY + rate=hourly, unit_price BLANK, NO suggestion",
      dLump?.agreedRate === "75.00" && dLump?.tradeId === handy.id && dLump?.rateType === "hourly"
        && dLump?.unitPrice === "" && dLump?.suggestedUnitPrice == null,
      JSON.stringify({ ar: dLump?.agreedRate, tr: dLump?.tradeId === handy.id, rt: dLump?.rateType, up: dLump?.unitPrice, sug: dLump?.suggestedUnitPrice }));
    check("D2: ITEMIZED labor → unit_price 75.00 + suggestedUnitPrice 75.00 (unchanged, no regression)",
      dItem?.unitPrice === "75.00" && dItem?.suggestedUnitPrice === "75.00" && dItem?.tradeId === handy.id,
      JSON.stringify({ up: dItem?.unitPrice, sug: dItem?.suggestedUnitPrice }));
    check("D4: materials → NO agreedRate (not a labor line), blank",
      dMat?.agreedRate == null && dMat?.unitPrice === "",
      JSON.stringify({ ar: dMat?.agreedRate, up: dMat?.unitPrice }));

    const nrLines = await draftLines(jobNoRate, viNoRate);
    const dNoRate = nrLines.find((l) => l.description === "norate");
    check("D3: lumped labor, trade has NO rate on file → NO agreedRate (nothing to offer), blank, no trade",
      dNoRate?.agreedRate == null && dNoRate?.unitPrice === "" && dNoRate?.tradeId == null,
      JSON.stringify({ ar: dNoRate?.agreedRate, up: dNoRate?.unitPrice, tr: dNoRate?.tradeId }));

    // ════════ PUBLISH — operator hours × agreed rate ════════
    console.log("\n[P] PUBLISH — operator-filled line via the real publish writer");
    const publishLine = async (line: Record<string, unknown>) => {
      const runId = uuidv7();
      await db.insert(agentRuns).values({ id: runId, tenantId: tId, agentId: "invoice_creator_v1", jobId: jobA, startedAt: new Date() });
      const draft = await createInvoiceDraft({
        tenantId: tId, jobId: jobA, agentRunId: runId, vendorInvoiceId: viA, clientId: clientA,
        proposedInvoice: { lineItems: [line], lumpFlag: false } as unknown as DraftContent,
      });
      await createInvoiceReview({ tenantId: tId, draftId: draft.id, reviewerUserId: operator.id, decision: "approve", editedContent: null });
      const { clientInvoiceId } = await publishInvoiceDraft({ tenantId: tId, jobId: jobA, draftId: draft.id, actorUserId: operator.id });
      return (await listClientInvoiceLineItems(tId, clientInvoiceId))[0];
    };

    // P1 — operator filled at the agreed rate (75) with 5 hours, provenance passed (serialize would).
    const p1 = await publishLine({ category: "labor", description: "Handyman labor", quantity: "5", unit: null, unitPrice: "75.00", markupPercent: null, tradeId: handy.id, rateType: "hourly" });
    check("P1: operator 5 hrs × agreed 75 → unit_price 75, qty 5, trade=HANDY, rate=hourly, markup null, extended 375",
      p1?.unitPrice === "75.00" && p1?.quantity === "5.00" && p1?.tradeId === handy.id && p1?.rateType === "hourly"
        && p1?.markupPercent === null && p1?.extendedAmount === "375.00",
      JSON.stringify({ up: p1?.unitPrice, qty: p1?.quantity, tr: p1?.tradeId === handy.id, mk: p1?.markupPercent, ext: p1?.extendedAmount }));

    // P2 — operator OVERRODE with a raw price (120 ≠ agreed 75); serialize would NOT pass provenance.
    const p2 = await publishLine({ category: "labor", description: "Handyman labor", quantity: "5", unit: null, unitPrice: "120.00", markupPercent: null });
    check("P2: raw override 120 ≠ agreed 75 (no provenance passed) → unit_price 120, NO provenance, markup null",
      p2?.unitPrice === "120.00" && p2?.tradeId === null && p2?.rateType === null && p2?.markupPercent === null,
      JSON.stringify({ up: p2?.unitPrice, tr: p2?.tradeId, rt: p2?.rateType, mk: p2?.markupPercent }));

    // P3 — lumped line left BLANK (operator never clicked the button) → publish THROWS (never auto-filled).
    let p3Threw = false;
    try {
      await publishLine({ category: "labor", description: "Handyman labor", quantity: "1", unit: null, unitPrice: "", markupPercent: null });
    } catch { p3Threw = true; }
    check("P3: blank line left unfilled → publish THROWS (agreed rate NEVER auto-applied — operator-initiated only)", p3Threw);

    console.log("\n[HONESTY]");
    console.log("  [check-operator-enters-hours] SEEDED-FIXTURE proof on the REAL draft-build + publish writer.");
    console.log("  Mock LLM maps the seeded vendor lines verbatim, so the agreedRate carry runs on real");
    console.log("  category/unit/cost. Proves: the agreed rate is CARRIED onto a blank lumped labor line");
    console.log("  (present but not pre-filled — no chip), absent when no rate / not labor; and an operator");
    console.log("  hours-fill bills hours × the agreed rate WITH provenance, a raw override carries none, and");
    console.log("  a blank line is never silently billed (the fill is operator-initiated only).");

    await teardownTenant(tId);
    const n = await leftover();
    tId = "";
    check("teardown: 0 leftover harness tenants", n === 0, `found ${n}`);
    return finish();
  } finally {
    if (tId) {
      try { await teardownTenant(tId); } catch (e) { console.error("[check-operator-enters-hours] teardown warning:", e); }
    }
    console.log("[check-operator-enters-hours] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-operator-enters-hours] passed: ${passed}`);
  console.log(`[check-operator-enters-hours] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-operator-enters-hours] OPERATOR-ENTERS-HOURS LEDGER RED ✗");
  } else {
    console.log("[check-operator-enters-hours] OPERATOR-ENTERS-HOURS LEDGER GREEN ✓ (agreedRate carried onto blank lumped labor / absent when no-rate+materials / hours×rate fill is provenanced / raw override no false provenance / never auto-fills)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => { console.error("[check-operator-enters-hours] FAILED:", e); process.exit(1); });
