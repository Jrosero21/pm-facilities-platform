/**
 * scripts/check-phase-26.ts — Phase 26 INVOICE-CREATOR harness (money-safety + adapter plumbing).
 *
 * Phase-blocking ACCEPTANCE PROOF for Phase 26 (invoice_creator_v1):
 *   GROUP M — MONEY-SAFETY (the signature proof): invoke the REAL runInvoiceCreator under
 *             INVOICE_CREATOR_MOCK=1. The mock emits NO numbers (lumpFlag=false, reconciles=null),
 *             so the number-join branch is driven by the SEEDED VENDOR FIXTURE, not the mock:
 *               - itemized vendor invoice (2 lines) → client lines copy the vendor unit prices
 *                 (∄ a fabricated number); markup is the rule preview only (null here).
 *               - lumped vendor invoice (header total, ZERO lines) → ONE client line at the vendor
 *                 total, never split into invented sub-numbers.
 *   GROUP H — HARVEST: a SEEDED invoice draft/review corpus flows through invoiceCorrectionPairs
 *             into the three buckets (CAST-AS-CHAR JSON path), and selectFewShotPairs picks
 *             GOLD-first / excludes NEGATIVE.
 *   GROUP A — APPROVE-AS-IS: agentApproveAsIs surfaces invoice_creator_v1 with the right
 *             reviewed/approvedAsIs (latest-review dedupe) over the seeded corpus.
 *   GROUP V — VOLUME: invoice_creator_v1 surfaces in agentVolumeByAgent free (GROUP BY agent_id).
 *
 * THE HONESTY RULE (roadmap §6): this is a SEEDED-FIXTURE + MOCK proof of money-safety INVARIANTS
 * and adapter PLUMBING — NOT a live invoice-quality claim. The vendor corpus and the model are
 * synthetic. The money-safety properties (no LLM-invented dollars; lump kept whole) are proven on
 * the REAL join code; the harvest/approve-as-is adapters are proven on a seeded corpus.
 *
 * SANDBOX ONLY — hard-guarded (forces *_sandbox; a check harness must NEVER touch prod). Self-seeds
 * a fresh tenant + fixtures and tears it down BY TRACKED ID under FK_CHECKS=0 (children-first,
 * INCLUDING the agent-child tables agent_tool_calls/agent_decisions; NEVER by created_at).
 * Mirrors scripts/check-phase-25.ts. Run: pnpm run db:check:invoice
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-p26] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[check-p26] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
// Force the invoice agent's deterministic mock path (no LLM, no DB prompt resolution).
process.env.INVOICE_CREATOR_MOCK = "1";
console.log(`[check-p26] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "phase26-harness-tenant";
// The deterministic correction marker the GOLD edits introduce (mirrors Phase-25's markers).
const INVOICE_MARKER = "[[INVOICE-CORRECTED-OMEGA]]";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, jobs, jobStatusHistory, jobEvents, jobStatuses, trades, users, vendors,
    vendorInvoices, vendorInvoiceLineItems, agentRuns, agentToolCalls, agentDecisions, invoiceDrafts, invoiceReviews,
  } = await import("@/server/schema");
  const { eq, inArray, sql } = await import("drizzle-orm");
  const { createJob } = await import("@/server/jobs");
  const { runInvoiceCreator } = await import("@/server/agents/invoice-creator");
  const { getInvoiceDraft } = await import("@/server/agents/invoice-creator/drafts");
  const { resolveClientMarkupDefault } = await import("@/server/billing/client-invoices");
  const { invoiceCorrectionPairs, selectFewShotPairs } = await import("@/server/analytics/correction-pairs");
  const { agentApproveAsIs, agentVolumeByAgent } = await import("@/server/analytics/agent-observability");

  type CorrectionPair = Awaited<ReturnType<typeof invoiceCorrectionPairs>>[number];

  // tracked ids (teardown deletes ONLY these — never a timestamp window)
  const runIds: string[] = [];
  const invDraftIds: string[] = [];
  const vinvIds: string[] = [];
  const vendorIds: string[] = [];
  let tId = "";
  let clientId = "";
  let locationId = "";
  let jobId = "";

  async function teardown() {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
        if (invDraftIds.length) {
          await tx.delete(invoiceReviews).where(inArray(invoiceReviews.draftId, invDraftIds));
          await tx.delete(invoiceDrafts).where(inArray(invoiceDrafts.id, invDraftIds));
        }
        if (runIds.length) {
          // agent-child tables: under FK_CHECKS=0 ON DELETE CASCADE does NOT fire — delete explicitly.
          await tx.delete(agentDecisions).where(inArray(agentDecisions.agentRunId, runIds));
          await tx.delete(agentToolCalls).where(inArray(agentToolCalls.agentRunId, runIds));
          await tx.delete(agentRuns).where(inArray(agentRuns.id, runIds));
        }
        if (vinvIds.length) {
          await tx.delete(vendorInvoiceLineItems).where(inArray(vendorInvoiceLineItems.vendorInvoiceId, vinvIds));
          await tx.delete(vendorInvoices).where(inArray(vendorInvoices.id, vinvIds));
        }
        if (vendorIds.length) await tx.delete(vendors).where(inArray(vendors.id, vendorIds));
        if (jobId) {
          await tx.delete(jobStatusHistory).where(eq(jobStatusHistory.jobId, jobId));
          await tx.delete(jobEvents).where(eq(jobEvents.jobId, jobId));
          await tx.delete(jobs).where(eq(jobs.id, jobId));
        }
        if (locationId) await tx.delete(clientLocations).where(eq(clientLocations.id, locationId));
        if (clientId) await tx.delete(clients).where(eq(clients.id, clientId));
        if (tId) await tx.delete(tenants).where(eq(tenants.id, tId));
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
      });
    } catch (e) { console.error("[check-p26] teardown warning:", e); }
  }

  // pre-clean a leftover harness tenant + its fixtures from a prior partial run (idempotency)
  {
    const prior = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG)).limit(1);
    if (prior[0]) {
      const pt = prior[0].id;
      const pRuns = (await db.select({ id: agentRuns.id }).from(agentRuns).where(eq(agentRuns.tenantId, pt))).map((r) => r.id);
      const pDrafts = (await db.select({ id: invoiceDrafts.id }).from(invoiceDrafts).where(eq(invoiceDrafts.tenantId, pt))).map((d) => d.id);
      const pVinvs = (await db.select({ id: vendorInvoices.id }).from(vendorInvoices).where(eq(vendorInvoices.tenantId, pt))).map((v) => v.id);
      const pJobs = (await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, pt))).map((j) => j.id);
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
        if (pDrafts.length) {
          await tx.delete(invoiceReviews).where(inArray(invoiceReviews.draftId, pDrafts));
          await tx.delete(invoiceDrafts).where(inArray(invoiceDrafts.id, pDrafts));
        }
        if (pRuns.length) {
          await tx.delete(agentDecisions).where(inArray(agentDecisions.agentRunId, pRuns));
          await tx.delete(agentToolCalls).where(inArray(agentToolCalls.agentRunId, pRuns));
          await tx.delete(agentRuns).where(inArray(agentRuns.id, pRuns));
        }
        if (pVinvs.length) {
          await tx.delete(vendorInvoiceLineItems).where(inArray(vendorInvoiceLineItems.vendorInvoiceId, pVinvs));
          await tx.delete(vendorInvoices).where(inArray(vendorInvoices.id, pVinvs));
        }
        await tx.delete(vendors).where(eq(vendors.tenantId, pt));
        if (pJobs.length) {
          await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, pJobs));
          await tx.delete(jobEvents).where(inArray(jobEvents.jobId, pJobs));
          await tx.delete(jobs).where(inArray(jobs.id, pJobs));
        }
        await tx.delete(clientLocations).where(eq(clientLocations.tenantId, pt));
        await tx.delete(clients).where(eq(clients.tenantId, pt));
        await tx.delete(tenants).where(eq(tenants.id, pt));
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
      });
    }
  }

  try {
    // ── lookups (global seed rows) ──
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [hvac] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HVAC"));
    const [completed] = await db.select({ id: jobStatuses.id }).from(jobStatuses).where(eq(jobStatuses.code, "COMPLETED"));
    check("setup: operator + HVAC trade + COMPLETED status exist", !!operator && !!hvac && !!completed);
    if (!operator || !hvac || !completed) return finish();

    // ── fresh tenant + client/location + job (advanced to COMPLETED) ──
    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Phase26 Harness Tenant" });
    clientId = uuidv7();
    await db.insert(clients).values({ id: clientId, tenantId: tId, name: "P26 Client" });
    locationId = uuidv7();
    await db.insert(clientLocations).values({ id: locationId, tenantId: tId, clientId, name: "P26 Loc", addressLine1: "1 Test Way", city: "Metropolis", stateProvince: "NY", postalCode: "10001" });
    const job = await createJob({ tenantId: tId, clientId, clientLocationId: locationId, primaryTradeId: hvac.id, problemDescription: "P26 completed job (invoice input)", createdByUserId: operator.id });
    jobId = job.id;
    // Eligibility gate: the agent requires job_statuses.code='COMPLETED' (raw update — fixture only).
    await db.update(jobs).set({ currentStatusId: completed.id }).where(eq(jobs.id, jobId));

    // ── one vendor (the AP source) ──
    const vendorId = uuidv7();
    await db.insert(vendors).values({ id: vendorId, tenantId: tId, name: "P26 Vendor" });
    vendorIds.push(vendorId);

    // ════════ GROUP M — MONEY-SAFETY (real runInvoiceCreator under mock) ════════
    // M-itemized: a 2-line vendor invoice; client lines must copy the vendor unit prices.
    const vinvItemized = uuidv7();
    await db.insert(vendorInvoices).values({ id: vinvItemized, tenantId: tId, jobId, vendorId, status: "received", sourceType: "vendor_portal", subtotal: "350.50", taxTotal: "0.00", total: "350.50" });
    vinvIds.push(vinvItemized);
    const liId1 = uuidv7();
    const liId2 = uuidv7();
    await db.insert(vendorInvoiceLineItems).values({ id: liId1, tenantId: tId, vendorInvoiceId: vinvItemized, lineNumber: 1, category: "labor", description: "Itemized labor", quantity: "1.00", unitPrice: "100.00", extendedAmount: "100.00", taxAmount: "0.00" });
    await db.insert(vendorInvoiceLineItems).values({ id: liId2, tenantId: tId, vendorInvoiceId: vinvItemized, lineNumber: 2, category: "materials", description: "Itemized materials", quantity: "1.00", unitPrice: "250.50", extendedAmount: "250.50", taxAmount: "0.00" });

    // M-lump: a header total with ZERO line items (a lazy/lumped vendor invoice).
    const vinvLump = uuidv7();
    await db.insert(vendorInvoices).values({ id: vinvLump, tenantId: tId, jobId, vendorId, status: "received", sourceType: "vendor_portal", subtotal: "4200.00", taxTotal: "0.00", total: "4200.00" });
    vinvIds.push(vinvLump);

    console.log("\n[M] MONEY-SAFETY — real join over seeded vendor fixtures (LLM invents no dollars)");
    const mk = await resolveClientMarkupDefault(tId, clientId); // null (no billing rule seeded)

    // itemized run
    const itemizedRun = await runInvoiceCreator({ tenantId: tId, jobId, vendorInvoiceId: vinvItemized, triggeredByUserId: operator.id });
    runIds.push(itemizedRun.runId);
    invDraftIds.push(itemizedRun.draftId);
    const itemizedDraft = await getInvoiceDraft(tId, itemizedRun.draftId);
    const iLines = itemizedDraft?.proposedInvoice.lineItems ?? [];
    const vendorPriceByLine: Record<string, string> = { [liId1]: "100.00", [liId2]: "250.50" };
    check("M1: itemized — lumpFlag=false, 2 lines",
      itemizedDraft?.proposedInvoice.lumpFlag === false && iLines.length === 2,
      JSON.stringify(itemizedDraft?.proposedInvoice));
    check("M2: itemized — each line unitPrice EQUALS its reconciled vendor line (multiset {100.00,250.50})",
      iLines.every((l) => l.reconcilesToVendorLineId != null && vendorPriceByLine[l.reconcilesToVendorLineId] === l.unitPrice)
        && [...iLines.map((l) => l.unitPrice)].sort().join(",") === "100.00,250.50",
      JSON.stringify(iLines.map((l) => ({ p: l.unitPrice, r: l.reconcilesToVendorLineId }))));
    check("M3: itemized — NO fabricated money (every unitPrice ∈ the seeded vendor set)",
      iLines.every((l) => l.unitPrice === "100.00" || l.unitPrice === "250.50"));
    check("M4: itemized — markup is the rule PREVIEW only (=== resolveClientMarkupDefault, null here)",
      mk === null && iLines.every((l) => (l.markupPercent ?? null) === mk),
      `mk=${JSON.stringify(mk)} got=${JSON.stringify(iLines.map((l) => l.markupPercent))}`);

    // lump run
    const lumpRun = await runInvoiceCreator({ tenantId: tId, jobId, vendorInvoiceId: vinvLump, triggeredByUserId: operator.id });
    runIds.push(lumpRun.runId);
    invDraftIds.push(lumpRun.draftId);
    const lumpDraft = await getInvoiceDraft(tId, lumpRun.draftId);
    const lLines = lumpDraft?.proposedInvoice.lineItems ?? [];
    check("M5: lump — kept WHOLE (lumpFlag=true, 1 line at the vendor TOTAL 4200.00, reconciles=null, no split)",
      lumpDraft?.proposedInvoice.lumpFlag === true && lLines.length === 1 &&
      lLines[0]?.unitPrice === "4200.00" && (lLines[0]?.reconcilesToVendorLineId ?? null) === null,
      JSON.stringify(lumpDraft?.proposedInvoice));

    // ════════ GROUP H — HARVEST (direct-seeded corpus) ════════
    const started = new Date(Date.now() - 3600_000);
    const hRun = uuidv7();
    await db.insert(agentRuns).values({ id: hRun, tenantId: tId, agentId: "invoice_creator_v1", status: "succeeded", startedAt: started, completedAt: started });
    runIds.push(hRun);

    const draftObj = (i: number) => ({ lineItems: [{ category: "labor", description: `draft line ${i}`, quantity: "1.00", unit: null, unitPrice: "100.00", markupPercent: null, reconcilesToVendorLineId: null }], lumpFlag: false });
    const goldObj = (i: number) => ({ lineItems: [{ category: "labor", description: `Approved line ${i} ${INVOICE_MARKER}`, quantity: "1.00", unit: null, unitPrice: "100.00", markupPercent: null, reconcilesToVendorLineId: null }], lumpFlag: false });
    const mkInvDraft = async (proposed: unknown) => {
      const id = uuidv7();
      await db.insert(invoiceDrafts).values({ id, tenantId: tId, jobId, agentRunId: hRun, vendorInvoiceId: vinvItemized, clientId, proposedInvoice: proposed });
      invDraftIds.push(id);
      return id;
    };
    const mkInvReview = async (draftId: string, decision: "approve" | "reject", editedContent: unknown | null) => {
      await db.insert(invoiceReviews).values({ id: uuidv7(), tenantId: tId, draftId, reviewerUserId: operator.id, decision, editedContent, reviewedAt: new Date(), createdAt: new Date() });
    };
    for (let i = 0; i < 2; i++) { const d = await mkInvDraft(draftObj(i)); await mkInvReview(d, "approve", goldObj(i)); } // GOLD
    for (let i = 0; i < 2; i++) { const d = await mkInvDraft(draftObj(i)); await mkInvReview(d, "approve", null); }       // POSITIVE
    { const d = await mkInvDraft(draftObj(9)); await mkInvReview(d, "reject", null); }                                    // NEGATIVE

    console.log("\n[H] HARVEST — invoiceCorrectionPairs buckets + GOLD-first selector (CAST-AS-CHAR JSON)");
    const bucketCount = (ps: CorrectionPair[], b: string) => ps.filter((p) => p.bucket === b).length;
    const invPairs = await invoiceCorrectionPairs(tId);
    check("H1: invoice harvest — 2 gold / 2 positive / 1 negative (5 pairs; pending M-drafts excluded)",
      invPairs.length === 5 && bucketCount(invPairs, "gold") === 2 && bucketCount(invPairs, "positive") === 2 && bucketCount(invPairs, "negative") === 1,
      JSON.stringify(invPairs.map((p) => p.bucket)));
    check("H2: invoice gold pairs carry the marker in editedContent (raw JSON string, unparsed)",
      invPairs.filter((p) => p.bucket === "gold").every((p) => (p.editedContent ?? "").includes(INVOICE_MARKER)));
    const invSel = selectFewShotPairs(invPairs);
    check("H3: invoice selector — GOLD-first, NEGATIVE excluded (4 selected: 2 gold then 2 positive)",
      invSel.length === 4 && invSel[0].bucket === "gold" && invSel[1].bucket === "gold" && invSel.every((p) => p.bucket !== "negative"),
      JSON.stringify(invSel.map((p) => p.bucket)));

    // ════════ GROUP A — APPROVE-AS-IS (over the seeded corpus) ════════
    // 5 drafts, one review each: 2 gold (approve+edit → NOT as-is), 2 positive (approve, no edit →
    // as-is), 1 negative (reject). latest-review-per-draft ⇒ reviewed=5, approvedAsIs=2.
    console.log("\n[A] APPROVE-AS-IS — invoice_creator_v1 surfaces with the right counts");
    const approve = await agentApproveAsIs(tId);
    const inv = approve.find((r) => r.agentId === "invoice_creator_v1");
    check("A1: approve-as-is — invoice_creator_v1 applicable:true, reviewed=5, approvedAsIs=2 (2 positives)",
      inv?.applicable === true && inv?.reviewed === 5 && inv?.approvedAsIs === 2,
      JSON.stringify(inv));

    // ════════ GROUP V — VOLUME (free via GROUP BY agent_id) ════════
    console.log("\n[V] VOLUME — invoice_creator_v1 surfaces with no hardcoded list");
    const vol = await agentVolumeByAgent(tId);
    const vInv = vol.find((r) => r.agentId === "invoice_creator_v1");
    check("V1: volume — invoice_creator_v1 total=3 (hRun + itemized + lump), all succeeded",
      vInv?.total === 3 && vInv?.succeeded === 3, JSON.stringify(vInv));

    // ════════ THE HONESTY LOG ════════
    console.log("\n[HONESTY]");
    console.log("  [check-p26] This is a SEEDED-FIXTURE + MOCK proof. The vendor corpus and the model");
    console.log("  are SYNTHETIC. The MONEY-SAFETY invariants (no LLM-invented dollars; a lumped vendor");
    console.log("  invoice kept whole at its total; markup is the rule preview only) are proven on the");
    console.log("  REAL join code; the harvest + approve-as-is adapters are proven on a seeded corpus.");
    console.log("  No live invoice-quality lift is asserted or implied.");

    return finish();
  } finally {
    await teardown();
    console.log("[check-p26] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-p26] passed: ${passed}`);
  console.log(`[check-p26] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-p26] PHASE-26 INVOICE LEDGER RED ✗ — PHASE BLOCKED");
  } else {
    console.log("[check-p26] PHASE-26 INVOICE LEDGER GREEN ✓ (money-safety: itemized reconciles to vendor unit prices + no fabricated dollars + markup preview-only / lump kept whole at vendor total / harvest buckets + GOLD-first selector / approve-as-is surfaces / volume free — SEEDED+MOCK proof, NOT a live lift)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => { console.error("[check-p26] FAILED:", e); process.exit(1); });
