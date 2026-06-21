/**
 * scripts/probe-redispatch-3.ts — SANDBOX probe for approveRedispatch (Phase 28 3).
 *
 * Ordered-with-recovery approve = ghost the stuck assignment, then send the suggestion DRAFT.
 *   A (happy):  approve -> stuck GHOSTED, DRAFT SENT, job stays DISPATCHED.
 *   B (2x):     approve again -> DRAFT_NOT_PENDING; nothing re-ghosted / double-sent.
 *   C (guard):  stuck transitioned to ACCEPTED first -> STUCK_NO_LONGER_SENT; nothing half-applied.
 *   D (manual): a plain DRAFT (replaces null) -> NOT_A_REDISPATCH_SUGGESTION.
 * Self-tearing-down (namespaced [REDISPATCH-3]). SANDBOX ONLY. Throwaway.
 *
 *   pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/probe-redispatch-3.ts
 */

export {};

// ===== SANDBOX GUARD =====
const RAW = process.env.DATABASE_URL;
if (!RAW) { console.error("[probe-3] DATABASE_URL not set — refusing."); process.exit(2); }
const sandboxUrl = RAW.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[probe-3] refusing: resolved URL is not a *_sandbox DB."); process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[probe-3] sandbox target confirmed: ${sandboxUrl.replace(/\/\/[^@]+@/, "//<creds>@")}`);

const MARKER = "[REDISPATCH-3]";
const TENANT_SLUG = "phase9-seed-tenant";
const OPERATOR_EMAIL = "operator@phase9seed.test";

