/**
 * scripts/check-phase-24.ts — Phase 24 OBSERVABILITY + MULTI-PROVIDER + RETENTION harness.
 *
 * Phase-blocking ledger for Phase 24:
 *   GROUP A — the observability readers (agent-observability.ts) return correct shapes against
 *             a SEEDED, isolated fixture (a dedicated fresh test tenant → exact counts):
 *             volume / dispositions / dispatch-autonomy / approve-as-is (incl. latest-review
 *             dedupe + dispatch N/A) / failure points (incl. "(no message)") / cost (incl.
 *             null-model + unknown-model exclusion) / latency.
 *   GROUP B — the failover candidate-builder + retry predicate (PURE logic; no seed).
 *   GROUP C — the retention eligibility counter (shared with the retention script; no seed).
 *
 * SANDBOX ONLY — hard-guarded (forces the *_sandbox DB; a check harness must NEVER touch prod).
 * Self-seeds a fresh tenant + fixtures and tears them down BY TRACKED ID under FK_CHECKS=0
 * (children-first; NEVER by created_at/timestamp — the JS-Date-vs-DB-timezone bug class).
 * Mirrors scripts/check-phase-23.ts. Run: pnpm run db:check:observability
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-p24] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[check-p24] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-p24] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "phase24-harness-tenant";
const KNOWN_MODEL = "anthropic/claude-sonnet-4-6";
const UNKNOWN_MODEL = "anthropic/some-unknown-model-x";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, jobs, jobStatusHistory, jobEvents, trades, users,
    agentRuns, agentDecisions,
    updateRewriteDrafts, updateRewriteReviews, jobScopeDrafts, jobScopeReviews,
  } = await import("@/server/schema");
  const { eq, inArray } = await import("drizzle-orm");
  const { createJob } = await import("@/server/jobs");
  const {
    agentVolumeByAgent, agentDispositionBreakdown, dispatchAutonomyBreakdown,
    agentApproveAsIs, agentFailurePoints, agentCostByAgent, agentLatencyDistribution,
  } = await import("@/server/analytics/agent-observability");

  // tracked ids (teardown deletes ONLY these — never a timestamp window)
  const runIds: string[] = [];
  const rwDraftIds: string[] = [];
  const scDraftIds: string[] = [];
  let tId = "";
  let clientId = "";
  let locationId = "";
  let jobId = "";

  async function teardown() {
    try {
      await db.transaction(async (tx) => {
        await tx.execute((await import("drizzle-orm")).sql`SET FOREIGN_KEY_CHECKS = 0`);
        // children-first, all by tracked id
        if (rwDraftIds.length) {
          await tx.delete(updateRewriteReviews).where(inArray(updateRewriteReviews.draftId, rwDraftIds));
          await tx.delete(updateRewriteDrafts).where(inArray(updateRewriteDrafts.id, rwDraftIds));
        }
        if (scDraftIds.length) {
          await tx.delete(jobScopeReviews).where(inArray(jobScopeReviews.draftId, scDraftIds));
          await tx.delete(jobScopeDrafts).where(inArray(jobScopeDrafts.id, scDraftIds));
        }
        if (runIds.length) {
          await tx.delete(agentDecisions).where(inArray(agentDecisions.agentRunId, runIds));
          await tx.delete(agentRuns).where(inArray(agentRuns.id, runIds));
        }
        if (jobId) {
          await tx.delete(jobStatusHistory).where(eq(jobStatusHistory.jobId, jobId));
          await tx.delete(jobEvents).where(eq(jobEvents.jobId, jobId));
          await tx.delete(jobs).where(eq(jobs.id, jobId));
        }
        if (locationId) await tx.delete(clientLocations).where(eq(clientLocations.id, locationId));
        if (clientId) await tx.delete(clients).where(eq(clients.id, clientId));
        if (tId) await tx.delete(tenants).where(eq(tenants.id, tId));
        await tx.execute((await import("drizzle-orm")).sql`SET FOREIGN_KEY_CHECKS = 1`);
      });
    } catch (e) { console.error("[check-p24] teardown warning:", e); }
  }

  // pre-clean a leftover test tenant + its fixtures from a prior partial run
  {
    const prior = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG)).limit(1);
    if (prior[0]) {
      const pt = prior[0].id;
      const pClients = await db.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, pt));
      const pJobs = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, pt));
      const pRuns = await db.select({ id: agentRuns.id }).from(agentRuns).where(eq(agentRuns.tenantId, pt));
      const pJobIds = pJobs.map((j) => j.id);
      const pRunIds = pRuns.map((r) => r.id);
      const { sql } = await import("drizzle-orm");
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
        if (pRunIds.length) {
          const rwD = await tx.select({ id: updateRewriteDrafts.id }).from(updateRewriteDrafts).where(inArray(updateRewriteDrafts.agentRunId, pRunIds));
          const scD = await tx.select({ id: jobScopeDrafts.id }).from(jobScopeDrafts).where(inArray(jobScopeDrafts.agentRunId, pRunIds));
          const rwIds = rwD.map((d) => d.id), scIds = scD.map((d) => d.id);
          if (rwIds.length) { await tx.delete(updateRewriteReviews).where(inArray(updateRewriteReviews.draftId, rwIds)); await tx.delete(updateRewriteDrafts).where(inArray(updateRewriteDrafts.id, rwIds)); }
          if (scIds.length) { await tx.delete(jobScopeReviews).where(inArray(jobScopeReviews.draftId, scIds)); await tx.delete(jobScopeDrafts).where(inArray(jobScopeDrafts.id, scIds)); }
          await tx.delete(agentDecisions).where(inArray(agentDecisions.agentRunId, pRunIds));
          await tx.delete(agentRuns).where(inArray(agentRuns.id, pRunIds));
        }
        if (pJobIds.length) {
          await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, pJobIds));
          await tx.delete(jobEvents).where(inArray(jobEvents.jobId, pJobIds));
          await tx.delete(jobs).where(inArray(jobs.id, pJobIds));
        }
        await tx.delete(clientLocations).where(eq(clientLocations.tenantId, pt));
        if (pClients.length) await tx.delete(clients).where(eq(clients.tenantId, pt));
        await tx.delete(tenants).where(eq(tenants.id, pt));
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
      });
    }
  }

  try {
    // ── lookups (global seed rows) ──
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [hvac] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HVAC"));
    check("setup: operator + HVAC trade exist", !!operator && !!hvac);
    if (!operator || !hvac) return finish();

    // ── fresh test tenant + client/location + throwaway job (draft FK target) ──
    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Phase24 Harness Tenant" });
    clientId = uuidv7();
    await db.insert(clients).values({ id: clientId, tenantId: tId, name: "P24 Client" });
    locationId = uuidv7();
    await db.insert(clientLocations).values({ id: locationId, tenantId: tId, clientId, name: "P24 Loc", addressLine1: "1 Test Way", city: "Metropolis", stateProvince: "NY", postalCode: "10001" });
    const job = await createJob({ tenantId: tId, clientId, clientLocationId: locationId, primaryTradeId: hvac.id, problemDescription: "P24 throwaway job (draft FK target)", createdByUserId: operator.id });
    jobId = job.id;

    // ── GROUP A fixtures: agent_runs (A/B/B2/C/U) ──
    const started = new Date(Date.now() - 3600_000); // 1h ago, safely in the past
    const completedAfter = (sec: number) => new Date(started.getTime() + sec * 1000);
    const mkRun = async (v: {
      agentId: string; status: "succeeded" | "failed"; triggerSource?: string;
      model?: string | null; inputTokens?: number | null; outputTokens?: number | null;
      errorMessage?: string | null; durSec: number;
    }) => {
      const id = uuidv7();
      await db.insert(agentRuns).values({
        id, tenantId: tId, agentId: v.agentId, status: v.status,
        triggerSource: v.triggerSource ?? "operator_manual",
        model: v.model ?? null, inputTokens: v.inputTokens ?? null, outputTokens: v.outputTokens ?? null,
        errorMessage: v.errorMessage ?? null, startedAt: started, completedAt: completedAfter(v.durSec),
      });
      runIds.push(id);
      return id;
    };
    const runA = await mkRun({ agentId: "update_rewriter_v1", status: "succeeded", model: KNOWN_MODEL, inputTokens: 100, outputTokens: 50, durSec: 20 });
    /* B  */ await mkRun({ agentId: "scope_generator_v1", status: "failed", errorMessage: "boom: provider timeout while generating scope", durSec: 5 });
    /* B2 */ await mkRun({ agentId: "scope_generator_v1", status: "failed", errorMessage: null, durSec: 8 });
    const runC = await mkRun({ agentId: "dispatch_router_v1", status: "succeeded", triggerSource: "auto_dispatch", model: null, inputTokens: null, outputTokens: null, durSec: 12 });
    /* U  */ await mkRun({ agentId: "update_rewriter_v1", status: "succeeded", model: UNKNOWN_MODEL, inputTokens: 200, outputTokens: 100, durSec: 30 });

    // ── agent_decisions ──
    const mkDecision = async (runId: string, decisionType: string, disposition: "queued_for_review" | "auto_executed" | "policy_blocked") => {
      await db.insert(agentDecisions).values({ id: uuidv7(), tenantId: tId, agentRunId: runId, decisionType, disposition });
    };
    await mkDecision(runA, "rewrite_proposal", "queued_for_review");
    await mkDecision(runC, "auto_dispatch", "auto_executed");
    await mkDecision(runC, "auto_dispatch", "policy_blocked");

    // ── rewriter drafts + reviews (approve-as-is / edited / latest-review dedupe) ──
    const mkRwDraft = async () => {
      const id = uuidv7();
      await db.insert(updateRewriteDrafts).values({ id, tenantId: tId, jobId, agentRunId: runA, sourceType: "job_note", sourceId: uuidv7(), draftContent: "draft content" });
      rwDraftIds.push(id);
      return id;
    };
    const mkRwReview = async (draftId: string, decision: "approve" | "reject", editedContent: string | null, createdAt: Date) => {
      await db.insert(updateRewriteReviews).values({ id: uuidv7(), tenantId: tId, draftId, reviewerUserId: operator.id, decision, editedContent, reviewedAt: createdAt, createdAt });
    };
    const rwD1 = await mkRwDraft(); await mkRwReview(rwD1, "approve", null, new Date());           // approve-as-is
    const rwD2 = await mkRwDraft(); await mkRwReview(rwD2, "approve", "operator edit", new Date()); // edited (not as-is)
    const rwD3 = await mkRwDraft();
    await mkRwReview(rwD3, "reject", null, new Date(Date.now() - 10_000)); // older
    await mkRwReview(rwD3, "approve", null, new Date());                    // newer → latest wins (as-is)

    // ── scope drafts + reviews (mirror) ──
    const steps = [{ order: 1, instruction: "assess", category: "assess" }];
    const mkScDraft = async () => {
      const id = uuidv7();
      await db.insert(jobScopeDrafts).values({ id, tenantId: tId, jobId, agentRunId: runA, proposedSteps: steps });
      scDraftIds.push(id);
      return id;
    };
    const mkScReview = async (draftId: string, decision: "approve" | "reject", editedSteps: unknown | null, createdAt: Date) => {
      await db.insert(jobScopeReviews).values({ id: uuidv7(), tenantId: tId, draftId, reviewerUserId: operator.id, decision, editedSteps, reviewedAt: createdAt, createdAt });
    };
    const scD1 = await mkScDraft(); await mkScReview(scD1, "approve", null, new Date());        // as-is
    const scD2 = await mkScDraft(); await mkScReview(scD2, "approve", steps, new Date());        // edited
    const scD3 = await mkScDraft();
    await mkScReview(scD3, "reject", null, new Date(Date.now() - 10_000));
    await mkScReview(scD3, "approve", null, new Date());                                          // latest → as-is

    // ════════ GROUP A — observability readers (exact, isolated to tId) ════════
    console.log("\n[A] OBSERVABILITY READERS");
    const vol = await agentVolumeByAgent(tId);
    const byAgent = (a: string) => vol.find((r) => r.agentId === a);
    check("A1: volume — update_rewriter_v1 total=2, succeeded=2, tokens 300/150",
      byAgent("update_rewriter_v1")?.total === 2 && byAgent("update_rewriter_v1")?.succeeded === 2 &&
      byAgent("update_rewriter_v1")?.inputTokens === 300 && byAgent("update_rewriter_v1")?.outputTokens === 150,
      JSON.stringify(byAgent("update_rewriter_v1")));
    check("A2: volume — scope_generator_v1 total=2, failed=2", byAgent("scope_generator_v1")?.total === 2 && byAgent("scope_generator_v1")?.failed === 2);
    check("A3: volume — dispatch_router_v1 run counted, tokens COALESCE'd to 0",
      byAgent("dispatch_router_v1")?.total === 1 && byAgent("dispatch_router_v1")?.inputTokens === 0 && byAgent("dispatch_router_v1")?.outputTokens === 0);

    const disp = await agentDispositionBreakdown(tId);
    const dByAgent = (a: string) => disp.find((r) => r.agentId === a);
    check("A4: dispositions — update_rewriter_v1 queued=1", dByAgent("update_rewriter_v1")?.queuedForReview === 1);
    check("A5: dispositions — dispatch_router_v1 auto_executed=1 policy_blocked=1",
      dByAgent("dispatch_router_v1")?.autoExecuted === 1 && dByAgent("dispatch_router_v1")?.policyBlocked === 1);

    const dash = await dispatchAutonomyBreakdown(tId);
    check("A6: dispatch autonomy — {auto:1, blocked:1, queued:0}", dash.autoExecuted === 1 && dash.policyBlocked === 1 && dash.queuedForReview === 0, JSON.stringify(dash));

    const approve = await agentApproveAsIs(tId);
    const aByAgent = (a: string) => approve.find((r) => r.agentId === a);
    check("A7: approve-as-is — rewriter reviewed=3, approvedAsIs=2 (latest-review dedupe)",
      aByAgent("update_rewriter_v1")?.applicable === true && aByAgent("update_rewriter_v1")?.reviewed === 3 && aByAgent("update_rewriter_v1")?.approvedAsIs === 2,
      JSON.stringify(aByAgent("update_rewriter_v1")));
    check("A8: approve-as-is — scope reviewed=3, approvedAsIs=2",
      aByAgent("scope_generator_v1")?.reviewed === 3 && aByAgent("scope_generator_v1")?.approvedAsIs === 2);
    check("A9: approve-as-is — dispatch_router_v1 applicable:false (rule-based, no review)",
      aByAgent("dispatch_router_v1")?.applicable === false);

    const fails = await agentFailurePoints(tId);
    const f = fails.find((r) => r.agentId === "scope_generator_v1");
    check("A10: failures — scope_generator_v1 failedCount=2", f?.failedCount === 2, JSON.stringify(f));
    check("A11: failures — captures the error message AND '(no message)' for the null one",
      !!f && f.recentErrors.some((e) => e.includes("boom: provider timeout")) && f.recentErrors.includes("(no message)"),
      JSON.stringify(f?.recentErrors));

    const cost = await agentCostByAgent(tId);
    const knownRow = cost.find((c) => c.agentId === "update_rewriter_v1" && c.model === KNOWN_MODEL);
    check("A12: cost — known model row present, total = 0.001050 (100×$3/M + 50×$15/M)", knownRow?.totalCost === "0.001050", JSON.stringify(knownRow));
    check("A13: cost — null-model (dispatch) EXCLUDED", !cost.some((c) => c.agentId === "dispatch_router_v1"));
    check("A14: cost — unknown-model EXCLUDED (priceFor null)", !cost.some((c) => c.model === UNKNOWN_MODEL));

    const lat = await agentLatencyDistribution(tId);
    check("A15: latency — count=5, p50=12, p90=26, mean=15", lat.count === 5 && lat.p50Seconds === 12 && lat.p90Seconds === 26 && lat.meanSeconds === 15, JSON.stringify(lat));

    // ════════ GROUP B — failover logic (PURE; no DB) ════════
    console.log("\n[B] FAILOVER LOGIC");
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    const { buildCandidates, isProviderTransportError } = await import("@/server/agents/failover");
    const { APICallError, NoObjectGeneratedError } = await import("ai");
    const direct = { mode: "direct", provider: "anthropic", modelId: "claude-sonnet-4-6", recordedModel: KNOWN_MODEL } as const;
    const rec = (cs: { recordedModel: string }[]) => cs.map((c) => c.recordedModel);
    check("B1: no preference → [anthropic]", JSON.stringify(rec(buildCandidates(direct, undefined))) === JSON.stringify([KNOWN_MODEL]));
    check("B2: [anthropic,openai] no key → [anthropic]", JSON.stringify(rec(buildCandidates(direct, [KNOWN_MODEL, "openai/gpt-5.4"]))) === JSON.stringify([KNOWN_MODEL]));
    check("B3: [openai,anthropic] no key → [anthropic] (skip unavailable, order honored)", JSON.stringify(rec(buildCandidates(direct, ["openai/gpt-5.4", KNOWN_MODEL]))) === JSON.stringify([KNOWN_MODEL]));
    check("B4: unparseable/non-array → base", JSON.stringify(rec(buildCandidates(direct, "garbage"))) === JSON.stringify([KNOWN_MODEL]));
    check("B5: unknown providers → base", JSON.stringify(rec(buildCandidates(direct, ["gemini/foo", "bogus"]))) === JSON.stringify([KNOWN_MODEL]));
    check("B6: only-unavailable (openai, no key) → base fallback", JSON.stringify(rec(buildCandidates(direct, ["openai/gpt-5.4"]))) === JSON.stringify([KNOWN_MODEL]));
    const apiErr = (statusCode: number, isRetryable: boolean) => new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode, isRetryable });
    check("B7: APICallError 429 → retry", isProviderTransportError(apiErr(429, true)) === true);
    check("B8: APICallError 500 → retry", isProviderTransportError(apiErr(500, false)) === true);
    check("B9: APICallError 400 → rethrow", isProviderTransportError(apiErr(400, false)) === false);
    check("B10: NoObjectGeneratedError → rethrow", isProviderTransportError(new NoObjectGeneratedError({ message: "schema", cause: undefined, text: "", response: undefined as never, usage: undefined as never, finishReason: "stop" })) === false);
    check("B11: plain Error → rethrow", isProviderTransportError(new Error("x")) === false);

    // ════════ GROUP C — retention eligibility (shared counter; no seed) ════════
    console.log("\n[C] RETENTION");
    const { countEligibleAgentPayloads } = await import("@/server/agents/retention");
    const elig = await countEligibleAgentPayloads();
    check("C1: retention — 0 eligible payloads against recent data (forward-looking no-op)", elig.total === 0, JSON.stringify(elig));

    return finish();
  } finally {
    await teardown();
    console.log("[check-p24] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-p24] passed: ${passed}`);
  console.log(`[check-p24] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-p24] PHASE-24 OBSERVABILITY LEDGER RED ✗ — PHASE BLOCKED");
  } else {
    console.log("[check-p24] PHASE-24 OBSERVABILITY LEDGER GREEN ✓ (volume / dispositions / dispatch-autonomy / approve-as-is + dedupe + N/A / failures + no-message / cost + null+unknown-model exclusion / latency / failover candidate+predicate / retention counter)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => { console.error("[check-p24] FAILED:", e); process.exit(1); });
