/**
 * scripts/check-phase-27.ts — Phase 27 PROPOSAL-GENERATOR harness (money-safety + NTE gate + adapters).
 *
 * Phase-blocking ACCEPTANCE PROOF for Phase 27 (proposal_generator_v1):
 *   GROUP M — MONEY-SAFETY: the REAL runProposalGenerator under PROPOSAL_GENERATOR_MOCK=1 stores a
 *             NUMBER-FREE proposed_proposal (M1). The operator authors pricing at the gate
 *             (editedContent); on publish the proposals.total derives ONLY from that editedContent +
 *             the rule-resolved markup, via the SHARED computeArLines primitive (M2/M3). An
 *             approve-AS-IS (number-free) draft FAILS CLOSED with ProposalRequiresPricing — no $0
 *             proposal is ever materialized (M4).
 *   GROUP N — NTE SEND-GATE (4 paths): total ≤ NTE → internal + proposal.internal_billed event (N1);
 *             total > NTE → client (N2); NTE null → client (N3); forceClientReview → client (N4).
 *   GROUP I — IDEMPOTENCY: a second publish throws ProposalAlreadyMaterialized; exactly one row (I1).
 *   GROUP H — HARVEST: a seeded draft/review corpus flows through proposalCorrectionPairs into the
 *             phrasing-distance buckets; gold editedContent is number-free; selector is gold-first.
 *   GROUP A — APPROVE-AS-IS: proposalApproveAsIs surfaces the phrasing-kept-as-is count.
 *   GROUP V — VOLUME: proposal_generator_v1 surfaces in agentVolumeByAgent free (GROUP BY agent_id).
 *
 * THE HONESTY RULE (roadmap §6): a SEEDED-FIXTURE + MOCK proof of money-safety + NTE-gate INVARIANTS
 * and adapter PLUMBING — NOT a live proposal-quality claim. The model is synthetic; the dollars are
 * operator-authored fixtures. The invariants are proven on the REAL publish + gate code.
 *
 * SANDBOX ONLY — hard-guarded (forces *_sandbox; exit 2 otherwise). Self-seeds a fresh tenant +
 * fixtures and tears it down BY TRACKED ID under FK_CHECKS=0 (children-first, INCLUDING the published
 * proposals/line-items/events/audit and the agent-child tables; NEVER by created_at). Mirrors
 * scripts/check-phase-26.ts. Run: pnpm run db:check:proposal
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-p27] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-p27] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
// Force the proposal agent's deterministic mock path (no LLM, no DB prompt resolution).
process.env.PROPOSAL_GENERATOR_MOCK = "1";
console.log(`[check-p27] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "phase27-harness-tenant";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, jobs, jobStatusHistory, jobEvents, jobStatuses, trades, users,
    agentRuns, agentToolCalls, agentDecisions, proposalDrafts, proposalReviews, proposals,
    proposalLineItems, jobBillingEvents, auditLogs,
  } = await import("@/server/schema");
  const { eq, inArray, and, sql } = await import("drizzle-orm");
  const { createJob } = await import("@/server/jobs");
  const { runProposalGenerator } = await import("@/server/agents/proposal-generator");
  const { createProposalReview } = await import("@/server/agents/proposal-generator/reviews");
  type ProposedProposal = import("@/server/agents/proposal-generator/drafts").ProposedProposal;
  const { publishProposalDraft } = await import("@/server/agents/proposal-generator/publish");
  const { ProposalRequiresPricing, ProposalAlreadyMaterialized } = await import("@/server/agents/proposal-generator/errors");
  const { resolveClientMarkupDefault } = await import("@/server/billing/client-invoices");
  const { computeArLines } = await import("@/server/billing/totals");
  const { getProposal, listProposalLineItems } = await import("@/server/billing/proposals");
  const { proposalCorrectionPairs, selectFewShotPairs } = await import("@/server/analytics/correction-pairs");
  const { proposalApproveAsIs, agentVolumeByAgent } = await import("@/server/analytics/agent-observability");

  type CorrectionPair = Awaited<ReturnType<typeof proposalCorrectionPairs>>[number];

  // tracked ids (teardown deletes ONLY these — never a timestamp window)
  const runIds: string[] = [];
  const draftIds: string[] = [];
  const propIds: string[] = [];
  const jobIds: string[] = [];
  let tId = "";
  let clientId = "";
  let locationId = "";

  async function teardown() {
    try {
      await db.transaction(async (tx) => {
        if (draftIds.length) {
          await tx.delete(proposalReviews).where(inArray(proposalReviews.proposalDraftId, draftIds));
          await tx.delete(proposalDrafts).where(inArray(proposalDrafts.id, draftIds));
        }
        if (propIds.length) {
          await tx.delete(proposalLineItems).where(inArray(proposalLineItems.proposalId, propIds));
          await tx.delete(proposals).where(inArray(proposals.id, propIds));
        }
        if (jobIds.length) await tx.delete(jobBillingEvents).where(inArray(jobBillingEvents.jobId, jobIds));
        if (tId) await tx.delete(auditLogs).where(eq(auditLogs.tenantId, tId));
        if (runIds.length) {
          // agent-child tables: under FK_CHECKS=0 ON DELETE CASCADE does NOT fire — delete explicitly.
          await tx.delete(agentDecisions).where(inArray(agentDecisions.agentRunId, runIds));
          await tx.delete(agentToolCalls).where(inArray(agentToolCalls.agentRunId, runIds));
          await tx.delete(agentRuns).where(inArray(agentRuns.id, runIds));
        }
        if (jobIds.length) {
          await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, jobIds));
          await tx.delete(jobEvents).where(inArray(jobEvents.jobId, jobIds));
          await tx.delete(jobs).where(inArray(jobs.id, jobIds));
        }
        if (locationId) await tx.delete(clientLocations).where(eq(clientLocations.id, locationId));
        if (clientId) await tx.delete(clients).where(eq(clients.id, clientId));
        if (tId) await tx.delete(tenants).where(eq(tenants.id, tId));
      });
    } catch (e) { console.error("[check-p27] teardown warning:", e); }
  }

  // pre-clean a leftover harness tenant + its fixtures from a prior partial run (idempotency)
  {
    const prior = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG)).limit(1);
    if (prior[0]) {
      const pt = prior[0].id;
      const pRuns = (await db.select({ id: agentRuns.id }).from(agentRuns).where(eq(agentRuns.tenantId, pt))).map((r) => r.id);
      const pDrafts = (await db.select({ id: proposalDrafts.id }).from(proposalDrafts).where(eq(proposalDrafts.tenantId, pt))).map((d) => d.id);
      const pProps = (await db.select({ id: proposals.id }).from(proposals).where(eq(proposals.tenantId, pt))).map((p) => p.id);
      const pJobs = (await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, pt))).map((j) => j.id);
      await db.transaction(async (tx) => {
        if (pDrafts.length) {
          await tx.delete(proposalReviews).where(inArray(proposalReviews.proposalDraftId, pDrafts));
          await tx.delete(proposalDrafts).where(inArray(proposalDrafts.id, pDrafts));
        }
        if (pProps.length) {
          await tx.delete(proposalLineItems).where(inArray(proposalLineItems.proposalId, pProps));
          await tx.delete(proposals).where(inArray(proposals.id, pProps));
        }
        if (pJobs.length) await tx.delete(jobBillingEvents).where(inArray(jobBillingEvents.jobId, pJobs));
        await tx.delete(auditLogs).where(eq(auditLogs.tenantId, pt));
        if (pRuns.length) {
          await tx.delete(agentDecisions).where(inArray(agentDecisions.agentRunId, pRuns));
          await tx.delete(agentToolCalls).where(inArray(agentToolCalls.agentRunId, pRuns));
          await tx.delete(agentRuns).where(inArray(agentRuns.id, pRuns));
        }
        if (pJobs.length) {
          await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, pJobs));
          await tx.delete(jobEvents).where(inArray(jobEvents.jobId, pJobs));
          await tx.delete(jobs).where(inArray(jobs.id, pJobs));
        }
        await tx.delete(clientLocations).where(eq(clientLocations.tenantId, pt));
        await tx.delete(clients).where(eq(clients.tenantId, pt));
        await tx.delete(tenants).where(eq(tenants.id, pt));
      });
    }
  }

  try {
    // ── lookups (global seed rows) ──
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [hvac] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HVAC"));
    const [inProgress] = await db.select({ id: jobStatuses.id }).from(jobStatuses).where(eq(jobStatuses.code, "IN_PROGRESS"));
    check("setup: operator + HVAC trade + IN_PROGRESS status exist", !!operator && !!hvac && !!inProgress);
    if (!operator || !hvac || !inProgress) return finish();

    // ── fresh tenant + client/location ──
    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Phase27 Harness Tenant" });
    clientId = uuidv7();
    await db.insert(clients).values({ id: clientId, tenantId: tId, name: "P27 Client" });
    locationId = uuidv7();
    await db.insert(clientLocations).values({ id: locationId, tenantId: tId, clientId, name: "P27 Loc", addressLine1: "1 Test Way", city: "Metropolis", stateProvince: "NY", postalCode: "10001" });

    // helper: a fresh ELIGIBLE (IN_PROGRESS) job with a chosen NTE.
    const mkJob = async (nte: string | null) => {
      const job = await createJob({ tenantId: tId, clientId, clientLocationId: locationId, primaryTradeId: hvac.id, problemDescription: "P27 proposal input", createdByUserId: operator.id });
      await db.update(jobs).set({ currentStatusId: inProgress.id, notToExceedAmount: nte }).where(eq(jobs.id, job.id));
      jobIds.push(job.id);
      return job.id;
    };

    const mk = await resolveClientMarkupDefault(tId, clientId); // null (no billing rule seeded)
    // The operator-authored, priced edited content (the dollars the published proposal must derive from).
    const pricedEdited: ProposedProposal = {
      lineItems: [{ category: "labor", description: "On-site service", scopePhrasing: "Perform the scoped work", quantity: "1.00", unitPrice: "500.00" }],
    };
    const expectedTotal = computeArLines([{ id: "0", quantity: "1.00", unitPrice: "500.00", markupPercent: mk, taxAmount: "0" }]).total;

    // ════════ STEP 1 — HARVEST / APPROVE-AS-IS corpus (asserted BEFORE scenario reviews exist) ════════
    // A raw-seeded corpus on its own agent_run; phrasingOnly distance drives the bucket. Asserting here
    // keeps proposalCorrectionPairs/proposalApproveAsIs isolated to this corpus (the scenario approves
    // in STEP 2 would otherwise pool in — tenant-scoped readers).
    const harvestJob = await mkJob("1000.00");
    const hRun = uuidv7();
    const started = new Date(Date.now() - 3600_000);
    await db.insert(agentRuns).values({ id: hRun, tenantId: tId, agentId: "proposal_generator_v1", status: "succeeded", startedAt: started, completedAt: started });
    runIds.push(hRun);

    const draftPhrasing = { lineItems: [{ category: "labor", description: "Compressor service", scopePhrasing: "Service the rooftop compressor" }] };
    // POSITIVE: same phrasing, operator only added numbers → phrasingOnly distance 0 (kept as-is).
    const positiveEdited = { lineItems: [{ category: "labor", description: "Compressor service", scopePhrasing: "Service the rooftop compressor", quantity: "1.00", unitPrice: "100.00" }] };
    // GOLD: moderately rewritten phrasing (distance in the gold band) + numbers (stripped on the pair).
    const goldEdited = { lineItems: [{ category: "labor", description: "HVAC compressor replacement", scopePhrasing: "Remove and replace the rooftop compressor, then recharge", quantity: "1.00", unitPrice: "100.00" }] };

    const mkDraft = async (proposed: unknown) => {
      const id = uuidv7();
      await db.insert(proposalDrafts).values({ id, tenantId: tId, jobId: harvestJob, agentRunId: hRun, proposedProposal: proposed, status: "pending_review" });
      draftIds.push(id);
      return id;
    };
    const mkReview = async (proposalDraftId: string, decision: "approve" | "reject", editedContent: unknown | null) => {
      await db.insert(proposalReviews).values({ id: uuidv7(), tenantId: tId, proposalDraftId, reviewerUserId: operator.id, decision, editedContent, reviewedAt: new Date(), createdAt: new Date() });
    };
    for (let i = 0; i < 2; i++) { const d = await mkDraft(draftPhrasing); await mkReview(d, "approve", goldEdited); }     // GOLD ×2
    for (let i = 0; i < 2; i++) { const d = await mkDraft(draftPhrasing); await mkReview(d, "approve", positiveEdited); } // POSITIVE ×2
    { const d = await mkDraft(draftPhrasing); await mkReview(d, "reject", null); }                                       // NEGATIVE ×1

    console.log("\n[H] HARVEST — proposalCorrectionPairs phrasing-distance buckets (numbers stripped)");
    const bucketCount = (ps: CorrectionPair[], b: string) => ps.filter((p) => p.bucket === b).length;
    const pairs = await proposalCorrectionPairs(tId);
    check("H1: harvest — 2 gold / 2 positive / 1 negative (5 pairs)",
      pairs.length === 5 && bucketCount(pairs, "gold") === 2 && bucketCount(pairs, "positive") === 2 && bucketCount(pairs, "negative") === 1,
      JSON.stringify(pairs.map((p) => p.bucket)));
    check("H2: gold pair editedContent is PHRASING-ONLY (no dollar digits)",
      pairs.filter((p) => p.bucket === "gold").every((p) => !/[0-9]/.test(p.editedContent ?? "")),
      JSON.stringify(pairs.filter((p) => p.bucket === "gold").map((p) => p.editedContent)));
    const sel = selectFewShotPairs(pairs);
    check("H3: selector — GOLD-first, NEGATIVE excluded (4 selected: 2 gold then 2 positive)",
      sel.length === 4 && sel[0].bucket === "gold" && sel[1].bucket === "gold" && sel.every((p) => p.bucket !== "negative"),
      JSON.stringify(sel.map((p) => p.bucket)));

    console.log("\n[A] APPROVE-AS-IS — proposal_generator_v1 phrasing-kept-as-is count");
    const approve = await proposalApproveAsIs(tId);
    check("A1: approve-as-is — reviewed=5, approvedAsIs=2 (the 2 phrasing-unchanged positives)",
      approve.reviewed === 5 && approve.approvedAsIs === 2, JSON.stringify(approve));

    // ════════ STEP 2 — MONEY-SAFETY + NTE GATE + IDEMPOTENCY (real run + publish) ════════
    console.log("\n[M/N/I] MONEY-SAFETY + NTE GATE + IDEMPOTENCY — real runProposalGenerator + publishProposalDraft");

    // helper: run the agent on a job, return the (number-free) pending draft id.
    const runDraft = async (jobId: string) => {
      const r = await runProposalGenerator({ tenantId: tId, jobId, triggeredByUserId: operator.id });
      runIds.push(r.runId);
      draftIds.push(r.draftId);
      return r.draftId;
    };

    // ── jobUnder (NTE 1000, total 500 ≤ NTE) → internal + event; also M1/M2/M3 + I1 ──
    const jobUnder = await mkJob("1000.00");
    const underDraft = await runDraft(jobUnder);
    const rawProposed = (await db.select({ raw: sql<string>`CAST(${proposalDrafts.proposedProposal} AS CHAR)` }).from(proposalDrafts).where(eq(proposalDrafts.id, underDraft)))[0]?.raw ?? "";
    check("M1: stored proposed_proposal is NUMBER-FREE (no quantity/unitPrice/markup/tax keys)",
      !/quantity|unitPrice|markup|tax/i.test(rawProposed), rawProposed);
    await createProposalReview({ tenantId: tId, proposalDraftId: underDraft, reviewerUserId: operator.id, decision: "approve", editedContent: pricedEdited });
    const pubUnder = await publishProposalDraft({ tenantId: tId, jobId: jobUnder, draftId: underDraft, actorUserId: operator.id });
    propIds.push(pubUnder.proposalId);
    const underProp = await getProposal(tId, pubUnder.proposalId);
    const underLines = await listProposalLineItems(tId, pubUnder.proposalId);
    check("M2: published total derives ONLY from editedContent + resolved markup (=== computeArLines.total)",
      underProp?.total === expectedTotal && underLines.length === 1 && underLines[0]?.unitPrice === "500.00",
      `total=${underProp?.total} expected=${expectedTotal} lineUnit=${underLines[0]?.unitPrice}`);
    check("M3: published line markup_percent === resolveClientMarkupDefault",
      (underLines[0]?.markupPercent ?? null) === mk, `got=${underLines[0]?.markupPercent} mk=${mk}`);

    const internalEvents = await db.select({ id: jobBillingEvents.id }).from(jobBillingEvents).where(and(eq(jobBillingEvents.jobId, jobUnder), eq(jobBillingEvents.eventType, "proposal.internal_billed")));
    check("N1: total ≤ NTE → kind=internal, status=internal_billed, proposal.internal_billed event emitted",
      pubUnder.kind === "internal" && underProp?.kind === "internal" && underProp?.status === "internal_billed" && internalEvents.length === 1,
      `kind=${pubUnder.kind} status=${underProp?.status} events=${internalEvents.length}`);

    let alreadyThrew = false;
    try { await publishProposalDraft({ tenantId: tId, jobId: jobUnder, draftId: underDraft, actorUserId: operator.id }); }
    catch (e) { alreadyThrew = e instanceof ProposalAlreadyMaterialized; }
    const underPropCount = (await db.select({ id: proposals.id }).from(proposals).where(eq(proposals.jobId, jobUnder))).length;
    check("I1: double-publish → ProposalAlreadyMaterialized; exactly ONE proposals row for the job",
      alreadyThrew && underPropCount === 1, `threw=${alreadyThrew} count=${underPropCount}`);

    // ── jobOver (NTE 100, total 500 > NTE) → client, no internal event ──
    const jobOver = await mkJob("100.00");
    const overDraft = await runDraft(jobOver);
    await createProposalReview({ tenantId: tId, proposalDraftId: overDraft, reviewerUserId: operator.id, decision: "approve", editedContent: pricedEdited });
    const pubOver = await publishProposalDraft({ tenantId: tId, jobId: jobOver, draftId: overDraft, actorUserId: operator.id });
    propIds.push(pubOver.proposalId);
    const overProp = await getProposal(tId, pubOver.proposalId);
    const overEvents = (await db.select({ id: jobBillingEvents.id }).from(jobBillingEvents).where(and(eq(jobBillingEvents.jobId, jobOver), eq(jobBillingEvents.eventType, "proposal.internal_billed")))).length;
    check("N2: total > NTE → kind=client, status=draft, NO internal_billed event",
      pubOver.kind === "client" && overProp?.kind === "client" && overProp?.status === "draft" && overEvents === 0,
      `kind=${pubOver.kind} status=${overProp?.status} events=${overEvents}`);

    // ── jobNull (NTE null) → client (fail-safe) ──
    const jobNull = await mkJob(null);
    const nullDraft = await runDraft(jobNull);
    await createProposalReview({ tenantId: tId, proposalDraftId: nullDraft, reviewerUserId: operator.id, decision: "approve", editedContent: pricedEdited });
    const pubNull = await publishProposalDraft({ tenantId: tId, jobId: jobNull, draftId: nullDraft, actorUserId: operator.id });
    propIds.push(pubNull.proposalId);
    check("N3: effective NTE null → kind=client (fail-safe)", pubNull.kind === "client", `kind=${pubNull.kind}`);

    // ── jobForce (NTE 1000, under) + forceClientReview → client (override toward review) ──
    const jobForce = await mkJob("1000.00");
    const forceDraft = await runDraft(jobForce);
    await createProposalReview({ tenantId: tId, proposalDraftId: forceDraft, reviewerUserId: operator.id, decision: "approve", editedContent: pricedEdited });
    const pubForce = await publishProposalDraft({ tenantId: tId, jobId: jobForce, draftId: forceDraft, actorUserId: operator.id, forceClientReview: true });
    propIds.push(pubForce.proposalId);
    check("N4: under-NTE + forceClientReview → kind=client (override forces toward review)", pubForce.kind === "client", `kind=${pubForce.kind}`);

    // ── jobFail (approve AS-IS, number-free) → publish FAILS CLOSED, no proposals row ──
    const jobFail = await mkJob("1000.00");
    const failDraft = await runDraft(jobFail);
    await createProposalReview({ tenantId: tId, proposalDraftId: failDraft, reviewerUserId: operator.id, decision: "approve", editedContent: null }); // approve-as-is (no pricing)
    let pricingThrew = false;
    try { await publishProposalDraft({ tenantId: tId, jobId: jobFail, draftId: failDraft, actorUserId: operator.id }); }
    catch (e) { pricingThrew = e instanceof ProposalRequiresPricing; }
    const failPropCount = (await db.select({ id: proposals.id }).from(proposals).where(eq(proposals.jobId, jobFail))).length;
    check("M4: approve-as-is (number-free) → publish throws ProposalRequiresPricing; NO proposals row materialized",
      pricingThrew && failPropCount === 0, `threw=${pricingThrew} count=${failPropCount}`);

    // ════════ STEP 3 — VOLUME (free via GROUP BY agent_id) ════════
    console.log("\n[V] VOLUME — proposal_generator_v1 surfaces with no hardcoded list");
    const vol = await agentVolumeByAgent(tId);
    const vProp = vol.find((r) => r.agentId === "proposal_generator_v1");
    check("V1: volume — proposal_generator_v1 total=6 (hRun + 5 scenario runs), all succeeded",
      vProp?.total === 6 && vProp?.succeeded === 6, JSON.stringify(vProp));

    // ════════ THE HONESTY LOG ════════
    console.log("\n[HONESTY]");
    console.log("  [check-p27] This is a SEEDED-FIXTURE + MOCK proof. The model is SYNTHETIC and the");
    console.log("  dollars are operator-authored fixtures. The MONEY-SAFETY invariants (number-free draft;");
    console.log("  the published total derives ONLY from operator editedContent + rule markup; an unpriced");
    console.log("  draft fails closed) and the NTE SEND-GATE (4 paths + the internal_billed event) are proven");
    console.log("  on the REAL publish + gate code. No live proposal-quality lift is asserted or implied.");

    return finish();
  } finally {
    await teardown();
    console.log("[check-p27] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-p27] passed: ${passed}`);
  console.log(`[check-p27] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-p27] PHASE-27 PROPOSAL LEDGER RED ✗ — PHASE BLOCKED");
  } else {
    console.log("[check-p27] PHASE-27 PROPOSAL LEDGER GREEN ✓ (money-safety: number-free draft + total derives only from operator pricing + markup / approve-as-is fails closed / NTE gate 4 paths + internal_billed event / idempotency / harvest buckets + gold-first selector / approve-as-is + volume — SEEDED+MOCK proof, NOT a live lift)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => { console.error("[check-p27] FAILED:", e); process.exit(1); });
