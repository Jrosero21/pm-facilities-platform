/**
 * scripts/check-billing-from-rates.ts — Phase (ii) Unit 1 billing-from-rates harness.
 *
 * Acceptance proof for the labor-rate RESOLVER + the wired add-line path:
 *   RESOLVER (resolveClientLaborRate / resolveEffectiveBillingModel):
 *     R1 trade-specific rate resolves (HANDY 75)
 *     R2 a DIFFERENT trade resolves its OWN rate (ELEC 85) — the multi-trade case
 *     R3 a trade with NO rate on file → null (operator authors manually)
 *     R4 NEWEST-active-wins: a newer HANDY rate (80) supersedes the older (75)
 *     R5 DATE filtering: an expired HANDY rate (999) is ignored — 80 still wins
 *     R6 effective billing model: job.billing_model ?? client.billing_model (per-job override)
 *   ADD-LINE (the real wired behavior — resolveLaborLineDefault inside addProposalLineItem):
 *     L1 rate_sheet labor + blank price → unit_price = the agreed rate, markup null, provenance stored
 *     L2 a different trade on the SAME bill → its own rate (multi-trade)
 *     L3 an EXPLICIT price (Vegas one-off) → operator wins; rate NOT applied; no provenance
 *     L4 materials NEVER auto-resolve (judgment) — even with a trade + blank price
 *     L5 cost_plus client → no rate resolution (a rate exists but the model gates it out)
 *
 * No LLM / no agent — rates are operator-entered contractual data. SANDBOX ONLY — hard-guarded
 * (exit 2 otherwise). Self-seeds a tenant + 2 clients + jobs + proposals, reuses the global seed
 * operator + real seeded trades/status. Self-teardown. Run: pnpm run db:check:billing-from-rates
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-billing-from-rates] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-billing-from-rates] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-billing-from-rates] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "billing-from-rates-harness-tenant";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, clientRates, auditLogs, users, trades,
    jobs, jobStatuses, proposals, proposalLineItems,
  } = await import("@/server/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { createClientRate, resolveClientLaborRate, resolveEffectiveBillingModel } =
    await import("@/server/billing/client-rates");
  const { createProposal, addProposalLineItem } = await import("@/server/billing/proposals");

  let tId = "";

  async function teardownTenant(id: string) {
    await db.transaction(async (tx) => {
      // children-first by tracked tenant id
      await tx.delete(proposalLineItems).where(eq(proposalLineItems.tenantId, id));
      await tx.delete(proposals).where(eq(proposals.tenantId, id));
      await tx.delete(jobs).where(eq(jobs.tenantId, id));
      await tx.delete(clientLocations).where(eq(clientLocations.tenantId, id));
      await tx.delete(clientRates).where(eq(clientRates.tenantId, id));
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

  // helpers
  const lineRow = async (id: string) =>
    (await db.select().from(proposalLineItems).where(eq(proposalLineItems.id, id)).limit(1))[0];
  const pinCreatedAt = async (rateId: string, iso: string) =>
    db.update(clientRates).set({ createdAt: new Date(iso) }).where(eq(clientRates.id, rateId));
  const expectThrow = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); return false; } catch (e) { return (e as Error).message === msg; }
  };
  const leftover = async () =>
    (await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG))).length;

  try {
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [handy] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HANDY"));
    const [elec] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "ELEC"));
    const [hvac] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HVAC"));
    const [statusNew] = await db.select({ id: jobStatuses.id }).from(jobStatuses).where(eq(jobStatuses.code, "NEW"));
    check("setup: seed operator + HANDY/ELEC/HVAC trades + NEW status exist",
      !!operator && !!handy && !!elec && !!hvac && !!statusNew);
    if (!operator || !handy || !elec || !hvac || !statusNew) return finish();

    // ════════ SEED ════════
    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Billing-From-Rates Harness Tenant" });

    const clientA = uuidv7(); // rate_sheet
    const clientB = uuidv7(); // cost_plus
    await db.insert(clients).values({ id: clientA, tenantId: tId, name: "Rate-Sheet Client A", billingModel: "rate_sheet" });
    await db.insert(clients).values({ id: clientB, tenantId: tId, name: "Cost-Plus Client B", billingModel: "cost_plus" });

    const locA = uuidv7();
    const locB = uuidv7();
    const loc = (id: string, clientId: string, name: string) => ({
      id, tenantId: tId, clientId, name,
      addressLine1: "1 Test St", city: "Testville", stateProvince: "NV", postalCode: "89101",
    });
    await db.insert(clientLocations).values([loc(locA, clientA, "Loc A"), loc(locB, clientB, "Loc B")]);

    const jobA = uuidv7(); // clientA / rate_sheet, primary trade HANDY
    const jobB = uuidv7(); // clientB / cost_plus
    await db.insert(jobs).values({
      id: jobA, tenantId: tId, jobNumber: 1, clientId: clientA, clientLocationId: locA,
      primaryTradeId: handy.id, currentStatusId: statusNew.id, problemDescription: "Rate-sheet job",
    });
    await db.insert(jobs).values({
      id: jobB, tenantId: tId, jobNumber: 2, clientId: clientB, clientLocationId: locB,
      primaryTradeId: handy.id, currentStatusId: statusNew.id, problemDescription: "Cost-plus job",
    });

    // Initial rates: clientA HANDY 75 + ELEC 85 (both active, current). clientB HANDY 200 (active,
    // never used — proves the cost_plus gate in L5). Pin the 75's created_at so R4 ordering is fixed.
    const { id: rHandy75 } = await createClientRate({ tenantId: tId, clientId: clientA, actorUserId: operator.id, tradeId: handy.id, rateType: "hourly", amount: "75" });
    await pinCreatedAt(rHandy75, "2026-06-01T00:00:00Z");
    await createClientRate({ tenantId: tId, clientId: clientA, actorUserId: operator.id, tradeId: elec.id, rateType: "hourly", amount: "85" });
    await createClientRate({ tenantId: tId, clientId: clientB, actorUserId: operator.id, tradeId: handy.id, rateType: "hourly", amount: "200" });

    const propA = (await createProposal({ tenantId: tId, jobId: jobA, createdByUserId: operator.id })).id;
    const propB = (await createProposal({ tenantId: tId, jobId: jobB, createdByUserId: operator.id })).id;

    // ════════ RESOLVER (direct) ════════
    console.log("\n[R] RESOLVER — resolveClientLaborRate / resolveEffectiveBillingModel");
    const r1 = await resolveClientLaborRate({ tenantId: tId, clientId: clientA, tradeId: handy.id, rateType: "hourly" });
    check("R1: HANDY hourly resolves '75.00'", r1 === "75.00", `got ${r1}`);
    const r2 = await resolveClientLaborRate({ tenantId: tId, clientId: clientA, tradeId: elec.id, rateType: "hourly" });
    check("R2: ELEC hourly resolves '85.00' (different trade → its own rate)", r2 === "85.00", `got ${r2}`);
    const r3 = await resolveClientLaborRate({ tenantId: tId, clientId: clientA, tradeId: hvac.id, rateType: "hourly" });
    check("R3: HVAC (no rate on file) → null (operator authors)", r3 === null, `got ${r3}`);

    // R4 — add a NEWER active HANDY rate (80); newest-active-wins.
    const { id: rHandy80 } = await createClientRate({ tenantId: tId, clientId: clientA, actorUserId: operator.id, tradeId: handy.id, rateType: "hourly", amount: "80" });
    await pinCreatedAt(rHandy80, "2026-06-09T00:00:00Z");
    const r4 = await resolveClientLaborRate({ tenantId: tId, clientId: clientA, tradeId: handy.id, rateType: "hourly" });
    check("R4: newest-active-wins → '80.00' (not the older 75)", r4 === "80.00", `got ${r4}`);

    // R5 — add an EXPIRED HANDY rate (999, expiry in the past) that is the ABSOLUTE newest row;
    // it must be ignored by the date filter, so 80 still wins.
    const { id: rHandy999 } = await createClientRate({ tenantId: tId, clientId: clientA, actorUserId: operator.id, tradeId: handy.id, rateType: "hourly", amount: "999", expiryDate: new Date("2026-06-05T00:00:00Z") });
    await pinCreatedAt(rHandy999, "2026-06-10T00:00:00Z"); // newest of all — but expired
    const r5 = await resolveClientLaborRate({ tenantId: tId, clientId: clientA, tradeId: handy.id, rateType: "hourly" });
    check("R5: expired rate ignored → still '80.00' (NOT 999, despite newest created_at)", r5 === "80.00", `got ${r5}`);

    // R6 — per-job override precedence (pure function).
    check("R6a: effective(job=null, client='rate_sheet') === 'rate_sheet'",
      resolveEffectiveBillingModel(null, "rate_sheet") === "rate_sheet");
    check("R6b: effective(job='cost_plus', client='rate_sheet') === 'cost_plus' (job override wins)",
      resolveEffectiveBillingModel("cost_plus", "rate_sheet") === "cost_plus");

    // ════════ ADD-LINE (the wired path) ════════
    console.log("\n[L] ADD-LINE — resolveLaborLineDefault inside addProposalLineItem");
    // L1 — rate_sheet labor, blank price → agreed rate fills (= the current resolved HANDY rate, 80).
    const expectedHandy = await resolveClientLaborRate({ tenantId: tId, clientId: clientA, tradeId: handy.id, rateType: "hourly" });
    const { id: l1 } = await addProposalLineItem({ tenantId: tId, proposalId: propA, category: "labor", description: "Handyman labor", quantity: "2", tradeId: handy.id });
    const l1row = await lineRow(l1);
    check("L1: blank price → unit_price = agreed HANDY rate, markup null, trade_id+rate_type provenance",
      l1row?.unitPrice === expectedHandy && l1row?.unitPrice === "80.00"
        && l1row?.markupPercent === null && l1row?.tradeId === handy.id && l1row?.rateType === "hourly",
      JSON.stringify({ up: l1row?.unitPrice, mk: l1row?.markupPercent, tr: l1row?.tradeId === handy.id, rt: l1row?.rateType }));

    // L2 — a DIFFERENT trade on the same bill → its own rate (multi-trade).
    const { id: l2 } = await addProposalLineItem({ tenantId: tId, proposalId: propA, category: "labor", description: "Electrician labor", quantity: "1", tradeId: elec.id });
    const l2row = await lineRow(l2);
    check("L2: ELEC labor on the SAME proposal → unit_price '85.00' (multi-trade), trade_id=ELEC",
      l2row?.unitPrice === "85.00" && l2row?.tradeId === elec.id && l2row?.rateType === "hourly" && l2row?.markupPercent === null,
      JSON.stringify({ up: l2row?.unitPrice, trElec: l2row?.tradeId === elec.id }));

    // L3 — explicit price (Vegas one-off) → operator wins; rate NOT applied; NO provenance stored.
    const { id: l3 } = await addProposalLineItem({ tenantId: tId, proposalId: propA, category: "labor", description: "Emergency one-off", quantity: "1", tradeId: handy.id, unitPrice: "150" });
    const l3row = await lineRow(l3);
    check("L3: explicit unit_price '150' wins over the agreed rate; no rate-provenance stamped",
      l3row?.unitPrice === "150.00" && l3row?.tradeId === null && l3row?.rateType === null,
      JSON.stringify({ up: l3row?.unitPrice, tr: l3row?.tradeId, rt: l3row?.rateType }));

    // L4 — materials NEVER auto-resolve. (a) trade + blank → does NOT force-fill, throws (no price);
    //      (b) explicit price saves on the normal path with no provenance.
    const l4throw = await expectThrow(
      () => addProposalLineItem({ tenantId: tId, proposalId: propA, category: "materials", description: "Parts", quantity: "1", tradeId: handy.id }),
      "INVALID_LINE_UNIT_PRICE");
    const { id: l4b } = await addProposalLineItem({ tenantId: tId, proposalId: propA, category: "materials", description: "Parts", quantity: "1", unitPrice: "12" });
    const l4brow = await lineRow(l4b);
    check("L4: materials NEVER auto-resolve — blank+trade does NOT fill (throws); explicit '12' saves, no provenance",
      l4throw && l4brow?.unitPrice === "12.00" && l4brow?.tradeId === null && l4brow?.rateType === null,
      JSON.stringify({ threw: l4throw, up: l4brow?.unitPrice, tr: l4brow?.tradeId }));

    // L5 — cost_plus client: a HANDY rate EXISTS (200) but the model gates it out.
    //      (a) trade + blank → no resolution (throws). (b) explicit price → saves, existing path intact.
    const l5throw = await expectThrow(
      () => addProposalLineItem({ tenantId: tId, proposalId: propB, category: "labor", description: "CP labor", quantity: "1", tradeId: handy.id }),
      "INVALID_LINE_UNIT_PRICE");
    const { id: l5b } = await addProposalLineItem({ tenantId: tId, proposalId: propB, category: "labor", description: "CP labor", quantity: "1", unitPrice: "100" });
    const l5brow = await lineRow(l5b);
    check("L5: cost_plus → rate NOT resolved (HANDY 200 ignored); blank throws, explicit '100' saves, no provenance",
      l5throw && l5brow?.unitPrice === "100.00" && l5brow?.tradeId === null && l5brow?.rateType === null,
      JSON.stringify({ threw: l5throw, up: l5brow?.unitPrice, tr: l5brow?.tradeId }));

    console.log("\n[HONESTY]");
    console.log("  [check-billing-from-rates] SEEDED-FIXTURE proof on the REAL resolver + add-line writer.");
    console.log("  No LLM — rates are operator-entered contractual data. Proves trade-specific resolution,");
    console.log("  multi-trade (each trade its own rate on one bill), newest-active-wins, date filtering,");
    console.log("  per-job billing-model override, blank→agreed-rate fill, operator-override-wins, and that");
    console.log("  materials + cost_plus NEVER auto-resolve (the durable contractual-vs-judgment line).");

    // teardown + verify-empty IN-TALLY, then report
    await teardownTenant(tId);
    const n = await leftover();
    tId = ""; // cleaned — the finally becomes a no-op safety net
    check("teardown: 0 leftover harness tenants", n === 0, `found ${n}`);
    return finish();
  } finally {
    // safety net: only fires if an unexpected throw skipped the in-tally teardown above
    if (tId) {
      try { await teardownTenant(tId); } catch (e) { console.error("[check-billing-from-rates] teardown warning:", e); }
    }
    console.log("[check-billing-from-rates] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-billing-from-rates] passed: ${passed}`);
  console.log(`[check-billing-from-rates] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-billing-from-rates] BILLING-FROM-RATES LEDGER RED ✗");
  } else {
    console.log("[check-billing-from-rates] BILLING-FROM-RATES LEDGER GREEN ✓ (resolver precedence / newest-wins / date filter / multi-trade / blank→rate / operator-override / materials+cost_plus never resolve)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => { console.error("[check-billing-from-rates] FAILED:", e); process.exit(1); });
