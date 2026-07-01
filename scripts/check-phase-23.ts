/**
 * scripts/check-phase-23.ts — Phase 23 AUTONOMY-POLICY + GUARDRAIL harness.
 *
 * Proves the governed auto-dispatch path end-to-end against the LIVE resolver, guardrails,
 * and enforcement branch (no softened assertions). The first code path that can cause an
 * autonomous action — this ledger is phase-blocking.
 *
 *   1.  FAIL-SAFE-GATED (explicit tenant policy, no opt-in) → drafted_pending / policy_blocked
 *       (not_enabled, source 'tenant'), DRAFT not SENT, run succeeded.
 *   2.  ENABLED + WITHIN GUARDRAILS → auto_advanced, assignment SENT, disposition auto_executed.
 *   3.  KILL-SWITCH reverts an enabled tenant to gated → drafted_pending, source kill_switch, NOT sent.
 *   4a. GUARDRAIL non-overridability (spend) → enabled, spend cap < NTE → drafted_pending (spend_ceiling).
 *   4b. GUARDRAIL non-overridability (token) → enabled, token cap < usage → drafted_pending (token_ceiling).
 *   5.  NULL-NTE BLOCK → enabled, unmeasurable candidate → drafted_pending (unmeasurable_nte), NOT sent.
 *   6.  IDEMPOTENT AUTO-ADVANCE → 2nd call already_active (one assignment); double sendDispatch → 2nd throws.
 *   7.  ELIGIBILITY FLOOR → picked vendor == matcher floor top candidate (gate over the floor set only).
 *   8.  CROSS-TENANT ISOLATION → A's policy/kill/caps never affect B's resolve or meter.
 *   9.  NULL-ACTOR JOB-ADVANCE ARM → auto_advanced from NEW advances job→DISPATCHED with NULL actor.
 *   10. DEFAULT-SOURCE GATE → tenant with NO agent_policies row resolves via the platform default → gated.
 *   11. CUMULATIVE-SPEND → a WORK_COMPLETE autonomous commit STILL counts; DECLINED/CANCELLED do not.
 *
 * SANDBOX ONLY. Self-builds a candidate fixture (seed jobs yield no matcher candidates) and
 * tears down by TRACKED id under FK_CHECKS=0 (deleting a parent does NOT cascade with checks
 * off). Mirrors scripts/check-phase-22.ts. Run: pnpm run db:check:autonomy
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-p23] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-p23] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-p23] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const SEED_TENANT_SLUG = "phase9-seed-tenant";
const T_B_SLUG = "phase23-harness-tenant-b";
const AGENT = "dispatch_router_v1";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, jobs, jobStatusHistory, jobEvents,
    vendors, trades, vendorTradeCoverage, vendorServiceAreas, jobStatuses,
    jobVendorAssignments, jobVendorAssignmentStatusHistory, dispatchAssignmentStatuses,
    auditLogs, users, agentRuns, agentDecisions, agentPolicies, tenantAutonomySettings,
  } = await import("@/server/schema");
  const { eq, and, inArray, count, sql } = await import("drizzle-orm");
  const { createJob } = await import("@/server/jobs");
  const { findCandidateVendorsForJob } = await import("@/server/vendor-matching");
  const { autoDispatchDraftForJob } = await import("@/server/auto-dispatch");
  const { sendDispatch } = await import("@/server/dispatch");
  const { resolveAgentPolicy } = await import("@/server/agents/config/policies");
  const { withinTokenCeilings, withinSpendCeilings, tenantCommittedAllTime } =
    await import("@/server/agents/config/guardrails");

  let tBId: string | null = null;
  const createdClientIds: string[] = [];
  const createdLocationIds: string[] = [];
  const createdVendorIds: string[] = [];
  const createdJobIds: string[] = [];
  const extraRunIds: string[] = [];
  let tAId = "";

  async function teardown() {
    try {
      await db.transaction(async (tx) => {
        if (createdJobIds.length) {
          const aRows = await tx.select({ id: jobVendorAssignments.id }).from(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, createdJobIds));
          const aIds = aRows.map((r) => r.id);
          const runRows = await tx.select({ id: agentRuns.id }).from(agentRuns).where(and(eq(agentRuns.agentId, AGENT), inArray(agentRuns.jobId, createdJobIds)));
          const runIds = [...runRows.map((r) => r.id), ...extraRunIds];
          if (runIds.length) {
            await tx.delete(agentDecisions).where(inArray(agentDecisions.agentRunId, runIds));
            await tx.delete(agentRuns).where(inArray(agentRuns.id, runIds));
          }
          if (aIds.length) {
            await tx.delete(jobVendorAssignmentStatusHistory).where(inArray(jobVendorAssignmentStatusHistory.assignmentId, aIds));
            await tx.delete(auditLogs).where(inArray(auditLogs.targetId, aIds));
            await tx.delete(jobVendorAssignments).where(inArray(jobVendorAssignments.id, aIds));
          }
          await tx.delete(auditLogs).where(inArray(auditLogs.targetId, createdJobIds)); // job.dispatched
          await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, createdJobIds));
          await tx.delete(jobEvents).where(inArray(jobEvents.jobId, createdJobIds));
          await tx.delete(jobs).where(inArray(jobs.id, createdJobIds));
        }
        if (createdVendorIds.length) {
          await tx.delete(vendorTradeCoverage).where(inArray(vendorTradeCoverage.vendorId, createdVendorIds));
          await tx.delete(vendorServiceAreas).where(inArray(vendorServiceAreas.vendorId, createdVendorIds));
          await tx.delete(vendors).where(inArray(vendors.id, createdVendorIds));
        }
        if (createdLocationIds.length) await tx.delete(clientLocations).where(inArray(clientLocations.id, createdLocationIds));
        if (createdClientIds.length) await tx.delete(clients).where(inArray(clients.id, createdClientIds));
        if (tAId) {
          await tx.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tAId), eq(agentPolicies.agentId, AGENT)));
          await tx.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tAId));
        }
        if (tBId) await tx.delete(tenants).where(eq(tenants.id, tBId));
      });
    } catch (e) { console.error("[check-p23] teardown warning:", e); }
  }

  // pre-clean a leftover T-B
  {
    const priorTB = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, T_B_SLUG)).limit(1);
    if (priorTB[0]) { tBId = priorTB[0].id; }
  }

  try {
    const [tA] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SEED_TENANT_SLUG));
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [hvac] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HVAC"));
    check("setup: T-A + operator + HVAC exist", !!tA && !!operator && !!hvac);
    if (!tA || !operator || !hvac) return finish();
    tAId = tA.id;
    // pre-clean any leftover policy/settings on T-A from a prior partial run
    await db.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tAId), eq(agentPolicies.agentId, AGENT)));
    await db.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tAId));

    const sId = async (code: string) => (await db.select({ id: dispatchAssignmentStatuses.id }).from(dispatchAssignmentStatuses).where(eq(dispatchAssignmentStatuses.code, code)))[0]?.id;
    const jId = async (code: string) => (await db.select({ id: jobStatuses.id }).from(jobStatuses).where(eq(jobStatuses.code, code)))[0]?.id;
    const SENT = await sId("SENT"), WORK_COMPLETE = await sId("WORK_COMPLETE"), DECLINED = await sId("DECLINED"), CANCELLED = await sId("CANCELLED");
    const NEW = await jId("NEW"), IN_PROGRESS = await jId("IN_PROGRESS");

    // ---- shared fixture: client/location + one HVAC/NY vendor (the candidate) ----
    const clientA = uuidv7();
    await db.insert(clients).values({ id: clientA, tenantId: tAId, name: "P23 Client A" });
    createdClientIds.push(clientA);
    const locA = uuidv7();
    await db.insert(clientLocations).values({ id: locA, tenantId: tAId, clientId: clientA, name: "P23 Loc A", addressLine1: "1 Test Way", city: "Metropolis", stateProvince: "NY", postalCode: "10001" });
    createdLocationIds.push(locA);
    const V = uuidv7();
    await db.insert(vendors).values({ id: V, tenantId: tAId, name: "P23 Candidate Vendor" });
    createdVendorIds.push(V);
    await db.insert(vendorTradeCoverage).values({ id: uuidv7(), tenantId: tAId, vendorId: V, tradeId: hvac.id, vendorLocationId: null, isPrimary: true, status: "active" });
    await db.insert(vendorServiceAreas).values({ id: uuidv7(), tenantId: tAId, vendorId: V, vendorLocationId: null, areaType: "state", stateCode: "NY", status: "active" });

    // helpers
    async function makeJob(nte: string | null, statusId?: string): Promise<string> {
      const j = await createJob({ tenantId: tAId, clientId: clientA, clientLocationId: locA, primaryTradeId: hvac.id, problemDescription: "P23 HVAC job", createdByUserId: operator.id });
      createdJobIds.push(j.id);
      const set: Record<string, unknown> = { notToExceedAmount: nte };
      if (statusId) set.currentStatusId = statusId;
      await db.update(jobs).set(set).where(eq(jobs.id, j.id));
      return j.id;
    }
    async function setPolicy(policy: Record<string, unknown> | null) {
      await db.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tAId), eq(agentPolicies.agentId, AGENT)));
      if (policy) await db.insert(agentPolicies).values({ tenantId: tAId, clientId: null, agentId: AGENT, policy, status: "active" });
    }
    async function setSettings(s: { killSwitch?: boolean; maxCommittedPerJob?: string | null; maxLlmTokensPerDay?: number | null } | null) {
      await db.delete(tenantAutonomySettings).where(eq(tenantAutonomySettings.tenantId, tAId));
      if (s) await db.insert(tenantAutonomySettings).values({ tenantId: tAId, killSwitch: s.killSwitch ?? false, maxCommittedPerJob: s.maxCommittedPerJob ?? null, maxLlmTokensPerDay: s.maxLlmTokensPerDay ?? null });
    }
    async function lastDecision(jobId: string) {
      const r = await db.select({ disposition: agentDecisions.disposition, metadata: agentDecisions.metadata, runStatus: agentRuns.status })
        .from(agentDecisions).innerJoin(agentRuns, eq(agentDecisions.agentRunId, agentRuns.id))
        .where(and(eq(agentRuns.tenantId, tAId), eq(agentRuns.agentId, AGENT), eq(agentRuns.jobId, jobId)))
        .orderBy(sql`${agentDecisions.createdAt} DESC`).limit(1);
      const d = r[0];
      const meta = (typeof d?.metadata === "string" ? JSON.parse(d.metadata) : (d?.metadata ?? {})) as { source?: string };
      return { disposition: d?.disposition, runStatus: d?.runStatus, source: meta.source };
    }
    async function statusOf(assignmentId: string) {
      return (await db.select({ code: dispatchAssignmentStatuses.code, sentAt: jobVendorAssignments.sentAt })
        .from(jobVendorAssignments).innerJoin(dispatchAssignmentStatuses, eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id))
        .where(eq(jobVendorAssignments.id, assignmentId)))[0];
    }

    // ════════ 1. FAIL-SAFE-GATED (explicit tenant policy, no opt-in) ════════
    console.log("\n[1] FAIL-SAFE-GATED (explicit tenant policy)");
    await setPolicy({ requiresReview: true }); await setSettings(null);
    const j1 = await makeJob("1000.00", IN_PROGRESS);
    const r1 = await autoDispatchDraftForJob(tAId, j1);
    const d1 = await lastDecision(j1);
    const s1 = r1.outcome === "drafted_pending" ? await statusOf(r1.assignmentId) : undefined;
    check("1a: outcome drafted_pending, blockedBy not_enabled", r1.outcome === "drafted_pending" && (r1 as { blockedBy: string }).blockedBy === "not_enabled", JSON.stringify(r1));
    check("1b: DRAFT not SENT", s1?.code === "DRAFT" && s1?.sentAt === null);
    check("1c: disposition policy_blocked, source tenant, run succeeded", d1.disposition === "policy_blocked" && d1.source === "tenant" && d1.runStatus === "succeeded", JSON.stringify(d1));
    // [7] ELIGIBILITY FLOOR — reuse j1's run
    const cands1 = await findCandidateVendorsForJob(tAId, j1);
    check("7: picked vendor == matcher floor top candidate", r1.outcome === "drafted_pending" && cands1[0]?.vendorId === r1.vendorId, `${cands1[0]?.vendorId}`);

    // ════════ 2. ENABLED + WITHIN → AUTO_ADVANCED ════════
    console.log("\n[2] ENABLED + WITHIN → auto_advanced");
    await setPolicy({ autonomyEnabled: true, requiresReview: false }); await setSettings(null);
    const j2 = await makeJob("1000.00", IN_PROGRESS); // IN_PROGRESS → dispatchable, no job advance
    const r2 = await autoDispatchDraftForJob(tAId, j2);
    const d2 = await lastDecision(j2);
    const s2 = r2.outcome === "auto_advanced" ? await statusOf(r2.assignmentId) : undefined;
    check("2a: outcome auto_advanced", r2.outcome === "auto_advanced", JSON.stringify(r2));
    check("2b: assignment SENT (sent_at set)", s2?.code === "SENT" && s2?.sentAt !== null);
    check("2c: disposition auto_executed", d2.disposition === "auto_executed", JSON.stringify(d2));

    // ════════ 3. KILL-SWITCH reverts to gated ════════
    console.log("\n[3] KILL-SWITCH overrides an enabled tenant");
    await setPolicy({ autonomyEnabled: true, requiresReview: false }); await setSettings({ killSwitch: true });
    const j3 = await makeJob("1000.00", IN_PROGRESS);
    const r3 = await autoDispatchDraftForJob(tAId, j3);
    const d3 = await lastDecision(j3);
    const s3 = r3.outcome === "drafted_pending" ? await statusOf(r3.assignmentId) : undefined;
    check("3a: drafted_pending, blockedBy kill_switch", r3.outcome === "drafted_pending" && (r3 as { blockedBy: string }).blockedBy === "kill_switch", JSON.stringify(r3));
    check("3b: NOT sent (DRAFT)", s3?.code === "DRAFT" && s3?.sentAt === null);
    check("3c: decision source kill_switch", d3.source === "kill_switch", JSON.stringify(d3));

    // ════════ 4a. GUARDRAIL spend non-overridability ════════
    console.log("\n[4a] GUARDRAIL — spend cap < NTE blocks an enabled tenant");
    await setPolicy({ autonomyEnabled: true, requiresReview: false }); await setSettings({ maxCommittedPerJob: "500.00" });
    const j4 = await makeJob("1000.00", IN_PROGRESS);
    const r4 = await autoDispatchDraftForJob(tAId, j4);
    const s4 = r4.outcome === "drafted_pending" ? await statusOf(r4.assignmentId) : undefined;
    check("4a-i: drafted_pending, blockedBy spend_ceiling", r4.outcome === "drafted_pending" && (r4 as { blockedBy: string }).blockedBy === "spend_ceiling", JSON.stringify(r4));
    check("4a-ii: NOT sent (DRAFT)", s4?.code === "DRAFT" && s4?.sentAt === null);

    // ════════ 4b. GUARDRAIL token non-overridability ════════
    console.log("\n[4b] GUARDRAIL — token cap < usage blocks an enabled tenant");
    const tokRun = uuidv7();
    await db.insert(agentRuns).values({ id: tokRun, tenantId: tAId, agentId: "update_rewriter_v1", status: "succeeded", startedAt: new Date(), inputTokens: 1000, outputTokens: 0 });
    extraRunIds.push(tokRun);
    await setPolicy({ autonomyEnabled: true, requiresReview: false }); await setSettings({ maxLlmTokensPerDay: 500 }); // 500 < 1000 used
    const j4b = await makeJob("1000.00", IN_PROGRESS);
    const r4b = await autoDispatchDraftForJob(tAId, j4b);
    const s4b = r4b.outcome === "drafted_pending" ? await statusOf(r4b.assignmentId) : undefined;
    check("4b-i: drafted_pending, blockedBy token_ceiling", r4b.outcome === "drafted_pending" && (r4b as { blockedBy: string }).blockedBy === "token_ceiling", JSON.stringify(r4b));
    check("4b-ii: NOT sent (DRAFT)", s4b?.code === "DRAFT" && s4b?.sentAt === null);

    // ════════ 5. NULL-NTE BLOCK ════════
    console.log("\n[5] NULL-NTE block");
    await setPolicy({ autonomyEnabled: true, requiresReview: false }); await setSettings(null);
    const j5 = await makeJob(null, IN_PROGRESS); // no NTE → unmeasurable
    const r5 = await autoDispatchDraftForJob(tAId, j5);
    const s5 = r5.outcome === "drafted_pending" ? await statusOf(r5.assignmentId) : undefined;
    check("5a: drafted_pending, blockedBy unmeasurable_nte", r5.outcome === "drafted_pending" && (r5 as { blockedBy: string }).blockedBy === "unmeasurable_nte", JSON.stringify(r5));
    check("5b: NOT sent (DRAFT)", s5?.code === "DRAFT" && s5?.sentAt === null);

    // ════════ 6. IDEMPOTENT AUTO-ADVANCE ════════
    console.log("\n[6] IDEMPOTENCY");
    await setPolicy({ requiresReview: true }); await setSettings(null); // gated → DRAFT persists
    const j6 = await makeJob("1000.00", IN_PROGRESS);
    const r6a = await autoDispatchDraftForJob(tAId, j6);
    const r6b = await autoDispatchDraftForJob(tAId, j6);
    check("6a: 2nd call → already_active", r6b.outcome === "already_active", `${r6a.outcome}/${r6b.outcome}`);
    const cnt6 = await db.select({ n: count() }).from(jobVendorAssignments).where(eq(jobVendorAssignments.jobId, j6));
    check("6b: exactly ONE assignment", Number(cnt6[0]?.n) === 1);
    const aid6 = r6a.outcome === "drafted_pending" ? r6a.assignmentId : "";
    await sendDispatch({ tenantId: tAId, assignmentId: aid6, actorUserId: null });
    let threw = "";
    try { await sendDispatch({ tenantId: tAId, assignmentId: aid6, actorUserId: null }); } catch (e) { threw = (e as Error).message; }
    check("6c: double sendDispatch → 2nd throws ASSIGNMENT_NOT_DRAFT", threw === "ASSIGNMENT_NOT_DRAFT", threw);

    // ════════ 8. CROSS-TENANT ISOLATION ════════
    console.log("\n[8] CROSS-TENANT isolation");
    tBId = uuidv7();
    await db.insert(tenants).values({ id: tBId, slug: T_B_SLUG, name: "P23 Harness Tenant B" });
    await setPolicy({ autonomyEnabled: true, requiresReview: false }); await setSettings({ killSwitch: true, maxCommittedPerJob: "1.00", maxLlmTokensPerDay: 1 });
    const resA = await resolveAgentPolicy(tAId, AGENT, null);
    const resB = await resolveAgentPolicy(tBId, AGENT, null);
    const tokB = await withinTokenCeilings(tBId);
    check("8a: A reflects its settings (kill_switch source)", resA.source === "kill_switch");
    check("8b: B unaffected by A's policy (autonomyEnabled false, source default)", resB.autonomyEnabled === false && resB.source === "default", JSON.stringify(resB));
    check("8c: B unaffected by A's kill/caps (token ok, no settings row)", tokB.ok === true);

    // ════════ 9. NULL-ACTOR JOB-ADVANCE ARM ════════
    console.log("\n[9] NULL-ACTOR job-advance arm (NEW → DISPATCHED)");
    await setPolicy({ autonomyEnabled: true, requiresReview: false }); await setSettings(null);
    const j9 = await makeJob("1000.00", NEW); // NEW → sendDispatch advances job
    const r9 = await autoDispatchDraftForJob(tAId, j9);
    check("9a: auto_advanced with jobStatusAdvanced=true", r9.outcome === "auto_advanced" && r9.jobStatusAdvanced === true, JSON.stringify(r9));
    const dispatchedJobStatus = (await db.select({ code: jobStatuses.code }).from(jobs).innerJoin(jobStatuses, eq(jobs.currentStatusId, jobStatuses.id)).where(eq(jobs.id, j9)))[0];
    check("9b: job advanced to DISPATCHED", dispatchedJobStatus?.code === "DISPATCHED");
    const advRow = (await db.select({ changedBy: jobStatusHistory.changedByUserId, toId: jobStatusHistory.toStatusId })
      .from(jobStatusHistory).where(eq(jobStatusHistory.jobId, j9)).orderBy(sql`${jobStatusHistory.createdAt} DESC`).limit(1))[0];
    check("9c: job-advance history row written with NULL system actor", advRow?.changedBy === null, JSON.stringify(advRow));

    // ════════ 10. DEFAULT-SOURCE GATE (no tenant policy row) ════════
    console.log("\n[10] DEFAULT-SOURCE gate (no agent_policies row → platform default)");
    await setPolicy(null); await setSettings(null); // NO tenant policy → resolves via default
    const j10 = await makeJob("1000.00", IN_PROGRESS);
    const r10 = await autoDispatchDraftForJob(tAId, j10);
    const d10 = await lastDecision(j10);
    const s10 = r10.outcome === "drafted_pending" ? await statusOf(r10.assignmentId) : undefined;
    check("10a: drafted_pending, blockedBy not_enabled", r10.outcome === "drafted_pending" && (r10 as { blockedBy: string }).blockedBy === "not_enabled", JSON.stringify(r10));
    check("10b: decision source 'default' (platform default gates)", d10.source === "default", JSON.stringify(d10));
    check("10c: NOT sent (DRAFT)", s10?.code === "DRAFT" && s10?.sentAt === null);

    // ════════ 11. CUMULATIVE-SPEND (WORK_COMPLETE counts; DECLINED/CANCELLED don't) ════════
    console.log("\n[11] CUMULATIVE-SPEND meter");
    const baseAll = await tenantCommittedAllTime(tAId);
    const mkCommit = async (nte: string, statusId: string) => {
      const j = await makeJob(nte, IN_PROGRESS);
      await db.insert(jobVendorAssignments).values({
        tenantId: tAId, jobId: j, vendorId: V, currentStatusId: statusId, matchedTradeId: hvac.id,
        matchedTradeWasPrimary: true, tightestGeoAtDispatch: "state", matchedGeoTypesAtDispatch: ["state"],
        complianceStatusAtDispatch: "ok", sentAt: new Date(), createdByUserId: null,
      });
      return j;
    };
    await mkCommit("1000.00", WORK_COMPLETE); // counts
    await mkCommit("500.00", DECLINED);        // excluded
    await mkCommit("700.00", CANCELLED);       // excluded
    const afterAll = await tenantCommittedAllTime(tAId);
    const { default: Big } = await import("big.js");
    const delta = new Big(afterAll.committed).minus(baseAll.committed).toFixed(2);
    check("11a: committed delta = 1000.00 (only WORK_COMPLETE counts; DECLINED/CANCELLED excluded)", delta === "1000.00", `Δ=${delta}`);

    return finish();
  } finally {
    await teardown();
    console.log("[check-p23] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-p23] passed: ${passed}`);
  console.log(`[check-p23] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-p23] PHASE-23 AUTONOMY LEDGER RED ✗ — PHASE BLOCKED");
  } else {
    console.log("[check-p23] PHASE-23 AUTONOMY LEDGER GREEN ✓ (gated-default / enabled-auto-advance / kill-switch / spend+token guardrails / null-NTE / idempotency / eligibility-floor / cross-tenant / null-actor job-advance / default-source / cumulative-spend)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => { console.error("[check-p23] FAILED:", e); process.exit(1); });