async function main() {
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, trades, users, jobStatuses,
    vendors, vendorLocations, vendorTradeCoverage, vendorServiceAreas,
    jobs, jobVendorAssignments, jobStatusHistory, jobEvents,
    jobVendorAssignmentStatusHistory, auditLogs, dispatchAssignmentStatuses,
  } = await import("@/server/schema");
  const { eq, and, inArray, like, or, sql } = await import("drizzle-orm");
  const { v7: uuidv7 } = await import("uuid");
  const { createJob } = await import("@/server/jobs");
  const { createDispatch, sendDispatch, setAssignmentStatus } = await import("@/server/dispatch");
  const { prepareRedispatchSuggestion, approveRedispatch } = await import("@/server/redispatch-suggestion");

  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  const dbName = dbRows[0]?.db ?? "";
  if (!/_sandbox$/.test(dbName)) { console.error(`[probe-3] ABORT: DB "${dbName}" is not *_sandbox.`); process.exit(2); }
  console.log("[probe-3] connected DB confirmed:", dbName);

  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TENANT_SLUG)).limit(1);
  if (!tenant) { console.error("[probe-3] phase9-seed-tenant not found."); process.exit(2); }
  const tenantId = tenant.id;
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, tenantId)).limit(1);
  const [location] = await db.select({ id: clientLocations.id }).from(clientLocations).where(and(eq(clientLocations.tenantId, tenantId), eq(clientLocations.clientId, client!.id))).limit(1);
  const [trade] = await db.select({ id: trades.id }).from(trades).limit(1);
  const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, OPERATOR_EMAIL)).limit(1);
  const creatorId = operator?.id ?? (await db.select({ id: users.id }).from(users).limit(1))[0]!.id;
  if (!client || !location || !trade) { console.error("[probe-3] missing client/location/trade."); process.exit(2); }

  // ---- helpers ----
  async function makeVendor(label: string): Promise<string> {
    const vid = uuidv7();
    await db.insert(vendors).values({ id: vid, tenantId, name: `${MARKER} ${label}` });
    await db.insert(vendorLocations).values({ id: uuidv7(), tenantId, vendorId: vid, name: `${label} HQ`, addressLine1: "1 Probe Rd", city: "Metropolis", stateProvince: "NY", postalCode: "10001" });
    await db.insert(vendorTradeCoverage).values({ tenantId, vendorId: vid, tradeId: trade!.id, status: "active", isPrimary: true });
    await db.insert(vendorServiceAreas).values({ tenantId, vendorId: vid, areaType: "national", status: "active" });
    return vid;
  }
  async function makeJob(label: string): Promise<{ id: string; jobNumber: number }> {
    const j = await createJob({ tenantId, clientId: client!.id, clientLocationId: location!.id, primaryTradeId: trade!.id, problemDescription: `${MARKER} ${label}`, createdByUserId: creatorId });
    return { id: j.id, jobNumber: j.jobNumber };
  }
  async function dispatchSent(jobId: string, vendorId: string): Promise<string> {
    const a = await createDispatch({ tenantId, jobId, vendorId, createdByUserId: creatorId });
    await sendDispatch({ tenantId, assignmentId: a.id, actorUserId: creatorId });
    return a.id;
  }
  async function asgStatus(id: string): Promise<string> {
    const [r] = await db.select({ code: dispatchAssignmentStatuses.code }).from(jobVendorAssignments)
      .innerJoin(dispatchAssignmentStatuses, eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id))
      .where(eq(jobVendorAssignments.id, id)).limit(1);
    return r?.code ?? "(none)";
  }
  async function asgSentAt(id: string): Promise<boolean> {
    const [r] = await db.select({ sentAt: jobVendorAssignments.sentAt }).from(jobVendorAssignments).where(eq(jobVendorAssignments.id, id)).limit(1);
    return r?.sentAt != null;
  }
  async function jobStatus(jobId: string): Promise<string> {
    const [r] = await db.select({ code: jobStatuses.code }).from(jobs)
      .innerJoin(jobStatuses, eq(jobs.currentStatusId, jobStatuses.id))
      .where(eq(jobs.id, jobId)).limit(1);
    return r?.code ?? "(none)";
  }
  async function sentCount(jobId: string): Promise<number> {
    const rows = await db.select({ id: jobVendorAssignments.id }).from(jobVendorAssignments)
      .innerJoin(dispatchAssignmentStatuses, eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id))
      .where(and(eq(jobVendorAssignments.jobId, jobId), eq(dispatchAssignmentStatuses.code, "SENT")));
    return rows.length;
  }

  let allPass = true;
  const check = (n: string, c: boolean) => { console.log(`  ${c ? "PASS" : "FAIL"} — ${n}`); if (!c) allPass = false; };
  async function expectThrow(n: string, fn: () => Promise<unknown>, code: string) {
    try { await fn(); check(`${n} (expected throw ${code})`, false); }
    catch (e) { check(`${n} -> ${code}`, (e as Error).message === code); }
  }

  // ---------- TEARDOWN ----------
  async function teardown() {
    const pV = await db.select({ id: vendors.id }).from(vendors).where(and(eq(vendors.tenantId, tenantId), like(vendors.name, `${MARKER}%`)));
    const vIds = pV.map((v) => v.id);
    const pJ = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.tenantId, tenantId), like(jobs.problemDescription, `${MARKER}%`)));
    const jIds = pJ.map((j) => j.id);
    const aRows = (jIds.length || vIds.length)
      ? await db.select({ id: jobVendorAssignments.id }).from(jobVendorAssignments).where(and(eq(jobVendorAssignments.tenantId, tenantId),
          or(jIds.length ? inArray(jobVendorAssignments.jobId, jIds) : undefined, vIds.length ? inArray(jobVendorAssignments.vendorId, vIds) : undefined)))
      : [];
    const aIds = aRows.map((r) => r.id);
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
      if (aIds.length) {
        await tx.delete(jobVendorAssignmentStatusHistory).where(inArray(jobVendorAssignmentStatusHistory.assignmentId, aIds));
        await tx.delete(auditLogs).where(inArray(auditLogs.targetId, aIds));
        await tx.delete(jobVendorAssignments).where(inArray(jobVendorAssignments.id, aIds));
      }
      if (vIds.length) {
        await tx.delete(vendorTradeCoverage).where(inArray(vendorTradeCoverage.vendorId, vIds));
        await tx.delete(vendorServiceAreas).where(inArray(vendorServiceAreas.vendorId, vIds));
        await tx.delete(vendorLocations).where(inArray(vendorLocations.vendorId, vIds));
        await tx.delete(vendors).where(inArray(vendors.id, vIds));
      }
      if (jIds.length) {
        await tx.delete(auditLogs).where(inArray(auditLogs.targetId, jIds));
        await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, jIds));
        await tx.delete(jobEvents).where(inArray(jobEvents.jobId, jIds));
        await tx.delete(jobs).where(inArray(jobs.id, jIds));
      }
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
    });
    return { jobs: jIds.length, vendors: vIds.length, assignments: aIds.length };
  }
  console.log("[probe-3] pre-clean:", await teardown());

  // ========== SCENARIO A — happy path ==========
  console.log("\n[probe-3] SCENARIO A — happy path");
  const jobAB = await makeJob("A/B job");
  const vA = await makeVendor("Vendor A");
  await makeVendor("Vendor B"); // eligible alternative
  const stuckA = await dispatchSent(jobAB.id, vA);
  const prepAB = await prepareRedispatchSuggestion({ tenantId, jobId: jobAB.id, stuckAssignmentId: stuckA, createdByUserId: creatorId });
  if (prepAB.kind !== "prepared") { console.error("[probe-3] A: prepare did not return prepared:", prepAB); process.exit(1); }
  const draftB = prepAB.draftAssignmentId;
  const approveA = await approveRedispatch({ tenantId, draftAssignmentId: draftB, actorUserId: creatorId });
  console.log("  approve:", approveA);
  check("A: kind == approved", approveA.kind === "approved");
  check("A: stuck (A) now GHOSTED", (await asgStatus(stuckA)) === "GHOSTED");
  check("A: DRAFT (B) now SENT", (await asgStatus(draftB)) === "SENT");
  check("A: B sent_at stamped", await asgSentAt(draftB));
  check("A: job still DISPATCHED (not regressed/closed)", (await jobStatus(jobAB.id)) === "DISPATCHED");

  // ========== SCENARIO B — double-click ==========
  console.log("\n[probe-3] SCENARIO B — double-click");
  await expectThrow("B: 2nd approve", () => approveRedispatch({ tenantId, draftAssignmentId: draftB, actorUserId: creatorId }), "DRAFT_NOT_PENDING");
  check("B: A still GHOSTED (not re-ghosted)", (await asgStatus(stuckA)) === "GHOSTED");
  check("B: exactly 1 SENT on the job (no double)", (await sentCount(jobAB.id)) === 1);

  // ========== SCENARIO C — stuck responded (mandatory guard) ==========
  console.log("\n[probe-3] SCENARIO C — stuck responded");
  const jobCD = await makeJob("C/D job");
  const vC = await makeVendor("Vendor C");
  await makeVendor("Vendor D"); // eligible alternative
  const stuckC = await dispatchSent(jobCD.id, vC);
  const prepCD = await prepareRedispatchSuggestion({ tenantId, jobId: jobCD.id, stuckAssignmentId: stuckC, createdByUserId: creatorId });
  if (prepCD.kind !== "prepared") { console.error("[probe-3] C: prepare did not return prepared:", prepCD); process.exit(1); }
  const draftD = prepCD.draftAssignmentId;
  await setAssignmentStatus({ tenantId, assignmentId: stuckC, toCode: "ACCEPTED", actorUserId: creatorId }); // vendor responds
  await expectThrow("C: approve after stuck ACCEPTED", () => approveRedispatch({ tenantId, draftAssignmentId: draftD, actorUserId: creatorId }), "STUCK_NO_LONGER_SENT");
  check("C: stuck (C) STILL ACCEPTED (not ghosted)", (await asgStatus(stuckC)) === "ACCEPTED");
  check("C: DRAFT (D) STILL DRAFT (not sent)", (await asgStatus(draftD)) === "DRAFT");

  // ========== SCENARIO D — not-a-suggestion (plain manual draft) ==========
  console.log("\n[probe-3] SCENARIO D — not-a-suggestion");
  const jobE = await makeJob("E job");
  await makeVendor("Vendor F-stuck"); // a vendor to leave the job non-empty (unused as stuck here)
  const vMan = await makeVendor("Vendor Manual");
  const manualDraft = await createDispatch({ tenantId, jobId: jobE.id, vendorId: vMan, createdByUserId: creatorId }); // plain DRAFT, replaces null
  await expectThrow("D: approve a manual draft", () => approveRedispatch({ tenantId, draftAssignmentId: manualDraft.id, actorUserId: creatorId }), "NOT_A_REDISPATCH_SUGGESTION");

  // ---------- TEARDOWN ----------
  console.log("\n[probe-3] teardown:", await teardown());
  console.log(`\n[probe-3] ${allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("[probe-3] ERROR:", e); process.exit(1); });
