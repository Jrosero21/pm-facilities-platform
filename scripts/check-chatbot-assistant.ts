/**
 * scripts/check-chatbot-assistant.ts — Phase 16 CHATBOT ASSISTANT harness.
 *
 * Empirically proves chatbot_assistant_v1: knowledge retrieval + the docs/ path guard (A),
 * job summary over existing readers (B), draft generation landing pending_review and NOT
 * auto-sent — the §2.5 gate (C), agent_* logging completeness with correct read/write kinds
 * (D), cross-tenant isolation / the poison core (E), and the write-boundary scope thesis —
 * reads + draft-only writes, nothing else, nothing published (F). SANDBOX ONLY (module-top
 * env swap + hard-exit if not _sandbox). Self-seeds a tenant-B (with a real job + vendor) for
 * the poison; tears down everything it created + all chatbot_assistant_v1 run artifacts.
 * Mirrors scripts/check-snow-dispatch.ts. Run: pnpm run db:check:chatbot-assistant
 */

// Module marker (WP-13.2): file-scope top-level names — `export {}` makes this a MODULE so
// whole-project tsc doesn't collide them.
export {};

// -------- Sandbox guard + env swap (BEFORE any DB-touching import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-chatbot] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[check-chatbot] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-chatbot] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

// -------- Tiny assertion framework (mirror check-snow) --------
let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed.push(label);
    console.error(`  ✗ ${label}`);
  }
}

