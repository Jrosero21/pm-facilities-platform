/**
 * scripts/check-phase-22.ts — Phase 22 DISPATCH-ENGINE harness.
 *
 * Proves the deterministic dispatch foundation, end to end, against the LIVE
 * matcher + auto-picker (no softened assertions):
 *   1-4. ELIGIBILITY FLOOR — trade / geo / compliance / blocklist each exclude
 *        their vendor independently (invariant 5 — the hard floor).
 *   5.  PREFERENCE ORDERING — a preferred vendor sorts first (preferenceRank=1).
 *   6.  BLOCKLIST-BEATS-PREFERENCE (core) — a preferred AND blocked vendor is
 *       EXCLUDED entirely; exclusion wins over preference.
 *   7.  CROSS-TENANT — a tenant-B job matches only B's vendors; A's preferred/
 *       blocked rows do not bleed across.
 *   8.  DRAFT-GATE — auto-dispatch lands at DRAFT, never SENT (invariant 4/5).
 *   9.  IDEMPOTENCY — a 2nd auto-dispatch is a no-op; one assignment only (inv 6).
 *   10. AUTO-DRAFTED AUDIT — the autonomous action logs (NULL actor; invariant 2).
 *   11. NO-CANDIDATES — an empty floor drafts nothing (exception surface, inv 7).
 *   12. WRITE-BOUNDARY — exactly the top candidate's DRAFT row, facets populated.
 *
 * SANDBOX ONLY. Pure DB — NO capture flags (no send/storage this phase).
 * Self-seed + teardown. Mirrors scripts/check-phase-21.ts. Run: pnpm run db:check:dispatch
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-p22] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[check-p22] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-p22] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

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
const T_B_SLUG = "phase22-harness-tenant-b";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, jobs, jobStatusHistory, jobEvents,
    vendors, trades, vendorTradeCoverage, vendorServiceAreas, vendorCompliance,
    jobVendorAssignments, jobVendorAssignmentStatusHistory, dispatchAssignmentStatuses,
    auditLogs, locationPreferredVendors, locationBlockedVendors, users,
  } = await import("@/server/schema");
  const { eq, and, inArray, count, sql } = await import("drizzle-orm");
  const { createJob } = await import("@/server/jobs");
  const { findCandidateVendorsForJob } = await import("@/server/vendor-matching");
  const { autoDispatchDraftForJob } = await import("@/server/auto-dispatch");
  const { createLocationPreferredVendor, createLocationBlockedVendor } =
    await import("@/server/dispatch-routing");

  let tBId: string | null = null;
  const createdClientIds: string[] = [];
  const createdLocationIds: string[] = [];
  const createdVendorIds: string[] = [];
  const createdJobIds: string[] = [];

  async function teardown() {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
        if (createdVendorIds.length) {
          await tx.delete(locationPreferredVendors).where(inArray(locationPreferredVendors.vendorId, createdVendorIds));
          await tx.delete(locationBlockedVendors).where(inArray(locationBlockedVendors.vendorId, createdVendorIds));
          await tx.delete(vendorTradeCoverage).where(inArray(vendorTradeCoverage.vendorId, createdVendorIds));
          await tx.delete(vendorServiceAreas).where(inArray(vendorServiceAreas.vendorId, createdVendorIds));
          await tx.delete(vendorCompliance).where(inArray(vendorCompliance.vendorId, createdVendorIds));
        }
        const allJobIds = [...createdJobIds];
        if (allJobIds.length) {
          const aRows = await tx.select({ id: jobVendorAssignments.id }).from(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, allJobIds));
          const aIds = aRows.map((r) => r.id);
          if (aIds.length) {
            await tx.delete(jobVendorAssignmentStatusHistory).where(inArray(jobVendorAssignmentStatusHistory.assignmentId, aIds));
            await tx.delete(auditLogs).where(inArray(auditLogs.targetId, aIds));
            await tx.delete(jobVendorAssignments).where(inArray(jobVendorAssignments.id, aIds));
          }
          await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, allJobIds));
          await tx.delete(jobEvents).where(inArray(jobEvents.jobId, allJobIds));
          await tx.delete(jobs).where(inArray(jobs.id, allJobIds));
        }
        if (createdVendorIds.length) {
          await tx.delete(vendors).where(inArray(vendors.id, createdVendorIds));
        }
        if (createdLocationIds.length) {
          await tx.delete(clientLocations).where(inArray(clientLocations.id, createdLocationIds));
        }
        if (createdClientIds.length) {
          await tx.delete(clients).where(inArray(clients.id, createdClientIds));
        }
        if (tBId) {
          await tx.delete(tenants).where(eq(tenants.id, tBId!));
        }
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
      });
    } catch (e) {
      console.error("[check-p22] teardown warning:", e);
    }
  }

  // pre-clean a leftover T-B
  {
    const priorTB = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, T_B_SLUG)).limit(1);
    if (priorTB[0]) { tBId = priorTB[0].id; await teardown(); tBId = null; }
  }

  try {
    console.log("\n[setup] T-A harness client/location + HVAC job; 7 controlled vendors; T-B");
    const [tA] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SEED_TENANT_SLUG));
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [hvac] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HVAC"));
    const [plumb] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "PLUMB"));
    check("setup: T-A + operator + HVAC + PLUMB trades exist", !!tA && !!operator && !!hvac && !!plumb);
    if (!tA || !operator || !hvac || !plumb) return finish();
    const tAId = tA.id;

    // Controlled client + location under T-A (Metropolis / NY / 10001).
    const clientA = uuidv7();
    await db.insert(clients).values({ id: clientA, tenantId: tAId, name: "P22 Harness Client A" });
    createdClientIds.push(clientA);
    const locA = uuidv7();
    await db.insert(clientLocations).values({
      id: locA, tenantId: tAId, clientId: clientA, name: "P22 Loc A",
      addressLine1: "1 Test Way", city: "Metropolis", stateProvince: "NY", postalCode: "10001",
    });
    createdLocationIds.push(locA);

    const jobA = await createJob({ tenantId: tAId, clientId: clientA, clientLocationId: locA, primaryTradeId: hvac.id, problemDescription: "P22 HVAC job", createdByUserId: operator.id });
    createdJobIds.push(jobA.id);

    // 7 controlled vendors via direct eligibility-input inserts.
    async function seedVendor(name: string, opts: { trade?: boolean; geo?: string | null; badCompliance?: boolean }): Promise<string> {
      const id = uuidv7();
      await db.insert(vendors).values({ id, tenantId: tAId, name });
      createdVendorIds.push(id);
      if (opts.trade) await db.insert(vendorTradeCoverage).values({ id: uuidv7(), tenantId: tAId, vendorId: id, tradeId: hvac.id, vendorLocationId: null, isPrimary: true, status: "active" });
      if (opts.geo) await db.insert(vendorServiceAreas).values({ id: uuidv7(), tenantId: tAId, vendorId: id, vendorLocationId: null, areaType: "state", stateCode: opts.geo, status: "active" });
      if (opts.badCompliance) await db.insert(vendorCompliance).values({ id: uuidv7(), tenantId: tAId, vendorId: id, requirementType: "general_liability", complianceStatus: "expired", status: "active" });
      return id;
    }

    const vPASS = await seedVendor("P22_PASS", { trade: true, geo: "NY" });
    const vNO_TRADE = await seedVendor("P22_NO_TRADE", { trade: false, geo: "NY" });
    const vNO_GEO = await seedVendor("P22_NO_GEO", { trade: true, geo: "TX" });
    const vBAD_COMPLIANCE = await seedVendor("P22_BAD_COMPLIANCE", { trade: true, geo: "NY", badCompliance: true });
    const vBLOCKED = await seedVendor("P22_BLOCKED", { trade: true, geo: "NY" });
    const vPREFERRED = await seedVendor("P22_PREFERRED", { trade: true, geo: "NY" });
    const vPREF_BLOCKED = await seedVendor("P22_PREF_BLOCKED", { trade: true, geo: "NY" });

    await createLocationBlockedVendor({ tenantId: tAId, clientId: clientA, clientLocationId: locA, vendorId: vBLOCKED, reason: "harness block", createdByUserId: operator.id });
    await createLocationPreferredVendor({ tenantId: tAId, clientLocationId: locA, tradeId: hvac.id, vendorId: vPREFERRED, priority: 1, createdByUserId: operator.id });
    // preferred AND blocked → exclusion must win
    await createLocationPreferredVendor({ tenantId: tAId, clientLocationId: locA, tradeId: hvac.id, vendorId: vPREF_BLOCKED, priority: 1, createdByUserId: operator.id });
    await createLocationBlockedVendor({ tenantId: tAId, clientId: clientA, clientLocationId: locA, vendorId: vPREF_BLOCKED, reason: "harness block-beats-pref", createdByUserId: operator.id });

    check("setup: 7 vendors + preferred/blocked rows seeded", createdVendorIds.length === 7);

    // ════════ FLOOR (1-4) + PREFERENCE (5) + BLOCKLIST-BEATS-PREFERENCE (6) ════════
    const candidates = await findCandidateVendorsForJob(tAId, jobA.id);
    const ids = candidates.map((c) => c.vendorId);
    const idSet = new Set(ids);

    console.log("\n[1] FLOOR — trade");
    check("1a: candidate set INCLUDES vendor_PASS (trade+geo ok)", idSet.has(vPASS));
    check("1b: EXCLUDES vendor_NO_TRADE (no HVAC coverage)", !idSet.has(vNO_TRADE));

    console.log("\n[2] FLOOR — geo");
    check("2: EXCLUDES vendor_NO_GEO (TX area ≠ NY location)", !idSet.has(vNO_GEO));

    console.log("\n[3] FLOOR — compliance");
    check("3: EXCLUDES vendor_BAD_COMPLIANCE (expired/active)", !idSet.has(vBAD_COMPLIANCE));

    console.log("\n[4] FLOOR — blocklist");
    check("4: EXCLUDES vendor_BLOCKED (active block row)", !idSet.has(vBLOCKED));

    console.log("\n[5] PREFERENCE ORDERING");
    check("5a: vendor_PREFERRED is in the candidate set", idSet.has(vPREFERRED));
    check("5b: vendor_PREFERRED sorts FIRST (candidates[0])", candidates[0]?.vendorId === vPREFERRED);
    check("5c: vendor_PREFERRED has preferenceRank === 1", candidates[0]?.preferenceRank === 1);
    const idxPref = ids.indexOf(vPREFERRED);
    const idxPass = ids.indexOf(vPASS);
    check("5d: a non-preferred eligible vendor (vendor_PASS) sorts AFTER the preferred", idxPref >= 0 && idxPass > idxPref);
    check("5e: vendor_PASS has preferenceRank === null (not preferred)", candidates[idxPass]?.preferenceRank === null);

    console.log("\n[6] BLOCKLIST-BEATS-PREFERENCE (core)");
    check("6: vendor_PREFERRED_AND_BLOCKED is EXCLUDED entirely (exclusion wins)", !idSet.has(vPREF_BLOCKED));

    // ════════ 7. CROSS-TENANT ════════
    console.log("\n[7] CROSS-TENANT isolation");
    tBId = uuidv7();
    await db.insert(tenants).values({ id: tBId, slug: T_B_SLUG, name: "P22 Harness Tenant B" });
    // Track T-B children by id so teardown deletes them explicitly — FK_CHECKS=0
    // means deleting the tenant row does NOT cascade to children.
    const clientB = uuidv7();
    await db.insert(clients).values({ id: clientB, tenantId: tBId, name: "P22 Client B" });
    createdClientIds.push(clientB);
    const locB = uuidv7();
    await db.insert(clientLocations).values({ id: locB, tenantId: tBId, clientId: clientB, name: "P22 Loc B", addressLine1: "1 B Way", city: "Metropolis", stateProvince: "NY", postalCode: "10001" });
    createdLocationIds.push(locB);
    const jobB = await createJob({ tenantId: tBId, clientId: clientB, clientLocationId: locB, primaryTradeId: hvac.id, problemDescription: "P22 B job", createdByUserId: operator.id });
    createdJobIds.push(jobB.id);
    const vB = uuidv7();
    await db.insert(vendors).values({ id: vB, tenantId: tBId, name: "P22 Vendor B" });
    createdVendorIds.push(vB);
    await db.insert(vendorTradeCoverage).values({ id: uuidv7(), tenantId: tBId, vendorId: vB, tradeId: hvac.id, vendorLocationId: null, isPrimary: true, status: "active" });
    await db.insert(vendorServiceAreas).values({ id: uuidv7(), tenantId: tBId, vendorId: vB, vendorLocationId: null, areaType: "state", stateCode: "NY", status: "active" });

    const aVendorIds = [vPASS, vNO_TRADE, vNO_GEO, vBAD_COMPLIANCE, vBLOCKED, vPREFERRED, vPREF_BLOCKED];
    const candB = await findCandidateVendorsForJob(tBId, jobB.id);
    const idsB = new Set(candB.map((c) => c.vendorId));
    check("7a: tenant-B job matches only B's vendor", idsB.has(vB) && idsB.size === 1);
    check("7b: tenant-B candidates contain NONE of A's vendors", !candB.some((c) => aVendorIds.includes(c.vendorId)));
    check("7c: A's preferred/blocked (tenant_id=A) do not affect B — B's vendor not preference-ranked", candB.find((c) => c.vendorId === vB)?.preferenceRank === null);

    // ════════ 8-10. AUTO-PICKER: DRAFT-GATE + IDEMPOTENCY + AUDIT ════════
    console.log("\n[8] AUTO-PICKER draft-gate");
    const r1 = await autoDispatchDraftForJob(tAId, jobA.id);
    // 23f-2: a default fail-safe-gated tenant now returns 'drafted_pending' (draft created,
    // auto-advance gated) — the same physical DRAFT-GATE invariant Phase 22 asserted, under
    // the governed vocabulary. (Vocabulary carry — flagged for the 23f-2 harness gate.)
    check("8a: auto-dispatch outcome === 'drafted_pending' (gated, draft created)", r1.outcome === "drafted_pending");
    const assignmentId = r1.outcome === "drafted_pending" ? r1.assignmentId : "";
    const statusRow = assignmentId
      ? (await db.select({ code: dispatchAssignmentStatuses.code })
          .from(jobVendorAssignments)
          .innerJoin(dispatchAssignmentStatuses, eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id))
          .where(eq(jobVendorAssignments.id, assignmentId)))[0]
      : undefined;
    check("8b: created assignment status === 'DRAFT' (never SENT)", statusRow?.code === "DRAFT");
    check("8c: drafted vendor is the top candidate (vendor_PREFERRED)", r1.outcome === "drafted_pending" && r1.vendorId === vPREFERRED);

    console.log("\n[9] IDEMPOTENCY");
    const r2 = await autoDispatchDraftForJob(tAId, jobA.id);
    check("9a: 2nd auto-dispatch outcome === 'already_active'", r2.outcome === "already_active");
    const cnt = await db.select({ n: count() }).from(jobVendorAssignments).where(eq(jobVendorAssignments.jobId, jobA.id));
    check("9b: exactly ONE assignment exists for jobA (no double-dispatch)", Number(cnt[0]?.n) === 1);

    console.log("\n[10] AUTO-DRAFTED AUDIT (invariant 2)");
    const auditRows = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "job_vendor_assignment.auto_drafted"), eq(auditLogs.targetId, assignmentId)));
    const ar = auditRows[0];
    // MariaDB json() comes back as a string — parse at the read boundary (house pattern).
    const meta = (typeof ar?.metadata === "string" ? JSON.parse(ar.metadata) : (ar?.metadata ?? {})) as Record<string, unknown>;
    check("10a: auto_drafted audit row exists for the assignment", !!ar);
    check("10b: audit userId IS NULL (system actor)", ar?.userId === null);
    check("10c: audit metadata carries rule + preferenceRank", meta.rule === "preferred-then-rank" && meta.preferenceRank === 1);

    // ════════ 11. NO-CANDIDATES ════════
    console.log("\n[11] NO-CANDIDATES (empty floor → no draft)");
    const jobNoCand = await createJob({ tenantId: tAId, clientId: clientA, clientLocationId: locA, primaryTradeId: plumb.id, problemDescription: "P22 no-candidate (PLUMB) job", createdByUserId: operator.id });
    createdJobIds.push(jobNoCand.id);
    const r3 = await autoDispatchDraftForJob(tAId, jobNoCand.id);
    check("11a: PLUMB job (no vendor covers it) → outcome === 'no_candidates'", r3.outcome === "no_candidates");
    const cntNo = await db.select({ n: count() }).from(jobVendorAssignments).where(eq(jobVendorAssignments.jobId, jobNoCand.id));
    check("11b: NO assignment row created for the no-candidate job", Number(cntNo[0]?.n) === 0);

    // ════════ 12. WRITE-BOUNDARY ════════
    console.log("\n[12] WRITE-BOUNDARY");
    const aRow = assignmentId
      ? (await db.select().from(jobVendorAssignments).where(eq(jobVendorAssignments.id, assignmentId)))[0]
      : undefined;
    check("12a: the one assignment is for vendor_PREFERRED (the top candidate)", aRow?.vendorId === vPREFERRED);
    check("12b: facet snapshot populated — matched_trade_id non-null", !!aRow?.matchedTradeId);
    check("12c: facet snapshot populated — compliance_status_at_dispatch present", !!aRow?.complianceStatusAtDispatch);
    check("12d: assignment created by NULL system actor", aRow?.createdByUserId === null);

    return finish();
  } finally {
    await teardown();
    console.log("[check-p22] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-p22] passed: ${passed}`);
  console.log(`[check-p22] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-p22] PHASE-22 DISPATCH-ENGINE LEDGER RED ✗ — PHASE BLOCKED");
  } else {
    console.log("[check-p22] PHASE-22 DISPATCH-ENGINE LEDGER GREEN ✓ (floor trade/geo/compliance/blocklist / preference ordering / blocklist-beats-preference / cross-tenant / draft-gate / idempotency / auto_drafted audit / no-candidates / write-boundary)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => {
    console.error("[check-p22] FAILED:", e);
    process.exit(1);
  });
