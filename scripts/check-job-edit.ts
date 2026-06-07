/**
 * scripts/check-job-edit.ts — v2.11.0 batch 1 JOB-EDIT harness (updateJob writer + helpers).
 *
 * Phase-blocking ACCEPTANCE PROOF for post-create job editing (updateJob / hasActiveAssignment):
 *   GROUP H — HISTORY/EVENT/AUDIT dual-write (priority/trade typed history + events + audit; no-op writes nothing)
 *   GROUP N — NTE 2nd writer (not_to_exceed_amount updated + nte.adjusted billing event + getEffectiveNte reflects it)
 *   GROUP L — LOCATION same-client guard (locA2 ok; locB1 → LOCATION_CLIENT_MISMATCH, column unchanged)
 *   GROUP S — SOURCE-LOCK security boundary (manual desc editable; client-portal desc LOCKED; scope_of_work always editable)
 *   GROUP C — CLEAR-TO-NULL by design (priority/trade → null throw PRIORITY_REQUIRED / TRADE_REQUIRED)
 *   GROUP A — ACTIVE-ASSIGNMENT helper (SENT → true; DRAFT-only → false; none → false)
 *
 * No LLM / no agent mock — updateJob is pure data-layer. SANDBOX ONLY — hard-guarded (forces *_sandbox;
 * exit 2 otherwise). Self-seeds a fresh tenant + fixtures and tears it down BY TRACKED ID under
 * FK_CHECKS=0 (children-first; never by created_at). Mirrors scripts/check-phase-27.ts.
 * Run: pnpm run db:check:job-edit
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-job-edit] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[check-job-edit] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-job-edit] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "job-edit-harness-tenant";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, priorities, vendors, jobs, trades, users,
    jobStatusHistory, jobPriorityHistory, jobTradeHistory, jobEvents, jobBillingEvents, auditLogs,
    jobVendorAssignments, dispatchAssignmentStatuses,
  } = await import("@/server/schema");
  const { and, eq, inArray, sql } = await import("drizzle-orm");
  const { createJob, updateJob, hasActiveAssignment } = await import("@/server/jobs");
  const { getEffectiveNte } = await import("@/server/billing/change-orders");

  // tracked ids (teardown deletes ONLY these)
  const jobIds: string[] = [];
  let tId = "";
  let clientA = "", clientB = "", locA1 = "", locA2 = "", locB1 = "";
  let vendorId = "";
  let prioP1 = "", prioP2 = "";

  async function teardown() {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
        if (jobIds.length) {
          await tx.delete(jobPriorityHistory).where(inArray(jobPriorityHistory.jobId, jobIds));
          await tx.delete(jobTradeHistory).where(inArray(jobTradeHistory.jobId, jobIds));
          await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, jobIds));
          await tx.delete(jobEvents).where(inArray(jobEvents.jobId, jobIds));
          await tx.delete(jobBillingEvents).where(inArray(jobBillingEvents.jobId, jobIds));
          await tx.delete(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, jobIds));
          await tx.delete(jobs).where(inArray(jobs.id, jobIds));
        }
        if (tId) {
          await tx.delete(auditLogs).where(eq(auditLogs.tenantId, tId));
          await tx.delete(clientLocations).where(eq(clientLocations.tenantId, tId));
          await tx.delete(clients).where(eq(clients.tenantId, tId));
          await tx.delete(priorities).where(eq(priorities.tenantId, tId));
          await tx.delete(vendors).where(eq(vendors.tenantId, tId));
          await tx.delete(tenants).where(eq(tenants.id, tId));
        }
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
      });
    } catch (e) { console.error("[check-job-edit] teardown warning:", e); }
  }

  // pre-clean a leftover harness tenant (idempotency)
  {
    const prior = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG)).limit(1);
    if (prior[0]) {
      const pt = prior[0].id;
      const pJobs = (await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, pt))).map((j) => j.id);
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
        if (pJobs.length) {
          await tx.delete(jobPriorityHistory).where(inArray(jobPriorityHistory.jobId, pJobs));
          await tx.delete(jobTradeHistory).where(inArray(jobTradeHistory.jobId, pJobs));
          await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, pJobs));
          await tx.delete(jobEvents).where(inArray(jobEvents.jobId, pJobs));
          await tx.delete(jobBillingEvents).where(inArray(jobBillingEvents.jobId, pJobs));
          await tx.delete(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, pJobs));
          await tx.delete(jobs).where(inArray(jobs.id, pJobs));
        }
        await tx.delete(auditLogs).where(eq(auditLogs.tenantId, pt));
        await tx.delete(clientLocations).where(eq(clientLocations.tenantId, pt));
        await tx.delete(clients).where(eq(clients.tenantId, pt));
        await tx.delete(priorities).where(eq(priorities.tenantId, pt));
        await tx.delete(vendors).where(eq(vendors.tenantId, pt));
        await tx.delete(tenants).where(eq(tenants.id, pt));
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
      });
    }
  }

  // small helpers for assertions
  const expectThrow = async (fn: () => Promise<unknown>, msg: string): Promise<boolean> => {
    try { await fn(); return false; } catch (e) { return (e as Error).message === msg; }
  };
  const eventsFor = async (jobId: string, eventType: string) =>
    (await db.select({ id: jobEvents.id }).from(jobEvents).where(and(eq(jobEvents.jobId, jobId), eq(jobEvents.eventType, eventType)))).length;
  const jobCol = async (jobId: string) =>
    (await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];

  try {
    // ── lookups (global seed rows) ──
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [hvac] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HVAC"));
    const [plumb] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "PLUMB"));
    const [sent] = await db.select({ id: dispatchAssignmentStatuses.id }).from(dispatchAssignmentStatuses).where(eq(dispatchAssignmentStatuses.code, "SENT"));
    const [draft] = await db.select({ id: dispatchAssignmentStatuses.id }).from(dispatchAssignmentStatuses).where(eq(dispatchAssignmentStatuses.code, "DRAFT"));
    check("setup: operator + HVAC + PLUMB + SENT + DRAFT statuses exist", !!operator && !!hvac && !!plumb && !!sent && !!draft);
    if (!operator || !hvac || !plumb || !sent || !draft) return finish();

    // ── tenant + clients/locations/priorities/vendor ──
    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Job-Edit Harness Tenant" });
    clientA = uuidv7(); clientB = uuidv7();
    await db.insert(clients).values([{ id: clientA, tenantId: tId, name: "Client A" }, { id: clientB, tenantId: tId, name: "Client B" }]);
    locA1 = uuidv7(); locA2 = uuidv7(); locB1 = uuidv7();
    await db.insert(clientLocations).values([
      { id: locA1, tenantId: tId, clientId: clientA, name: "A Loc 1", addressLine1: "1 A Way", city: "Metropolis", stateProvince: "NY", postalCode: "10001" },
      { id: locA2, tenantId: tId, clientId: clientA, name: "A Loc 2", addressLine1: "2 A Way", city: "Metropolis", stateProvince: "NY", postalCode: "10001" },
      { id: locB1, tenantId: tId, clientId: clientB, name: "B Loc 1", addressLine1: "1 B Way", city: "Gotham", stateProvince: "NY", postalCode: "10002" },
    ]);
    prioP1 = uuidv7(); prioP2 = uuidv7();
    await db.insert(priorities).values([
      { id: prioP1, tenantId: tId, name: "Harness P1", code: "P1HARNESS", rank: 1 },
      { id: prioP2, tenantId: tId, name: "Harness P2", code: "P2HARNESS", rank: 2 },
    ]);
    vendorId = uuidv7();
    await db.insert(vendors).values({ id: vendorId, tenantId: tId, name: "Harness Vendor" });

    // ── jobs (createJob writes its own status-history/event/audit) ──
    const jobM = (await createJob({ tenantId: tId, clientId: clientA, clientLocationId: locA1, primaryTradeId: hvac.id, priorityId: prioP1, problemDescription: "M: original problem", notToExceedAmount: "1000.00", sourceType: "manual", createdByUserId: operator.id })).id;
    const jobC = (await createJob({ tenantId: tId, clientId: clientA, clientLocationId: locA1, primaryTradeId: hvac.id, priorityId: prioP1, problemDescription: "C: client request", sourceType: "internal_client_portal", createdByUserId: operator.id })).id;
    const jobD = (await createJob({ tenantId: tId, clientId: clientA, clientLocationId: locA1, primaryTradeId: hvac.id, priorityId: prioP1, problemDescription: "D: has SENT assignment", sourceType: "manual", createdByUserId: operator.id })).id;
    const jobDraft = (await createJob({ tenantId: tId, clientId: clientA, clientLocationId: locA1, primaryTradeId: hvac.id, priorityId: prioP1, problemDescription: "Draft: DRAFT assignment only", sourceType: "manual", createdByUserId: operator.id })).id;
    const jobNone = (await createJob({ tenantId: tId, clientId: clientA, clientLocationId: locA1, primaryTradeId: hvac.id, priorityId: prioP1, problemDescription: "None: no assignment", sourceType: "manual", createdByUserId: operator.id })).id;
    jobIds.push(jobM, jobC, jobD, jobDraft, jobNone);

    // assignment seed (SENT on jobD, DRAFT on jobDraft)
    const mkAssignment = async (jobId: string, statusId: string) => {
      await db.insert(jobVendorAssignments).values({
        id: uuidv7(), tenantId: tId, jobId, vendorId, currentStatusId: statusId,
        matchedTradeId: hvac.id, matchedTradeWasPrimary: true,
        tightestGeoAtDispatch: "postal_code", matchedGeoTypesAtDispatch: ["postal_code"],
        complianceStatusAtDispatch: "ok", createdByUserId: operator.id,
      });
    };
    await mkAssignment(jobD, sent.id);
    await mkAssignment(jobDraft, draft.id);

    // ════════ GROUP H — history/event/audit dual-write ════════
    console.log("\n[H] HISTORY/EVENT/AUDIT dual-write");
    await updateJob({ tenantId: tId, jobId: jobM, actorUserId: operator.id, patch: { priorityId: prioP2 } });
    const ph = (await db.select().from(jobPriorityHistory).where(eq(jobPriorityHistory.jobId, jobM)));
    const auditM1 = (await db.select({ m: sql<string>`CAST(${auditLogs.metadata} AS CHAR)` }).from(auditLogs).where(and(eq(auditLogs.targetId, jobM), eq(auditLogs.action, "job.updated"))));
    check("H1: priority edit → job_priority_history {from=P1,to=P2} + job.priority_changed + audit changedFields[priorityId]",
      ph.length === 1 && ph[0].fromPriorityId === prioP1 && ph[0].toPriorityId === prioP2 && ph[0].changedByUserId === operator.id
        && (await eventsFor(jobM, "job.priority_changed")) === 1
        && auditM1.length === 1 && auditM1[0].m.includes("priorityId"),
      JSON.stringify({ ph: ph.length, audit: auditM1.length }));

    await updateJob({ tenantId: tId, jobId: jobM, actorUserId: operator.id, patch: { primaryTradeId: plumb.id } });
    const th = (await db.select().from(jobTradeHistory).where(eq(jobTradeHistory.jobId, jobM)));
    check("H2: trade edit → job_trade_history {from=HVAC,to=PLUMB} + job.trade_changed + audit",
      th.length === 1 && th[0].fromTradeId === hvac.id && th[0].toTradeId === plumb.id
        && (await eventsFor(jobM, "job.trade_changed")) === 1,
      JSON.stringify({ th: th.length }));

    // H3: no-op (patch == current values) → ZERO new rows
    const before = { ev: (await db.select({ id: jobEvents.id }).from(jobEvents).where(eq(jobEvents.jobId, jobM))).length, ph: ph.length, th: th.length, au: auditM1.length + 1 };
    await updateJob({ tenantId: tId, jobId: jobM, actorUserId: operator.id, patch: { priorityId: prioP2, primaryTradeId: plumb.id } });
    const after = {
      ev: (await db.select({ id: jobEvents.id }).from(jobEvents).where(eq(jobEvents.jobId, jobM))).length,
      ph: (await db.select({ id: jobPriorityHistory.id }).from(jobPriorityHistory).where(eq(jobPriorityHistory.jobId, jobM))).length,
      th: (await db.select({ id: jobTradeHistory.id }).from(jobTradeHistory).where(eq(jobTradeHistory.jobId, jobM))).length,
      au: (await db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.targetId, jobM), eq(auditLogs.action, "job.updated")))).length,
    };
    check("H3: no-op edit (patch == current) writes ZERO new history/event/audit rows",
      after.ev === before.ev && after.ph === before.ph && after.th === before.th && after.au === before.au,
      JSON.stringify({ before, after }));

    // ════════ GROUP N — NTE 2nd writer ════════
    console.log("\n[N] NTE 2nd writer (not_to_exceed_amount + nte.adjusted + getEffectiveNte)");
    await updateJob({ tenantId: tId, jobId: jobM, actorUserId: operator.id, patch: { notToExceedAmount: "2500.00" } });
    const nteBe = (await db.select({ et: jobBillingEvents.eventType, amt: jobBillingEvents.amount, m: sql<string>`CAST(${jobBillingEvents.metadata} AS CHAR)` }).from(jobBillingEvents).where(and(eq(jobBillingEvents.jobId, jobM), eq(jobBillingEvents.eventType, "nte.adjusted"))));
    const effNte = await getEffectiveNte(tId, jobM);
    check("N1: NTE edit → column=2500.00 + nte.adjusted{from:1000.00,to:2500.00} + getEffectiveNte=2500.00",
      (await jobCol(jobM)).notToExceedAmount === "2500.00"
        && nteBe.length === 1 && nteBe[0].amt === "2500.00" && nteBe[0].m.includes("1000.00") && nteBe[0].m.includes("2500.00")
        && effNte === "2500.00",
      JSON.stringify({ nteBe: nteBe.length, effNte }));

    // ════════ GROUP L — location same-client guard ════════
    console.log("\n[L] LOCATION same-client guard");
    await updateJob({ tenantId: tId, jobId: jobM, actorUserId: operator.id, patch: { clientLocationId: locA2 } });
    check("L1: location locA1→locA2 (same client A) → succeeds + job.location_changed",
      (await jobCol(jobM)).clientLocationId === locA2 && (await eventsFor(jobM, "job.location_changed")) === 1);
    const threwMismatch = await expectThrow(() => updateJob({ tenantId: tId, jobId: jobM, actorUserId: operator.id, patch: { clientLocationId: locB1 } }), "LOCATION_CLIENT_MISMATCH");
    check("L2: location → locB1 (client B) → throws LOCATION_CLIENT_MISMATCH; column unchanged (still locA2)",
      threwMismatch && (await jobCol(jobM)).clientLocationId === locA2);

    // ════════ GROUP S — source-lock security boundary ════════
    console.log("\n[S] SOURCE-LOCK (the security boundary)");
    await updateJob({ tenantId: tId, jobId: jobM, actorUserId: operator.id, patch: { problemDescription: "M: edited problem" } });
    check("S1: manual job problem_description edit → succeeds + job.scope_updated",
      (await jobCol(jobM)).problemDescription === "M: edited problem" && (await eventsFor(jobM, "job.scope_updated")) === 1);
    const cBefore = (await jobCol(jobC)).problemDescription;
    const threwLocked = await expectThrow(() => updateJob({ tenantId: tId, jobId: jobC, actorUserId: operator.id, patch: { problemDescription: "operator tampering" } }), "PROBLEM_DESCRIPTION_LOCKED");
    check("S2: client-portal job problem_description edit → throws PROBLEM_DESCRIPTION_LOCKED; column unchanged",
      threwLocked && (await jobCol(jobC)).problemDescription === cBefore, `threw=${threwLocked}`);
    await updateJob({ tenantId: tId, jobId: jobC, actorUserId: operator.id, patch: { scopeOfWork: "operator-added scope" } });
    check("S3: client-portal job scope_of_work edit → succeeds (always editable) + job.scope_updated",
      (await jobCol(jobC)).scopeOfWork === "operator-added scope" && (await eventsFor(jobC, "job.scope_updated")) === 1);

    // ════════ GROUP C — clear-to-null by design ════════
    console.log("\n[C] CLEAR-TO-NULL rejected by design");
    const threwPrioReq = await expectThrow(() => updateJob({ tenantId: tId, jobId: jobM, actorUserId: operator.id, patch: { priorityId: null } }), "PRIORITY_REQUIRED");
    const threwTradeReq = await expectThrow(() => updateJob({ tenantId: tId, jobId: jobM, actorUserId: operator.id, patch: { primaryTradeId: null } }), "TRADE_REQUIRED");
    check("C1: priority→null → throws PRIORITY_REQUIRED", threwPrioReq);
    check("C2: trade→null → throws TRADE_REQUIRED", threwTradeReq);

    // ════════ GROUP A — active-assignment helper ════════
    console.log("\n[A] ACTIVE-ASSIGNMENT helper (SENT+ warn threshold)");
    check("A1: hasActiveAssignment(SENT job) === true", (await hasActiveAssignment(tId, jobD)) === true);
    check("A2: hasActiveAssignment(DRAFT-only job) === false", (await hasActiveAssignment(tId, jobDraft)) === false);
    check("A3: hasActiveAssignment(no-assignment job) === false", (await hasActiveAssignment(tId, jobNone)) === false);

    console.log("\n[HONESTY]");
    console.log("  [check-job-edit] SEEDED-FIXTURE proof of the updateJob dual-write + guards on the REAL writer.");
    console.log("  No LLM/money derivation — NTE is operator-entered. Proves: typed history + events + audit, the");
    console.log("  deliberate 2nd NTE writer, the same-client + source-lock guards, clear-to-null rejection, and the");
    console.log("  SENT+ active-assignment helper.");

    return finish();
  } finally {
    await teardown();
    console.log("[check-job-edit] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-job-edit] passed: ${passed}`);
  console.log(`[check-job-edit] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-job-edit] JOB-EDIT LEDGER RED ✗");
  } else {
    console.log("[check-job-edit] JOB-EDIT LEDGER GREEN ✓ (dual-write history/event/audit + no-op / NTE 2nd writer + nte.adjusted / location same-client guard / source-lock / clear-to-null / active-assignment SENT+)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => { console.error("[check-job-edit] FAILED:", e); process.exit(1); });
