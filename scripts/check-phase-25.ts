/**
 * scripts/check-phase-25.ts — Phase 25 FEEDBACK-LOOP harness (seeded corpus + held-out measurement).
 *
 * Phase-blocking ACCEPTANCE PROOF for Phase 25 (Harvest Corrections → Few-Shot):
 *   GROUP H — HARVEST: the 25b reader (rewriter/scopeCorrectionPairs) harvests a SEEDED synthetic
 *             correction corpus from the real FK chain (agent_runs → drafts → reviews) into the
 *             three buckets, and selectFewShotPairs picks GOLD-first / excludes NEGATIVE.
 *   GROUP P — PLUMBING: the mined few-shot block provably REACHES the model. A deterministic mock
 *             model (injected via the provider registry — "providers are DATA") captures the prompt;
 *             the few-shot arm shows example turns BEFORE the held-out user turn, the baseline arm
 *             shows the unchanged single-shot prompt (no example turns).
 *   GROUP M — MEASURABILITY: a deterministic metric (presence of a known corrected marker the gold
 *             edit introduces) is COMPUTED over HELD-OUT inputs for baseline vs few-shot, and the
 *             apparatus demonstrably DISCRIMINATES on few-shot presence.
 *
 * THE HONESTY RULE (roadmap §6 / 25a §6): this is a SEEDED-CORPUS measurability + plumbing proof,
 * NOT a live quality-lift claim. The corpus and the responder are synthetic; live data is too thin
 * (1 gold pair platform-wide) to support any improvement claim. The machinery is what ships; it
 * sharpens as real operator reviews accumulate. See the explicit honesty log() near the end.
 *
 * SANDBOX ONLY — hard-guarded (forces *_sandbox; a check harness must NEVER touch prod). Self-seeds
 * a fresh tenant + corpus and tears it down BY TRACKED ID under FK_CHECKS=0 (children-first; NEVER
 * by created_at/timestamp). Mirrors scripts/check-phase-24.ts. Run: pnpm run db:check:feedback
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-p25] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[check-p25] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-p25] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "phase25-harness-tenant";
// Deterministic correction markers the GOLD edits introduce — the held-out metric keys on these.
const REWRITER_MARKER = "[[CORRECTED-OMEGA]]";
const SCOPE_MARKER = "MARKER_STEP_OMEGA";

// Deterministic provider-level usage (V3 shape) for the mock.
const MOCK_USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

// Captured prompts from the mock model (one per generate* call). Reset before each call.
type V3Msg = { role: string; content: string | Array<{ type: string; text?: string }> };
const captures: V3Msg[][] = [];
function msgText(m: V3Msg): string {
  return typeof m.content === "string"
    ? m.content
    : m.content.map((p) => (p.type === "text" ? p.text ?? "" : "")).join("");
}

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, jobs, jobStatusHistory, jobEvents, trades, users,
    agentRuns, updateRewriteDrafts, updateRewriteReviews, jobScopeDrafts, jobScopeReviews,
  } = await import("@/server/schema");
  const { eq, inArray, sql } = await import("drizzle-orm");
  const { createJob } = await import("@/server/jobs");
  const { MockLanguageModelV3 } = await import("ai/test");
  const { PROVIDER_REGISTRY } = await import("@/server/agents/providers");
  const { rewriterCorrectionPairs, scopeCorrectionPairs, selectFewShotPairs } =
    await import("@/server/analytics/correction-pairs");
  const { generateRewrite } = await import("@/server/agents/update-rewriter/llm");
  const { buildUserPrompt } = await import("@/server/agents/update-rewriter/prompt");
  const { generateScope, buildScopeUserPrompt } = await import("@/server/agents/scope-generator/llm");

  type CorrectionPair = Awaited<ReturnType<typeof rewriterCorrectionPairs>>[number];
  type JobNoteRow = Parameters<typeof generateRewrite>[0]["note"];
  type JobDetail = Parameters<typeof generateRewrite>[0]["job"];

  // tracked ids (teardown deletes ONLY these — never a timestamp window)
  const runIds: string[] = [];
  const rwDraftIds: string[] = [];
  const scDraftIds: string[] = [];
  let tId = "";
  let clientId = "";
  let locationId = "";
  let jobId = "";

  // The direct routing — no env key needed: buildCandidates(direct, undefined) → [base], and
  // base.model = buildProviderModel("anthropic", …), which the registry override below returns as
  // our mock. This exercises the REAL agent seam (buildFewShotMessages + branch + generateObject).
  const directRouting = {
    mode: "direct" as const, provider: "anthropic" as const,
    modelId: "claude-sonnet-4-6", recordedModel: "anthropic/claude-sonnet-4-6",
  };

  // The deterministic responder: scans the incoming prompt for the marker (which the gold few-shot
  // examples carry) and emits an output WITH the marker iff present — i.e. it stands in for "a model
  // that uses the few-shot examples". This is the apparatus, not a real LLM (THE HONESTY RULE).
  function makeMock(kind: "rewriter" | "scope") {
    return new MockLanguageModelV3({
      doGenerate: async (options) => {
        const prompt = options.prompt as unknown as V3Msg[];
        captures.push(prompt);
        const allText = prompt.map(msgText).join("\n");
        let obj: unknown;
        if (kind === "rewriter") {
          const hasMarker = allText.includes(REWRITER_MARKER);
          obj = {
            clientFacingText: "Your work order is progressing." + (hasMarker ? " " + REWRITER_MARKER : ""),
            strippedItems: [], confidence: "high", rationale: "mock", rephrasings: [],
          };
        } else {
          const hasMarker = allText.includes(SCOPE_MARKER);
          const steps: Array<{ order: number; instruction: string; category: string }> = [
            { order: 1, instruction: "Assess the reported issue.", category: "assess" },
          ];
          if (hasMarker) steps.push({ order: 2, instruction: `${SCOPE_MARKER} — document with photos.`, category: "document" });
          obj = { steps, assumptions: [], confidence: "high", rationale: "mock" };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(obj) }],
          finishReason: "stop", usage: MOCK_USAGE, warnings: [],
        } as never;
      },
    });
  }

  async function teardown() {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
        if (rwDraftIds.length) {
          await tx.delete(updateRewriteReviews).where(inArray(updateRewriteReviews.draftId, rwDraftIds));
          await tx.delete(updateRewriteDrafts).where(inArray(updateRewriteDrafts.id, rwDraftIds));
        }
        if (scDraftIds.length) {
          await tx.delete(jobScopeReviews).where(inArray(jobScopeReviews.draftId, scDraftIds));
          await tx.delete(jobScopeDrafts).where(inArray(jobScopeDrafts.id, scDraftIds));
        }
        if (runIds.length) await tx.delete(agentRuns).where(inArray(agentRuns.id, runIds));
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
    } catch (e) { console.error("[check-p25] teardown warning:", e); }
  }

  // pre-clean a leftover harness tenant + its fixtures from a prior partial run (idempotency)
  {
    const prior = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG)).limit(1);
    if (prior[0]) {
      const pt = prior[0].id;
      const pJobs = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, pt));
      const pRuns = await db.select({ id: agentRuns.id }).from(agentRuns).where(eq(agentRuns.tenantId, pt));
      const pJobIds = pJobs.map((j) => j.id);
      const pRunIds = pRuns.map((r) => r.id);
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
        if (pRunIds.length) {
          const rwD = await tx.select({ id: updateRewriteDrafts.id }).from(updateRewriteDrafts).where(inArray(updateRewriteDrafts.agentRunId, pRunIds));
          const scD = await tx.select({ id: jobScopeDrafts.id }).from(jobScopeDrafts).where(inArray(jobScopeDrafts.agentRunId, pRunIds));
          const rwIds = rwD.map((d) => d.id), scIds = scD.map((d) => d.id);
          if (rwIds.length) { await tx.delete(updateRewriteReviews).where(inArray(updateRewriteReviews.draftId, rwIds)); await tx.delete(updateRewriteDrafts).where(inArray(updateRewriteDrafts.id, rwIds)); }
          if (scIds.length) { await tx.delete(jobScopeReviews).where(inArray(jobScopeReviews.draftId, scIds)); await tx.delete(jobScopeDrafts).where(inArray(jobScopeDrafts.id, scIds)); }
          await tx.delete(agentRuns).where(inArray(agentRuns.id, pRunIds));
        }
        if (pJobIds.length) {
          await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, pJobIds));
          await tx.delete(jobEvents).where(inArray(jobEvents.jobId, pJobIds));
          await tx.delete(jobs).where(inArray(jobs.id, pJobIds));
        }
        await tx.delete(clientLocations).where(eq(clientLocations.tenantId, pt));
        await tx.delete(clients).where(eq(clients.tenantId, pt));
        await tx.delete(tenants).where(eq(tenants.id, pt));
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
      });
    }
  }

  // Save the real anthropic factory so we restore it on teardown (no cross-contamination).
  const realBuildModel = PROVIDER_REGISTRY.anthropic.buildModel;

  try {
    // ── lookups (global seed rows) ──
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [hvac] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HVAC"));
    check("setup: operator + HVAC trade exist", !!operator && !!hvac);
    if (!operator || !hvac) return finish();

    // ── fresh tenant + client/location + throwaway job (the draft FK target) ──
    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Phase25 Harness Tenant" });
    clientId = uuidv7();
    await db.insert(clients).values({ id: clientId, tenantId: tId, name: "P25 Client" });
    locationId = uuidv7();
    await db.insert(clientLocations).values({ id: locationId, tenantId: tId, clientId, name: "P25 Loc", addressLine1: "1 Test Way", city: "Metropolis", stateProvince: "NY", postalCode: "10001" });
    const job = await createJob({ tenantId: tId, clientId, clientLocationId: locationId, primaryTradeId: hvac.id, problemDescription: "P25 throwaway job (draft FK target)", createdByUserId: operator.id });
    jobId = job.id;

    // ── seed agent_runs (the standing watchpoint: drafts hang off a real run, not orphaned) ──
    const started = new Date(Date.now() - 3600_000);
    const mkRun = async (agentId: string) => {
      const id = uuidv7();
      await db.insert(agentRuns).values({ id, tenantId: tId, agentId, status: "succeeded", startedAt: started, completedAt: started });
      runIds.push(id);
      return id;
    };
    const rwRun = await mkRun("update_rewriter_v1");
    const scRun = await mkRun("scope_generator_v1");

    // ════════ STEP 2 — SEED SYNTHETIC CORRECTION CORPUS (TRAIN) ════════
    // Per agent: 2 GOLD (approve + edit carrying the marker), 2 POSITIVE (approve as-is), 1 NEGATIVE
    // (reject). The GOLD edit deterministically introduces the marker → the held-out metric is
    // reproducible. The corpus is the TRAIN set (harvested + injected); held-out inputs are separate.
    const mkRwDraft = async (content: string) => {
      const id = uuidv7();
      await db.insert(updateRewriteDrafts).values({ id, tenantId: tId, jobId, agentRunId: rwRun, sourceType: "job_note", sourceId: uuidv7(), draftContent: content });
      rwDraftIds.push(id);
      return id;
    };
    const mkRwReview = async (draftId: string, decision: "approve" | "reject", editedContent: string | null) => {
      await db.insert(updateRewriteReviews).values({ id: uuidv7(), tenantId: tId, draftId, reviewerUserId: operator.id, decision, editedContent, reviewedAt: new Date(), createdAt: new Date() });
    };
    for (let i = 0; i < 2; i++) { const d = await mkRwDraft(`rewriter draft GOLD ${i}`); await mkRwReview(d, "approve", `Approved client update ${i} ${REWRITER_MARKER}`); }
    for (let i = 0; i < 2; i++) { const d = await mkRwDraft(`rewriter draft POSITIVE ${i} (approved as-is)`); await mkRwReview(d, "approve", null); }
    { const d = await mkRwDraft("rewriter draft NEGATIVE (rejected)"); await mkRwReview(d, "reject", null); }

    const baseSteps = [{ order: 1, instruction: "Assess the issue.", category: "assess" }];
    const goldSteps = (i: number) => [
      { order: 1, instruction: "Assess the issue.", category: "assess" },
      { order: 2, instruction: `${SCOPE_MARKER} — document findings ${i}.`, category: "document" },
    ];
    const mkScDraft = async () => {
      const id = uuidv7();
      await db.insert(jobScopeDrafts).values({ id, tenantId: tId, jobId, agentRunId: scRun, proposedSteps: baseSteps });
      scDraftIds.push(id);
      return id;
    };
    const mkScReview = async (draftId: string, decision: "approve" | "reject", editedSteps: unknown | null) => {
      await db.insert(jobScopeReviews).values({ id: uuidv7(), tenantId: tId, draftId, reviewerUserId: operator.id, decision, editedSteps, reviewedAt: new Date(), createdAt: new Date() });
    };
    for (let i = 0; i < 2; i++) { const d = await mkScDraft(); await mkScReview(d, "approve", goldSteps(i)); }
    for (let i = 0; i < 2; i++) { const d = await mkScDraft(); await mkScReview(d, "approve", null); }
    { const d = await mkScDraft(); await mkScReview(d, "reject", null); }

    // ════════ GROUP H — HARVEST (25b reader over the seeded corpus) ════════
    console.log("\n[H] HARVEST — reader buckets + GOLD-first selector");
    const bucketCount = (ps: CorrectionPair[], b: string) => ps.filter((p) => p.bucket === b).length;

    const rwPairs = await rewriterCorrectionPairs(tId);
    check("H1: rewriter harvest — 2 gold / 2 positive / 1 negative",
      rwPairs.length === 5 && bucketCount(rwPairs, "gold") === 2 && bucketCount(rwPairs, "positive") === 2 && bucketCount(rwPairs, "negative") === 1,
      JSON.stringify(rwPairs.map((p) => p.bucket)));
    check("H2: rewriter gold pairs carry the correction marker in editedContent",
      rwPairs.filter((p) => p.bucket === "gold").every((p) => (p.editedContent ?? "").includes(REWRITER_MARKER)));
    const rwSel = selectFewShotPairs(rwPairs);
    check("H3: rewriter selector — GOLD-first, NEGATIVE excluded (4 selected: 2 gold then 2 positive)",
      rwSel.length === 4 && rwSel[0].bucket === "gold" && rwSel[1].bucket === "gold" && rwSel.every((p) => p.bucket !== "negative"),
      JSON.stringify(rwSel.map((p) => p.bucket)));

    const scPairs = await scopeCorrectionPairs(tId);
    check("H4: scope harvest — 2 gold / 2 positive / 1 negative",
      scPairs.length === 5 && bucketCount(scPairs, "gold") === 2 && bucketCount(scPairs, "positive") === 2 && bucketCount(scPairs, "negative") === 1,
      JSON.stringify(scPairs.map((p) => p.bucket)));
    check("H5: scope gold pairs carry the marker in editedContent (raw JSON string, unparsed)",
      scPairs.filter((p) => p.bucket === "gold").every((p) => (p.editedContent ?? "").includes(SCOPE_MARKER)));
    const scSel = selectFewShotPairs(scPairs);
    check("H6: scope selector — GOLD-first, NEGATIVE excluded (4 selected)",
      scSel.length === 4 && scSel[0].bucket === "gold" && scSel.every((p) => p.bucket !== "negative"),
      JSON.stringify(scSel.map((p) => p.bucket)));

    // ════════ STEP 3 — HELD-OUT inputs (disjoint from the TRAIN corpus) ════════
    // Their "known gold output" = an output carrying the marker (the correction the gold edits
    // teach). The mock returns the marker iff the few-shot examples (which carry it) are present.
    const heldOutRw: Array<{ note: JobNoteRow; job: JobDetail }> = [0, 1, 2].map((i) => ({
      note: { body: `Held-out internal note ${i}: vendor en route, parts ordered.` } as unknown as JobNoteRow,
      job: { clientName: `Client ${i}`, tradeName: "HVAC", locationName: `Loc ${i}`, problemDescription: `Held-out problem ${i}` } as unknown as JobDetail,
    }));
    const heldOutSc: JobDetail[] = [0, 1, 2].map((i) =>
      ({ clientName: `Client ${i}`, tradeName: "HVAC", locationName: `Loc ${i}`, priorityName: "High", problemDescription: `Held-out scope problem ${i}` } as unknown as JobDetail));

    // Plumbing inspector: given one captured prompt, the number of injected pairs, the expected
    // held-out user prompt, and the marker — verify the seam shape for that arm.
    function inspectPlumbing(cap: V3Msg[], nPairs: number, expected: string, marker: string): boolean {
      const users = cap.filter((m) => m.role === "user");
      const assts = cap.filter((m) => m.role === "assistant");
      const last = cap[cap.length - 1];
      if (nPairs === 0) {
        // baseline: the unchanged single-shot prompt — exactly one user turn, no example turns.
        return assts.length === 0 && users.length === 1 && msgText(last) === expected;
      }
      // few-shot: nPairs example pairs (one user + one assistant each) BEFORE the held-out user turn,
      // at least one example carrying the marker, and the held-out user prompt is the LAST message.
      return (
        assts.length === nPairs &&
        users.length === nPairs + 1 &&
        last.role === "user" &&
        msgText(last) === expected &&
        assts.some((m) => msgText(m).includes(marker))
      );
    }

    // ════════ STEP 4 — baseline vs few-shot over held-out, deterministic metric ════════
    PROVIDER_REGISTRY.anthropic.buildModel = () => makeMock("rewriter") as never;
    async function runRwArm(fewShot: CorrectionPair[]) {
      let hits = 0; let plumbing = true;
      for (const inp of heldOutRw) {
        captures.length = 0;
        const { object } = await generateRewrite({ routing: directRouting, systemPrompt: "SYS-RW", temperature: 0.3, note: inp.note, job: inp.job, vendorNames: [], fewShot });
        const expected = buildUserPrompt({ note: inp.note, job: inp.job, vendorNames: [] });
        plumbing = plumbing && inspectPlumbing(captures[captures.length - 1], fewShot.length, expected, REWRITER_MARKER);
        if (object.clientFacingText.includes(REWRITER_MARKER)) hits += 1;
      }
      return { score: hits / heldOutRw.length, plumbing };
    }
    const rwBase = await runRwArm([]);
    const rwFew = await runRwArm(rwSel);

    PROVIDER_REGISTRY.anthropic.buildModel = () => makeMock("scope") as never;
    async function runScArm(fewShot: CorrectionPair[]) {
      let hits = 0; let plumbing = true;
      for (const j of heldOutSc) {
        captures.length = 0;
        const { object } = await generateScope({ routing: directRouting, systemPrompt: "SYS-SC", job: j, temperature: 0.3, fewShot });
        const expected = buildScopeUserPrompt(j);
        plumbing = plumbing && inspectPlumbing(captures[captures.length - 1], fewShot.length, expected, SCOPE_MARKER);
        if (object.steps.some((s) => s.instruction.includes(SCOPE_MARKER))) hits += 1;
      }
      return { score: hits / heldOutSc.length, plumbing };
    }
    const scBase = await runScArm([]);
    const scFew = await runScArm(scSel);

    console.log("\n[P] PLUMBING — mined few-shot block reaches the model");
    check("P1: rewriter baseline — unchanged single-shot prompt (no example turns)", rwBase.plumbing);
    check("P2: rewriter few-shot — 4 example turns precede the held-out user turn + carry the marker", rwFew.plumbing);
    check("P3: scope baseline — unchanged single-shot prompt (no example turns)", scBase.plumbing);
    check("P4: scope few-shot — 4 example turns precede the held-out user turn + carry the marker", scFew.plumbing);

    console.log("\n[M] MEASURABILITY — deterministic metric over held-out, per arm");
    console.log(`  rewriter metric (marker-present rate over held-out): baseline=${rwBase.score.toFixed(2)} few-shot=${rwFew.score.toFixed(2)}`);
    console.log(`  scope    metric (marker-present rate over held-out): baseline=${scBase.score.toFixed(2)} few-shot=${scFew.score.toFixed(2)}`);
    const inUnit = (x: number) => x >= 0 && x <= 1;
    check("M1: rewriter — metric computed per arm + apparatus DISCRIMINATES (few-shot > baseline)",
      inUnit(rwBase.score) && inUnit(rwFew.score) && rwFew.score > rwBase.score, `base=${rwBase.score} few=${rwFew.score}`);
    check("M2: scope — metric computed per arm + apparatus DISCRIMINATES (few-shot > baseline)",
      inUnit(scBase.score) && inUnit(scFew.score) && scFew.score > scBase.score, `base=${scBase.score} few=${scFew.score}`);

    // ════════ STEP 5 — THE HONESTY LOG ════════
    console.log("\n[HONESTY]");
    console.log("  [check-p25] This is a SEEDED-CORPUS MEASURABILITY + PLUMBING proof — NOT a live");
    console.log("  quality-lift claim. The correction corpus AND the responder are SYNTHETIC. The");
    console.log("  metric demonstrates the measurement apparatus DISCRIMINATES on few-shot presence");
    console.log("  (baseline vs few-shot over held-out inputs); it does NOT measure improvement from");
    console.log("  real operator corrections — live data is too thin (1 gold pair platform-wide) to");
    console.log("  support any such claim. The few-shot machinery is what ships; it sharpens as real");
    console.log("  reviews accumulate. No live quality lift is asserted or implied.");

    return finish();
  } finally {
    PROVIDER_REGISTRY.anthropic.buildModel = realBuildModel; // restore — no cross-contamination
    await teardown();
    console.log("[check-p25] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-p25] passed: ${passed}`);
  console.log(`[check-p25] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-p25] PHASE-25 FEEDBACK LEDGER RED ✗ — PHASE BLOCKED");
  } else {
    console.log("[check-p25] PHASE-25 FEEDBACK LEDGER GREEN ✓ (harvest buckets + GOLD-first selector / plumbing: few-shot reaches model, baseline single-shot / measurability: deterministic metric discriminates per arm — SEEDED proof, NOT a live lift)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => { console.error("[check-p25] FAILED:", e); process.exit(1); });
