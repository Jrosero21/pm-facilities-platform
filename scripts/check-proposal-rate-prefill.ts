/**
 * scripts/check-proposal-rate-prefill.ts — Phase (ii) Unit 2a proposal rate-prefill harness.
 *
 * Acceptance proof for the proposal agent's agreed-rate PRE-FILL + the publish PROVENANCE path:
 *   ENRICHMENT (enrichWithAgreedRates, via listProposalDraftsForJobDetailed):
 *     E1 rate_sheet job labor line → suggestedUnitPrice = the job's HANDY rate ("75.00") + trade/rate set
 *     E2 a MATERIALS line on the same draft → NO suggestion (materials never pre-fill)
 *     E3 cost_plus client → labor line gets NO suggestion (not rate_sheet)
 *     E4 a job with NULL primary_trade → labor line gets NO suggestion (falls through blank)
 *   PUBLISH PROVENANCE (server re-verification — the decision-B core):
 *     P1 publish a labor line whose price == the agreed rate (75) with tradeId/rateType → the published
 *        proposal_line_items row stores trade_id=HANDY + rate_type=hourly + markup null (verified)
 *     P2 operator OVERRODE to 150 (≠ agreed 75) but tradeId still passed → server re-verifies 150≠75 →
 *        provenance NOT recorded (trade_id/rate_type null), normal rule markup applies (override honored)
 *     P3 STALE rate: submit 75 with tradeId, but the agreed rate has since moved to 80 → 75 ≠ current 80
 *        → provenance dropped, the line still bills the submitted 75 (no false provenance)
 *   PREVIEW == PUBLISH:
 *     PV1 the routing-preview total (shared markup helper) for an agreed-rate proposal == the published total
 *
 * No LLM / no agent — rates are operator-entered contractual data; the draft structures are built
 * directly. SANDBOX ONLY — hard-guarded (exit 2 otherwise). Self-seeds a tenant + 2 clients + jobs +
 * rates + drafts, reuses the global seed operator + real seeded trades/status. Self-teardown.
 * Run: pnpm run db:check:proposal-rate-prefill
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-proposal-rate-prefill] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-proposal-rate-prefill] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-proposal-rate-prefill] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "proposal-rate-prefill-harness-tenant";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, clientRates, clientBillingRules, auditLogs, users, trades,
    jobs, jobStatuses, proposals, proposalLineItems, proposalDrafts, proposalReviews, agentRuns,
  } = await import("@/server/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { createClientRate, resolveClientLaborRate, resolveAgreedRateLineMarkups } =
    await import("@/server/billing/client-rates");
  const { listProposalLineItems } = await import("@/server/billing/proposals");
  const { createClientBillingRule } = await import("@/server/billing/billing-rules");
  const { resolveClientMarkupDefault } = await import("@/server/billing/client-invoices");
  const { computeArLines } = await import("@/server/billing/totals");
  const { createProposalDraft, listProposalDraftsForJobDetailed } =
    await import("@/server/agents/proposal-generator/drafts");
  const { createProposalReview } = await import("@/server/agents/proposal-generator/reviews");
  const { publishProposalDraft } = await import("@/server/agents/proposal-generator/publish");

  // The number-free draft / priced-review shapes the data layer consumes (cast at the seam — the
  // harness builds them directly, mirroring what the agent writes + what the review editor submits).
  type DraftContent = Parameters<typeof createProposalDraft>[0]["proposedProposal"];
  type ReviewContent = Parameters<typeof createProposalReview>[0]["editedContent"];

  let tId = "";

  async function teardownTenant(id: string) {
    await db.transaction(async (tx) => {
      // children-first by tracked tenant id
      await tx.delete(proposalLineItems).where(eq(proposalLineItems.tenantId, id));
      await tx.delete(proposalReviews).where(eq(proposalReviews.tenantId, id));
      await tx.delete(proposalDrafts).where(eq(proposalDrafts.tenantId, id));
      await tx.delete(proposals).where(eq(proposals.tenantId, id));
      await tx.delete(agentRuns).where(eq(agentRuns.tenantId, id));
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
  const pinCreatedAt = async (rateId: string, iso: string) =>
    db.update(clientRates).set({ createdAt: new Date(iso) }).where(eq(clientRates.id, rateId));

  try {
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [handy] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HANDY"));
    const [elec] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "ELEC"));
    const [statusNew] = await db.select({ id: jobStatuses.id }).from(jobStatuses).where(eq(jobStatuses.code, "NEW"));
    check("setup: seed operator + HANDY/ELEC trades + NEW status exist",
      !!operator && !!handy && !!elec && !!statusNew);
    if (!operator || !handy || !elec || !statusNew) return finish();

    // ════════ SEED ════════
    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Proposal Rate-Prefill Harness Tenant" });

    const clientA = uuidv7(); // rate_sheet
    const clientB = uuidv7(); // cost_plus
    await db.insert(clients).values({ id: clientA, tenantId: tId, name: "Rate-Sheet Client A", billingModel: "rate_sheet" });
    await db.insert(clients).values({ id: clientB, tenantId: tId, name: "Cost-Plus Client B", billingModel: "cost_plus" });

    // Client A default billing rule (markup 20%) — proves the NON-agreed line still gets the rule
    // markup at publish (P2), in contrast to an agreed-rate line which is forced to no markup.
    await createClientBillingRule({
      tenantId: tId, clientId: clientA, actorUserId: operator.id,
      name: "Default", markupPercent: "20", isDefault: true,
    });

    const locA = uuidv7();
    const locB = uuidv7();
    const loc = (id: string, clientId: string, name: string) => ({
      id, tenantId: tId, clientId, name,
      addressLine1: "1 Test St", city: "Testville", stateProvince: "NV", postalCode: "89101",
    });
    await db.insert(clientLocations).values([loc(locA, clientA, "Loc A"), loc(locB, clientB, "Loc B")]);

    const jobA = uuidv7();  // clientA / rate_sheet, primary trade HANDY  (E1/E2 + P1/P2/P3 + PV1)
    const jobA2 = uuidv7(); // clientA / rate_sheet, primary trade NULL   (E4)
    const jobB = uuidv7();  // clientB / cost_plus,  primary trade HANDY  (E3)
    await db.insert(jobs).values({ id: jobA, tenantId: tId, jobNumber: 1, clientId: clientA, clientLocationId: locA, primaryTradeId: handy.id, currentStatusId: statusNew.id, problemDescription: "Rate-sheet job" });
    await db.insert(jobs).values({ id: jobA2, tenantId: tId, jobNumber: 2, clientId: clientA, clientLocationId: locA, primaryTradeId: null, currentStatusId: statusNew.id, problemDescription: "Rate-sheet job, no primary trade" });
    await db.insert(jobs).values({ id: jobB, tenantId: tId, jobNumber: 3, clientId: clientB, clientLocationId: locB, primaryTradeId: handy.id, currentStatusId: statusNew.id, problemDescription: "Cost-plus job" });

    // Rates: clientA HANDY 75 (pinned early so the P3 bump can supersede it) + ELEC 85.
    const { id: rHandy75 } = await createClientRate({ tenantId: tId, clientId: clientA, actorUserId: operator.id, tradeId: handy.id, rateType: "hourly", amount: "75" });
    await pinCreatedAt(rHandy75, "2026-06-01T00:00:00Z");
    await createClientRate({ tenantId: tId, clientId: clientA, actorUserId: operator.id, tradeId: elec.id, rateType: "hourly", amount: "85" });

    // ── draft seeder: an agent_run + a NUMBER-FREE pending_review draft (what the agent writes) ──
    const seedDraft = async (jobId: string, lines: { category: string; description: string; scopePhrasing: string }[]): Promise<string> => {
      const runId = uuidv7();
      await db.insert(agentRuns).values({ id: runId, tenantId: tId, agentId: "proposal_creator_v1", jobId, startedAt: new Date() });
      const d = await createProposalDraft({
        tenantId: tId, jobId, agentRunId: runId,
        proposedProposal: { lineItems: lines } as unknown as DraftContent,
      });
      return d.id;
    };

    // ════════ ENRICHMENT (the pre-fill, via the real detailed loader) ════════
    console.log("\n[E] ENRICHMENT — enrichWithAgreedRates (listProposalDraftsForJobDetailed)");

    const eDraftA = await seedDraft(jobA, [
      { category: "labor", description: "Handyman labor", scopePhrasing: "Repair the thing" },
      { category: "materials", description: "Parts", scopePhrasing: "Replacement parts" },
    ]);
    const detailedA = await listProposalDraftsForJobDetailed(tId, jobA);
    const dA = detailedA.find((x) => x.id === eDraftA);
    const eLabor = dA?.proposedProposal.lineItems.find((l) => l.category === "labor");
    const eMat = dA?.proposedProposal.lineItems.find((l) => l.category === "materials");
    check("E1: rate_sheet labor line pre-filled — suggestedUnitPrice '75.00' + trade=HANDY + rate=hourly",
      eLabor?.suggestedUnitPrice === "75.00" && eLabor?.tradeId === handy.id && eLabor?.rateType === "hourly",
      JSON.stringify({ sug: eLabor?.suggestedUnitPrice, tr: eLabor?.tradeId === handy.id, rt: eLabor?.rateType }));
    check("E2: materials line on the SAME draft → NO suggestion (materials never pre-fill)",
      eMat?.suggestedUnitPrice === undefined && eMat?.tradeId == null && eMat?.rateType == null,
      JSON.stringify({ sug: eMat?.suggestedUnitPrice, tr: eMat?.tradeId, rt: eMat?.rateType }));

    const eDraftB = await seedDraft(jobB, [{ category: "labor", description: "CP labor", scopePhrasing: "Repair" }]);
    const detailedB = await listProposalDraftsForJobDetailed(tId, jobB);
    const eLaborB = detailedB.find((x) => x.id === eDraftB)?.proposedProposal.lineItems.find((l) => l.category === "labor");
    check("E3: cost_plus client → labor line gets NO suggestion (not rate_sheet)",
      eLaborB?.suggestedUnitPrice === undefined && eLaborB?.tradeId == null,
      JSON.stringify({ sug: eLaborB?.suggestedUnitPrice, tr: eLaborB?.tradeId }));

    const eDraftA2 = await seedDraft(jobA2, [{ category: "labor", description: "Labor", scopePhrasing: "Repair" }]);
    const detailedA2 = await listProposalDraftsForJobDetailed(tId, jobA2);
    const eLaborA2 = detailedA2.find((x) => x.id === eDraftA2)?.proposedProposal.lineItems.find((l) => l.category === "labor");
    check("E4: rate_sheet job with NULL primary trade → labor line gets NO suggestion (blank, as before)",
      eLaborA2?.suggestedUnitPrice === undefined && eLaborA2?.tradeId == null,
      JSON.stringify({ sug: eLaborA2?.suggestedUnitPrice, tr: eLaborA2?.tradeId }));

    // ════════ PUBLISH PROVENANCE (server re-verification) ════════
    console.log("\n[P] PUBLISH PROVENANCE — addProposalLineItem re-verifies the agreed rate");
    const md = await resolveClientMarkupDefault(tId, clientA); // the rule default markup ('20.000')

    // Build an APPROVED, priced review (the operator-edited content publish bills from), then publish.
    const publishPriced = async (
      jobId: string,
      line: { quantity: string; unitPrice: string; tradeId: string | null; rateType?: "hourly" },
    ): Promise<string> => {
      const draftId = await seedDraft(jobId, [{ category: "labor", description: "Handyman labor", scopePhrasing: "Repair" }]);
      const editedContent = {
        lineItems: [{
          category: "labor", description: "Handyman labor", scopePhrasing: "Repair",
          quantity: line.quantity, unit: null, unitPrice: line.unitPrice, markupPercent: null,
          taxAmount: "0", tradeId: line.tradeId, rateType: line.rateType,
        }],
      } as unknown as ReviewContent;
      await createProposalReview({ tenantId: tId, proposalDraftId: draftId, reviewerUserId: operator.id, decision: "approve", editedContent });
      const { proposalId } = await publishProposalDraft({ tenantId: tId, jobId, draftId, actorUserId: operator.id });
      return proposalId;
    };

    // P1 — kept the pre-filled agreed rate (75) → provenance recorded, markup forced null.
    // PV1 — compute the routing-preview total (shared helper) BEFORE publish, compare to the published total.
    const pvLineMarkups = await resolveAgreedRateLineMarkups({
      tenantId: tId, jobId: jobA, ruleMarkupPercent: md,
      lines: [{ category: "labor", unitPrice: "75.00", tradeId: handy.id, rateType: "hourly" }],
    });
    const previewTotal = computeArLines([{ id: "0", quantity: "2", unitPrice: "75.00", markupPercent: pvLineMarkups[0], taxAmount: "0" }]).total;

    const p1 = await publishPriced(jobA, { quantity: "2", unitPrice: "75.00", tradeId: handy.id, rateType: "hourly" });
    const p1l = (await listProposalLineItems(tId, p1))[0];
    check("P1: agreed-rate line (75 == HANDY rate) → trade_id=HANDY + rate_type=hourly + markup null (verified)",
      p1l?.unitPrice === "75.00" && p1l?.tradeId === handy.id && p1l?.rateType === "hourly" && p1l?.markupPercent === null,
      JSON.stringify({ up: p1l?.unitPrice, tr: p1l?.tradeId === handy.id, rt: p1l?.rateType, mk: p1l?.markupPercent }));

    const p1row = (await db.select({ total: proposals.total }).from(proposals).where(eq(proposals.id, p1)))[0];
    check("PV1: routing-preview total == published total for the agreed-rate proposal (shared markup helper)",
      previewTotal === p1row?.total && p1row?.total === "150.00",
      JSON.stringify({ preview: previewTotal, published: p1row?.total }));

    // P2 — operator OVERRODE to 150 (≠ agreed 75) but the tradeId tag is still passed → server re-verify
    //      drops provenance and the line bills with the normal rule markup (20%).
    const p2 = await publishPriced(jobA, { quantity: "1", unitPrice: "150.00", tradeId: handy.id, rateType: "hourly" });
    const p2l = (await listProposalLineItems(tId, p2))[0];
    check("P2: override 150 ≠ agreed 75 (tradeId still tagged) → NO provenance (trade/rate null), rule markup applies",
      p2l?.unitPrice === "150.00" && p2l?.tradeId === null && p2l?.rateType === null && p2l?.markupPercent === md && md !== null,
      JSON.stringify({ up: p2l?.unitPrice, tr: p2l?.tradeId, rt: p2l?.rateType, mk: p2l?.markupPercent, md }));

    // P3 — STALE rate: the operator approved 75, but the agreed rate has since moved to 80. Server
    //      re-verifies 75 ≠ current 80 → provenance dropped; the line still bills the submitted 75.
    const p3draft = await seedDraft(jobA, [{ category: "labor", description: "Handyman labor", scopePhrasing: "Repair" }]);
    await createProposalReview({
      tenantId: tId, proposalDraftId: p3draft, reviewerUserId: operator.id, decision: "approve",
      editedContent: {
        lineItems: [{ category: "labor", description: "Handyman labor", scopePhrasing: "Repair", quantity: "1", unit: null, unitPrice: "75.00", markupPercent: null, taxAmount: "0", tradeId: handy.id, rateType: "hourly" }],
      } as unknown as ReviewContent,
    });
    const { id: rHandy80 } = await createClientRate({ tenantId: tId, clientId: clientA, actorUserId: operator.id, tradeId: handy.id, rateType: "hourly", amount: "80" });
    await pinCreatedAt(rHandy80, "2026-06-12T00:00:00Z"); // newest-active → supersedes the 75
    const nowRate = await resolveClientLaborRate({ tenantId: tId, clientId: clientA, tradeId: handy.id, rateType: "hourly" });
    const { proposalId: p3 } = await publishProposalDraft({ tenantId: tId, jobId: jobA, draftId: p3draft, actorUserId: operator.id });
    const p3l = (await listProposalLineItems(tId, p3))[0];
    check("P3: stale rate — agreed rate moved 75→80; submitted 75 ≠ current 80 → provenance dropped, bills 75",
      nowRate === "80.00" && p3l?.unitPrice === "75.00" && p3l?.tradeId === null && p3l?.rateType === null,
      JSON.stringify({ now: nowRate, up: p3l?.unitPrice, tr: p3l?.tradeId, rt: p3l?.rateType }));

    console.log("\n[HONESTY]");
    console.log("  [check-proposal-rate-prefill] SEEDED-FIXTURE proof on the REAL enrichment + publish path.");
    console.log("  No LLM — the draft is number-free; the pre-fill is deterministic resolution of operator-");
    console.log("  entered rates. Proves: rate_sheet labor pre-fills (materials / cost_plus / null-trade do");
    console.log("  not); and the publish path RE-VERIFIES the agreed rate server-side before recording");
    console.log("  trade_id/rate_type — an overridden or stale-rate price drops provenance honestly and the");
    console.log("  routing-preview total matches the published total (the shared markup-helper invariant).");

    // teardown + verify-empty IN-TALLY, then report
    await teardownTenant(tId);
    const n = await leftover();
    tId = ""; // cleaned — the finally becomes a no-op safety net
    check("teardown: 0 leftover harness tenants", n === 0, `found ${n}`);
    return finish();
  } finally {
    if (tId) {
      try { await teardownTenant(tId); } catch (e) { console.error("[check-proposal-rate-prefill] teardown warning:", e); }
    }
    console.log("[check-proposal-rate-prefill] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-proposal-rate-prefill] passed: ${passed}`);
  console.log(`[check-proposal-rate-prefill] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-proposal-rate-prefill] PROPOSAL-RATE-PREFILL LEDGER RED ✗");
  } else {
    console.log("[check-proposal-rate-prefill] PROPOSAL-RATE-PREFILL LEDGER GREEN ✓ (pre-fill resolves the job trade rate / materials+cost_plus+null-trade never pre-fill / publish re-verifies provenance / override+stale drop it / preview == publish)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => { console.error("[check-proposal-rate-prefill] FAILED:", e); process.exit(1); });