const SEED_TENANT_SLUG = "phase9-seed-tenant";
const T_B_SLUG = "phase16-harness-tenant-b";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, jobs, vendors, users,
    jobStatusHistory, jobEvents, auditLogs,
    updateRewriteDrafts, updateRewriteReviews, clientUpdateLogs, communicationLogs,
    jobNotes, vendorPerformanceScores,
    agentRuns, agentToolCalls, agentDecisions,
  } = await import("@/server/schema");
  const { eq, inArray, count, sql } = await import("drizzle-orm");
  const { createJob } = await import("@/server/jobs");
  const { runChatbotAssistant } = await import("@/server/agents/chatbot-assistant");
  const { listProductionAgents } = await import("@/server/agents/registry");
  const { resolveDocPath } = await import("@/server/agents/chatbot-assistant/doc-access");
  const ops = await import("@/server/agents/chatbot-assistant/operational-tools");
  const drafts = await import("@/server/agents/chatbot-assistant/draft-tools");

  let tBId: string | null = null;

  // Delete every chatbot_assistant_v1 run + its dependent rows (drafts / tool_calls /
  // decisions). Sandbox-only — chatbot runs are harness/probe artifacts, never production.
  async function purgeChatbotArtifacts() {
    const runRows = await db.select({ id: agentRuns.id }).from(agentRuns).where(eq(agentRuns.agentId, "chatbot_assistant_v1"));
    const runIds = runRows.map((r) => r.id);
    if (runIds.length) {
      await db.delete(updateRewriteDrafts).where(inArray(updateRewriteDrafts.agentRunId, runIds));
      await db.delete(agentToolCalls).where(inArray(agentToolCalls.agentRunId, runIds));
      await db.delete(agentDecisions).where(inArray(agentDecisions.agentRunId, runIds));
      await db.delete(agentRuns).where(inArray(agentRuns.id, runIds));
    }
  }

  async function teardown() {
    try {
      await purgeChatbotArtifacts();
      if (tBId) {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
          const tbJobs = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, tBId!));
          const tbJobIds = tbJobs.map((r) => r.id);
          if (tbJobIds.length) {
            await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, tbJobIds));
            await tx.delete(jobEvents).where(inArray(jobEvents.jobId, tbJobIds));
          }
          await tx.delete(auditLogs).where(eq(auditLogs.tenantId, tBId!));
          await tx.execute(sql`DELETE FROM tenant_job_sequences WHERE tenant_id = ${tBId!}`);
          await tx.delete(jobs).where(eq(jobs.tenantId, tBId!));
          await tx.delete(vendors).where(eq(vendors.tenantId, tBId!));
          await tx.delete(clientLocations).where(eq(clientLocations.tenantId, tBId!));
          await tx.delete(clients).where(eq(clients.tenantId, tBId!));
          await tx.delete(tenants).where(eq(tenants.id, tBId!));
          await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
        });
      }
    } catch (e) {
      console.error("[check-chatbot] teardown warning:", e);
    }
  }

  // Defensive pre-clean: drop leftovers from a prior aborted run.
  {
    await purgeChatbotArtifacts();
    const priorTB = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, T_B_SLUG)).limit(1);
    if (priorTB[0]) { tBId = priorTB[0].id; await teardown(); tBId = null; }
  }

  try {
    console.log("\n[setup] resolve T-A (seeded Acme) + operator; build T-B (tenant+client+location+job+vendor)");
    const [tA] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SEED_TENANT_SLUG));
    check("setup: seeded tenant (T-A) exists", !!tA);
    if (!tA) return finish();
    const tAId = tA.id;

    const jA = (await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, tAId)).limit(1))[0];
    const vA = (await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.tenantId, tAId)).limit(1))[0];
    check("setup: T-A has a job + a vendor", !!jA && !!vA);
    if (!jA || !vA) return finish();
    const jobA = jA.id;
    const vendorA = vA.id;

    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    check("setup: seeded operator user", !!operator);
    if (!operator) return finish();

    // --- build T-B with a REAL job + vendor (so the poison uses real foreign ids) ---
    tBId = uuidv7();
    await db.insert(tenants).values({ id: tBId, name: "Phase16 Harness Tenant B", slug: T_B_SLUG, type: "aggregator", status: "active" });
    const tbClientId = uuidv7();
    await db.insert(clients).values({ id: tbClientId, tenantId: tBId, name: "Harness Client B" });
    const tbLocId = uuidv7();
    await db.insert(clientLocations).values({
      id: tbLocId, tenantId: tBId, clientId: tbClientId, name: "B Store",
      addressLine1: "1 B Rd", city: "Btown", stateProvince: "NY", postalCode: "10001",
    });
    const tbVendorId = uuidv7();
    await db.insert(vendors).values({ id: tbVendorId, tenantId: tBId, name: "Harness Vendor B" });
    const tbJob = await createJob({
      tenantId: tBId, clientId: tbClientId, clientLocationId: tbLocId,
      problemDescription: "Tenant-B private job — must never surface to T-A.",
      createdByUserId: operator.id,
    });
    const tbJobId = tbJob.id;
    check("setup: T-B job + vendor created", !!tbJobId && !!tbVendorId);

    // ════════ A. KNOWLEDGE RETRIEVAL + PATH GUARD (F16-A) ════════
    console.log("\n[A] knowledge retrieval + docs/ path guard");
    check("A0: chatbot_assistant_v1 is a production agent", listProductionAgents().some((a) => a.id === "chatbot_assistant_v1"));
    // exercised through a logged run below (B/C/D/F); here prove guard negatives directly.
    const guardThrows = (p: string): boolean => { try { resolveDocPath(p); return false; } catch { return true; } };
    check("A-guard: '../.env' throws DOC_PATH_FORBIDDEN", guardThrows("../.env"));
    check("A-guard: '/etc/passwd' (absolute) throws", guardThrows("/etc/passwd"));
    check("A-guard: non-.md ('phase-0-foundation/x.txt') throws", guardThrows("phase-0-foundation/x.txt"));
    check("A-guard: '..'-escape ('a/../../package.json') throws", guardThrows("a/../../package.json"));

    // ════════ FULL RUN — powers B / C / D / F (8 reads + 2 writes) ════════
    console.log("\n[full run] one logged run exercising all 10 tools");
    // Snapshot ALL plausibly-affected T-A tables BEFORE the run (group F baseline). Each
    // count is scoped to T-A via that table's own tenant_id column (job_status_history is
    // counted globally — it carries no tenant_id; nothing should write it either way).
    const snapshot = async () => ({
      jobs: Number((await db.select({ c: count() }).from(jobs).where(eq(jobs.tenantId, tAId)))[0]?.c ?? 0),
      jobNotes: Number((await db.select({ c: count() }).from(jobNotes).where(eq(jobNotes.tenantId, tAId)))[0]?.c ?? 0),
      clientUpdates: Number((await db.select({ c: count() }).from(clientUpdateLogs).where(eq(clientUpdateLogs.tenantId, tAId)))[0]?.c ?? 0),
      comms: Number((await db.select({ c: count() }).from(communicationLogs).where(eq(communicationLogs.tenantId, tAId)))[0]?.c ?? 0),
      reviews: Number((await db.select({ c: count() }).from(updateRewriteReviews).where(eq(updateRewriteReviews.tenantId, tAId)))[0]?.c ?? 0),
      vendorPerf: Number((await db.select({ c: count() }).from(vendorPerformanceScores).where(eq(vendorPerformanceScores.tenantId, tAId)))[0]?.c ?? 0),
      statusHistory: Number((await db.select({ c: count() }).from(jobStatusHistory))[0]?.c ?? 0),
      audit: Number((await db.select({ c: count() }).from(auditLogs).where(eq(auditLogs.tenantId, tAId)))[0]?.c ?? 0),
      drafts: Number((await db.select({ c: count() }).from(updateRewriteDrafts).where(eq(updateRewriteDrafts.tenantId, tAId)))[0]?.c ?? 0),
    });
    const before = await snapshot();

    let bSummary: Awaited<ReturnType<ReturnType<typeof ops.summarizeJobTool>["run"]>> | null = null;
    let searchHadPath = false;
    let docHadContent = false;
    let clientDraftFound: boolean = false;
    let vendorDraftFound: boolean = false;
    const { runId } = await runChatbotAssistant({
      tenantId: tAId,
      inputSummary: "check-chatbot full run",
      work: async (t) => {
        const s = await t.searchKnowledge({ query: "dispatch" });
        searchHadPath = s.matchCount >= 1 && !!s.matches[0]?.sourcePath?.endsWith("07-chatbot-knowledge.md");
        const d = await t.readDoc({ path: "phase-9-aggregator-dashboard-analytics/07-chatbot-knowledge.md" });
        docHadContent = d.content.length > 0;
        bSummary = await t.summarizeJob({ jobId: jobA });
        await t.identifyStalledJobs({});
        await t.identifySlaRisks({});
        await t.flagInvoiceAnomalies({ jobId: jobA });
        await t.summarizeVendorPerformance({ vendorId: vendorA });
        await t.recommendNextAction({ jobId: jobA });
        clientDraftFound = (await t.draftClientUpdate({ jobId: jobA })).found;
        vendorDraftFound = (await t.draftVendorFollowUp({ jobId: jobA })).found;
        return "full run";
      },
    });
    const after = await snapshot();

    // A (positives, via the run)
    check("A1: searchKnowledge(known term) → >=1 result with a source-doc path (citation)", searchHadPath);
    check("A2: readDoc(real knowledge doc) → content returned", docHadContent);

    // B
    check("B1: summarizeJob(real T-A job) → populated summary",
      !!bSummary && (bSummary as { found: boolean }).found === true && typeof (bSummary as { statusName: string }).statusName === "string");

    // C — draft rows for this run
    const draftRows = await db.select().from(updateRewriteDrafts).where(eq(updateRewriteDrafts.agentRunId, runId));
    const cd = draftRows.find((r) => r.sourceType === "job_note");
    const vd = draftRows.find((r) => r.sourceType === "vendor_update");
    check("C1: draftClientUpdate → job_note draft, pending_review, run-attributed, content non-empty",
      !!cd && cd.status === "pending_review" && cd.tenantId === tAId && cd.jobId === jobA && cd.draftContent.length > 0 && clientDraftFound);
    check("C2: draftVendorFollowUp → vendor_update draft, pending_review",
      !!vd && vd.status === "pending_review" && vendorDraftFound);
    check("C3-GATE: zero update_rewrite_reviews created (review is human, separate)", after.reviews === before.reviews);
    check("C4-GATE: zero client_update_logs created (nothing published)", after.clientUpdates === before.clientUpdates);
    check("C5-GATE: zero communication_logs created (nothing sent)", after.comms === before.comms);
    check("C6-GATE: both drafts STILL pending_review (agent cannot advance)", draftRows.every((r) => r.status === "pending_review"));

    // D — agent_* logging
    const [runRow] = await db.select({ agentId: agentRuns.agentId, status: agentRuns.status }).from(agentRuns).where(eq(agentRuns.id, runId));
    check("D1: agent_runs row written (chatbot_assistant_v1, terminal 'succeeded')", runRow?.agentId === "chatbot_assistant_v1" && runRow?.status === "succeeded");
    const calls = await db.select({ name: agentToolCalls.toolName, kind: agentToolCalls.toolKind, status: agentToolCalls.status }).from(agentToolCalls).where(eq(agentToolCalls.agentRunId, runId));
    const writes = calls.filter((c) => c.kind === "write").map((c) => c.name).sort();
    const reads = calls.filter((c) => c.kind === "read");
    check("D2: 2 write tool calls = draftClientUpdate + draftVendorFollowUp",
      writes.length === 2 && writes[0] === "draftClientUpdate" && writes[1] === "draftVendorFollowUp");
    check("D3: 8 read tool calls", reads.length === 8);
    check("D4: all tool calls status='ok' (happy path)", calls.length === 10 && calls.every((c) => c.status === "ok"));

    // ════════ E. CROSS-TENANT ISOLATION (poison core) ════════
    console.log("\n[E] cross-tenant isolation — T-A-bound tools, real T-B ids");
    const pSummary = await ops.summarizeJobTool(tAId).run({ jobId: tbJobId });
    check("E1: summarizeJob(T-A scope, real T-B job) → not found (no T-B data)", pSummary.found === false);
    const pVendor = await ops.summarizeVendorPerformanceTool(tAId).run({ vendorId: tbVendorId });
    check("E2: summarizeVendorPerformance(T-A scope, real T-B vendor) → not found", pVendor.found === false);
    const pRec = await ops.recommendNextActionTool(tAId).run({ jobId: tbJobId });
    check("E3: recommendNextAction(T-A scope, real T-B job) → not found", pRec.found === false);
    const pAnom = await ops.flagInvoiceAnomaliesTool(tAId).run({ jobId: tbJobId });
    check("E4: flagInvoiceAnomalies(T-A scope, real T-B job) → no T-B figures", pAnom.flagged.length === 0);
    const pDraftC = await drafts.draftClientUpdateTool(tAId, runId).run({ jobId: tbJobId });
    const pDraftV = await drafts.draftVendorFollowUpTool(tAId, runId).run({ jobId: tbJobId });
    check("E5: draft tools (T-A scope, real T-B job) → not found, no draft", pDraftC.found === false && pDraftV.found === false);
    const tbDraftCount = Number((await db.select({ c: count() }).from(updateRewriteDrafts).where(eq(updateRewriteDrafts.tenantId, tBId!)))[0]?.c ?? 0);
    check("E6: T-B gained ZERO drafts (poison created nothing for T-B)", tbDraftCount === 0);

    // ════════ F. WRITE-BOUNDARY / SCOPE GUARD (the phase thesis) ════════
    console.log("\n[F] write-boundary — only update_rewrite_drafts grew (+2); everything else unchanged");
    check("F1: jobs unchanged", after.jobs === before.jobs);
    check("F2: job_notes unchanged", after.jobNotes === before.jobNotes);
    check("F3: client_update_logs unchanged (nothing published)", after.clientUpdates === before.clientUpdates);
    check("F4: communication_logs unchanged (nothing sent)", after.comms === before.comms);
    check("F5: update_rewrite_reviews unchanged (no human review fabricated)", after.reviews === before.reviews);
    check("F6: vendor_performance_scores unchanged (read-only / untouched)", after.vendorPerf === before.vendorPerf);
    check("F7: job_status_history unchanged (no operational mutation)", after.statusHistory === before.statusHistory);
    check("F8: audit_logs unchanged (agent writes ride agent_*, not audit_logs)", after.audit === before.audit);
    check("F9: ONLY update_rewrite_drafts grew, by exactly 2 (the 2 draft calls)", after.drafts === before.drafts + 2);

    return finish();
  } finally {
    await teardown();
    console.log("[check-chatbot] teardown complete (T-B + all chatbot_assistant_v1 run artifacts removed)");
  }
}

function finish() {
  console.log("");
  console.log(`[check-chatbot] passed: ${passed}`);
  console.log(`[check-chatbot] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-chatbot] PHASE-BLOCKING LEDGER RED ✗ — PHASE BLOCKED");
  } else {
    console.log("[check-chatbot] PHASE-BLOCKING LEDGER GREEN ✓ (knowledge+guard / job-summary / draft-gate / agent_* logging / cross-tenant poison / write-boundary)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => {
    console.error("[check-chatbot] FAILED:", e);
    process.exit(1);
  });
