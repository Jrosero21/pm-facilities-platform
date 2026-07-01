/**
 * scripts/check-external-integrations.ts — Phase 12 (12k) PHASE-BLOCKING HARNESS
 *
 * Empirically discharges Phase 12's banked guarantees (24 assertions, A–E from
 * 12k-A-harness-ledger.md): source-agnostic ingest, mapping correctness incl. F5
 * priority tenant-dim, tenant isolation, no-credential-leak + OQ-6, locked behaviors.
 *
 * SANDBOX ONLY — hard-guarded by the _sandbox name check below. DESTRUCTIVE +
 * RE-SEED-FIRST: run the phase-9 sandbox seed AND the system-user seed before this.
 * The harness builds its OWN two-tenant fixture (T-A = the seeded tenant; T-B created
 * in-harness) + all external_* rows, and tears them down in a finally block so a
 * re-run starts clean.
 *
 * Run: npm run db:check:external-integrations   (after re-seeding sandbox)
 */

export {}; // module isolation — keep this script's top-level `main()` out of the global scope
// (a bare script's global `main()` collides with other harness scripts' — TS2393; CF-24.1).

// -------- Sandbox guard + env swap (BEFORE any DB-touching import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-external] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-external] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;

// -------- Tiny assertion framework --------
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

const SECRET_MARKER = "HARNESS_SECRET_MARKER";
const T_B_SLUG = "phase12-harness-tenant-b";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, priorities, jobStatuses, trades, jobs,
    externalSystems, externalAccounts, externalCredentials,
    externalClientMappings, externalLocationMappings, externalStatusMappings,
    externalTradeMappings, externalPriorityMappings,
    externalWorkOrderLinks, externalSyncRuns, externalSyncEvents, externalPayloadLogs,
  } = await import("@/server/schema");
  const { and, eq, inArray, sql } = await import("drizzle-orm");
  const VF = await import("./seed-sandbox-phase9-fixture");
  const { getSystemUserId } = await import("@/server/integrations/system-user");
  const { ingestExternalJob } = await import("@/server/integrations/ingest-external-job");
  const { pushStatusToExternal } = await import("@/lib/integrations/core/sync");
  const { getAdapter } = await import("@/lib/integrations/core/registry");
  await import("@/lib/integrations/servicechannel/index"); // self-registers the adapter
  const { serviceChannelAdapter } = await import("@/lib/integrations/servicechannel/adapter");

  // Track created rows for teardown.
  const createdSystemIds: string[] = [];
  let tBId: string | null = null;

  async function teardown() {
    try {
      await db.transaction(async (tx) => {
        if (createdSystemIds.length) {
          const sids = createdSystemIds;
          // global-target mappings (no tenant_id) — delete by system id
          await tx.delete(externalStatusMappings).where(inArray(externalStatusMappings.externalSystemId, sids));
          await tx.delete(externalTradeMappings).where(inArray(externalTradeMappings.externalSystemId, sids));
          // tenant-carrying external_* — delete by system id
          await tx.delete(externalPriorityMappings).where(inArray(externalPriorityMappings.externalSystemId, sids));
          await tx.delete(externalLocationMappings).where(inArray(externalLocationMappings.externalSystemId, sids));
          await tx.delete(externalClientMappings).where(inArray(externalClientMappings.externalSystemId, sids));
          await tx.delete(externalPayloadLogs).where(inArray(externalPayloadLogs.externalSystemId, sids));
          await tx.delete(externalSyncRuns).where(inArray(externalSyncRuns.externalSystemId, sids));
          await tx.delete(externalWorkOrderLinks).where(inArray(externalWorkOrderLinks.externalSystemId, sids));
          await tx.delete(externalAccounts).where(inArray(externalAccounts.externalSystemId, sids));
          await tx.delete(externalCredentials).where(inArray(externalCredentials.externalSystemId, sids));
          // sync_events have no system id — clear any orphaned by tenant T-B below; T-A's are FK to runs (deleted)
        }
        if (tBId) {
          // T-B is fully harness-owned — purge everything under it, then the tenant.
          await tx.delete(externalSyncEvents).where(eq(externalSyncEvents.tenantId, tBId));
          await tx.delete(jobs).where(eq(jobs.tenantId, tBId));
          await tx.delete(clientLocations).where(eq(clientLocations.tenantId, tBId));
          await tx.delete(clients).where(eq(clients.tenantId, tBId));
          await tx.delete(priorities).where(eq(priorities.tenantId, tBId));
          await tx.delete(tenants).where(eq(tenants.id, tBId));
        }
      });
    } catch (e) {
      console.error("[check-external] teardown warning:", e);
    }
  }

  // Defensive pre-clean: drop a leftover T-B from a prior aborted run.
  {
    const prior = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, T_B_SLUG)).limit(1);
    if (prior[0]) {
      tBId = prior[0].id;
      // also collect any leftover harness systems under it
      const sys = await db.select({ id: externalSystems.id }).from(externalSystems).where(eq(externalSystems.tenantId, tBId));
      createdSystemIds.push(...sys.map((s) => s.id));
      await teardown();
      tBId = null;
      createdSystemIds.length = 0;
    }
  }

  try {
    console.log("\n[setup] resolve T-A (seeded) + build T-B + external fixtures");
    const systemUserId = await getSystemUserId();

    // ── T-A: the seeded tenant + acme client/location/priority ──
    const [tA] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, VF.SEED_TENANT.slug));
    check("setup: seeded tenant (T-A) exists", !!tA);
    if (!tA) return finish();
    const tAId = tA.id;

    const [acme] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.tenantId, tAId), eq(clients.name, "Acme Corp")));
    if (!acme) { check("setup: T-A acme client", false); return finish(); }
    const [acmeLoc] = await db.select({ id: clientLocations.id }).from(clientLocations).where(and(eq(clientLocations.tenantId, tAId), eq(clientLocations.clientId, acme.id))).limit(1);
    const [emergencyA] = await db.select({ id: priorities.id }).from(priorities).where(and(eq(priorities.tenantId, tAId), eq(priorities.code, "EMERGENCY")));
    if (!acmeLoc || !emergencyA) { check("setup: T-A location + priority", false); return finish(); }

    const [newStatus] = await db.select({ id: jobStatuses.id }).from(jobStatuses).where(eq(jobStatuses.code, "NEW"));
    const [hvac] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HVAC"));
    if (!newStatus || !hvac) { check("setup: global NEW status + HVAC trade", false); return finish(); }

    // ── T-B: created in-harness, with its OWN client/location/priority ──
    tBId = uuidv7();
    await db.insert(tenants).values({ id: tBId, name: "Phase12 Harness Tenant B", slug: T_B_SLUG, type: "aggregator", status: "active" });
    const tbClientId = uuidv7();
    await db.insert(clients).values({ id: tbClientId, tenantId: tBId, name: "Harness Client B" });
    const tbLocId = uuidv7();
    await db.insert(clientLocations).values({ id: tbLocId, tenantId: tBId, clientId: tbClientId, name: "B Store", addressLine1: "1 B St", city: "Btown", stateProvince: "CA", postalCode: "90001" });
    const tbPriorityId = uuidv7();
    await db.insert(priorities).values({ id: tbPriorityId, tenantId: tBId, name: "B Emergency", code: "BEMERG", rank: 1 });

    // ── external_systems (one per tenant) + accounts + a credential (marker) ──
    const sysAId = uuidv7();
    await db.insert(externalSystems).values({ id: sysAId, tenantId: tAId, provider: "servicechannel", name: "SC-A", createdByUserId: systemUserId });
    createdSystemIds.push(sysAId);
    const sysBId = uuidv7();
    await db.insert(externalSystems).values({ id: sysBId, tenantId: tBId, provider: "servicechannel", name: "SC-B", createdByUserId: systemUserId });
    createdSystemIds.push(sysBId);

    await db.insert(externalAccounts).values({ id: uuidv7(), tenantId: tAId, externalSystemId: sysAId, externalAccountRef: "ACCT-A" });
    await db.insert(externalAccounts).values({ id: uuidv7(), tenantId: tBId, externalSystemId: sysBId, externalAccountRef: "ACCT-B" });

    // A credential with a recognizable marker — proves the no-leak assertion (D).
    await db.insert(externalCredentials).values({
      id: uuidv7(), tenantId: tAId, externalSystemId: sysAId,
      credentialType: "api_key", encryptedPayload: SECRET_MARKER, keyRef: SECRET_MARKER,
    });

    // ── mappings: client / location / status / trade / priority (both systems) ──
    // client codes: SUB-A → acme ; SUB-B → tbClient
    await db.insert(externalClientMappings).values({ id: uuidv7(), tenantId: tAId, externalSystemId: sysAId, externalCode: "SUB-A", clientId: acme.id, direction: "both" });
    await db.insert(externalClientMappings).values({ id: uuidv7(), tenantId: tBId, externalSystemId: sysBId, externalCode: "SUB-B", clientId: tbClientId, direction: "both" });
    // location codes: STORE-1 → mapped (A + B); STORE-NEW → unmapped (A, for auto-stub)
    await db.insert(externalLocationMappings).values({ id: uuidv7(), tenantId: tAId, externalSystemId: sysAId, clientId: acme.id, externalCode: "STORE-1", clientLocationId: acmeLoc.id, direction: "both" });
    await db.insert(externalLocationMappings).values({ id: uuidv7(), tenantId: tBId, externalSystemId: sysBId, clientId: tbClientId, externalCode: "STORE-1", clientLocationId: tbLocId, direction: "both" });
    // status: OPEN → NEW (both)
    await db.insert(externalStatusMappings).values({ id: uuidv7(), externalSystemId: sysAId, externalCode: "OPEN", jobStatusId: newStatus.id, direction: "both" });
    await db.insert(externalStatusMappings).values({ id: uuidv7(), externalSystemId: sysBId, externalCode: "OPEN", jobStatusId: newStatus.id, direction: "both" });
    // trade: HV → HVAC (A)
    await db.insert(externalTradeMappings).values({ id: uuidv7(), externalSystemId: sysAId, externalCode: "HV", tradeId: hvac.id, direction: "both" });
    // priority: SAME external code "P1" → A's EMERGENCY (sys A) vs B's BEMERG (sys B) — F5 proof
    await db.insert(externalPriorityMappings).values({ id: uuidv7(), tenantId: tAId, externalSystemId: sysAId, externalCode: "P1", priorityId: emergencyA.id, direction: "both" });
    await db.insert(externalPriorityMappings).values({ id: uuidv7(), tenantId: tBId, externalSystemId: sysBId, externalCode: "P1", priorityId: tbPriorityId, direction: "both" });

    // ── helper to build a mock NormalizedWorkOrder ──
    const woBase = (over: Record<string, unknown>) => ({
      externalWoId: "WO-1",
      externalClientCode: "SUB-A",
      externalLocationCode: "STORE-1",
      externalStatusCode: "OPEN",
      externalTradeCode: "HV",
      externalPriorityCode: "P1",
      problemDescription: "leak in unit 4",
      raw: { Id: "WO-1", SubscriberId: "SUB-A" },
      ...over,
    });

    // ════════ A. SOURCE-AGNOSTIC ════════
    console.log("\n[A] source-agnostic");
    const rA = await ingestExternalJob({ externalSystemId: sysAId, wo: woBase({ externalWoId: "WO-A1" }) as never });
    check("A: ingest outcome = ingested", rA.outcome === "ingested");
    const jobAId = rA.outcome === "ingested" ? rA.jobId : "";
    const [jobA] = await db.select().from(jobs).where(eq(jobs.id, jobAId));
    check("A1: job source_type=external_client_portal + sourceExternalId=WO-A1",
      jobA?.sourceType === "external_client_portal" && jobA?.sourceExternalId === "WO-A1");
    const [linkA] = await db.select().from(externalWorkOrderLinks).where(and(eq(externalWorkOrderLinks.externalSystemId, sysAId), eq(externalWorkOrderLinks.externalWoId, "WO-A1")));
    check("A2: ewol link exists, job_id matches, active", linkA?.jobId === jobAId && linkA?.linkStatus === "active");
    check("A3: job landed at NEW (IF-6)", jobA?.currentStatusId === newStatus.id);
    const [woCreatedEvt] = await db.select().from(externalSyncEvents).where(and(eq(externalSyncEvents.externalWoId, "WO-A1"), eq(externalSyncEvents.eventType, "wo_created")));
    // MariaDB json columns round-trip as a raw STRING on read (drizzle does not auto-parse —
    // see drafts.ts:110 / reference-drizzle-sql-fragment-gotchas #7); parse at the boundary.
    const parseMeta = (m: unknown): { resolvedStatusId?: string } =>
      typeof m === "string" ? JSON.parse(m) : ((m ?? {}) as { resolvedStatusId?: string });
    const meta = parseMeta(woCreatedEvt?.metadata);
    check("A4: mapped status RECORDED in sync_event (not applied; job still NEW)",
      meta.resolvedStatusId === newStatus.id && jobA?.currentStatusId === newStatus.id);

    // ════════ B. MAPPING incl F5 ════════
    console.log("\n[B] mapping correctness (incl F5 tenant-dim)");
    check("B1: trade resolved to GLOBAL HVAC id", jobA?.primaryTradeId === hvac.id);
    check("B2: priority resolved to T-A EMERGENCY id", jobA?.priorityId === emergencyA.id);
    const rB = await ingestExternalJob({ externalSystemId: sysBId, wo: woBase({ externalWoId: "WO-B1", externalClientCode: "SUB-B", externalPriorityCode: "P1", externalTradeCode: undefined, raw: { Id: "WO-B1" } }) as never });
    const jobBId = rB.outcome === "ingested" ? rB.jobId : "";
    const [jobB] = await db.select().from(jobs).where(eq(jobs.id, jobBId));
    check("B3: T-B same external code 'P1' → T-B's OWN priority (F5; not A's)",
      jobB?.priorityId === tbPriorityId && jobB?.priorityId !== emergencyA.id);
    check("B4: status resolved to GLOBAL NEW id (recorded)", meta.resolvedStatusId === newStatus.id);

    // ════════ C. TENANT ISOLATION ════════
    console.log("\n[C] tenant isolation");
    const aPrioRowsForB = await db.select().from(externalPriorityMappings).where(and(eq(externalPriorityMappings.externalSystemId, sysAId), eq(externalPriorityMappings.externalCode, "P1")));
    check("C1: sys-A priority mapping query never returns T-B's priority",
      aPrioRowsForB.length === 1 && aPrioRowsForB[0].priorityId === emergencyA.id);
    const crossPush = await pushStatusToExternal({ tenantId: tAId, jobId: jobBId });
    check("C2: cross-tenant push (T-A on T-B job) → JOB_NOT_EXTERNALLY_LINKED",
      crossPush.ok === false && crossPush.error === "JOB_NOT_EXTERNALLY_LINKED");
    check("C3: ingest links only acting tenant's entities (jobA.tenant=T-A, jobB.tenant=T-B)",
      jobA?.tenantId === tAId && jobB?.tenantId === tBId && linkA?.tenantId === tAId);
    const [sysARow] = await db.select().from(externalSystems).where(eq(externalSystems.id, sysAId));
    const [sysBRow] = await db.select().from(externalSystems).where(eq(externalSystems.id, sysBId));
    check("C4: created external rows carry correct tenant_id",
      sysARow?.tenantId === tAId && sysBRow?.tenantId === tBId);

    // ════════ D. NO-CRED-LEAK + OQ-6 ════════
    console.log("\n[D] no-credential-leak + OQ-6");
    // push a real status on jobA (it has an active link + outbound status mapping)
    const pushA = await pushStatusToExternal({ tenantId: tAId, jobId: jobAId });
    const allPayloads = await db.select().from(externalPayloadLogs).where(eq(externalPayloadLogs.tenantId, tAId));
    const payloadBlob = JSON.stringify(allPayloads.map((p) => p.payload));
    check("D1/D2: SECRET_MARKER never appears in any payload_log (ingest+push)", !payloadBlob.includes(SECRET_MARKER));
    const allEvents = await db.select().from(externalSyncEvents).where(eq(externalSyncEvents.tenantId, tAId));
    const evtBlob = JSON.stringify(allEvents.map((e) => e.metadata));
    check("D3: SECRET_MARKER absent from sync_event metadata", !evtBlob.includes(SECRET_MARKER));
    const outboundLogs = allPayloads.filter((p) => p.direction === "outbound");
    const outBlob = JSON.stringify(outboundLogs.map((p) => p.payload)).toLowerCase();
    check("D4: outbound payload_log has no cost/markup/margin/subtotal/total key",
      outboundLogs.length > 0 && !/("markup"|"margin"|"cost"|"subtotal"|"total")/.test(outBlob));
    check("D5: no payload_log (any direction) carries an AR/markup key",
      !/("markup"|"margin"|"subtotal")/.test(payloadBlob.toLowerCase()));

    // ════════ E. LOCKED BEHAVIORS ════════
    console.log("\n[E] locked behaviors");
    // E1 — IF-7 unmapped client → park
    const jobsBeforeE1 = (await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, tAId))).length;
    const clientsBeforeE1 = (await db.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, tAId))).length;
    const rE1 = await ingestExternalJob({ externalSystemId: sysAId, wo: woBase({ externalWoId: "WO-UNMAPPED", externalClientCode: "SUB-UNKNOWN", raw: { Id: "WO-UNMAPPED" } }) as never });
    const jobsAfterE1 = (await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, tAId))).length;
    const clientsAfterE1 = (await db.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, tAId))).length;
    check("E1: unmapped client → parked_unmapped_client, NO job, NO client created",
      rE1.outcome === "parked_unmapped_client" && jobsAfterE1 === jobsBeforeE1 && clientsAfterE1 === clientsBeforeE1);

    // E2 — auto-stub unmapped location with real address
    const rE2 = await ingestExternalJob({ externalSystemId: sysAId, wo: woBase({
      externalWoId: "WO-STUB", externalLocationCode: "STORE-NEW",
      locationName: "Acme New Store", addressLine1: "42 Galaxy Way", city: "Springfield", stateProvince: "IL", postalCode: "62704",
      raw: { Id: "WO-STUB" },
    }) as never });
    check("E2: unmapped location → ingested, auto_created_location flag",
      rE2.outcome === "ingested" && rE2.autoCreatedLocation === true && rE2.flags.includes("auto_created_location"));
    const [stubMap] = await db.select().from(externalLocationMappings).where(and(eq(externalLocationMappings.externalSystemId, sysAId), eq(externalLocationMappings.externalCode, "STORE-NEW")));
    const [stubLoc] = stubMap ? await db.select().from(clientLocations).where(eq(clientLocations.id, stubMap.clientLocationId)) : [];
    check("E2b: auto-stub used the REAL payload address (not placeholder)",
      stubLoc?.addressLine1 === "42 Galaxy Way" && stubLoc?.city === "Springfield");

    // E3 — IF-3 re-ingest same external_wo_id → skip + touch
    const [linkBeforeE3] = await db.select().from(externalWorkOrderLinks).where(and(eq(externalWorkOrderLinks.externalSystemId, sysAId), eq(externalWorkOrderLinks.externalWoId, "WO-A1")));
    const jobsByWoA1Before = (await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.tenantId, tAId), eq(jobs.sourceExternalId, "WO-A1")))).length;
    const rE3 = await ingestExternalJob({ externalSystemId: sysAId, wo: woBase({ externalWoId: "WO-A1" }) as never });
    const jobsByWoA1After = (await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.tenantId, tAId), eq(jobs.sourceExternalId, "WO-A1")))).length;
    const [linkAfterE3] = await db.select().from(externalWorkOrderLinks).where(and(eq(externalWorkOrderLinks.externalSystemId, sysAId), eq(externalWorkOrderLinks.externalWoId, "WO-A1")));
    const touched = !!linkAfterE3?.lastSyncedAt && !!linkBeforeE3?.lastSyncedAt &&
      new Date(linkAfterE3.lastSyncedAt).getTime() >= new Date(linkBeforeE3.lastSyncedAt).getTime();
    check("E3: re-ingest same WO → skipped_already_linked, NO duplicate job, last_synced touched",
      rE3.outcome === "skipped_already_linked" && jobsByWoA1After === jobsByWoA1Before && touched);

    // E4 — adapter resolves
    let adapterResolves = false;
    try { adapterResolves = !!getAdapter("servicechannel"); } catch { adapterResolves = false; }
    check("E4: getAdapter('servicechannel') resolves", adapterResolves);

    // E5 — pushStatus no-op result (and no cred loaded — covered by D1/D2)
    check("E5: pushStatus returns the no-op skeleton result",
      pushA.ok === true && pushA.externalRef === "noop-skeleton");

    // E6 — normalizePayload pure mapping
    const norm = serviceChannelAdapter.normalizePayload({
      Id: "SC-99", SubscriberId: "SUB-XYZ",
      Location: { LocationId: "LOC-7", Name: "Store 7", Address1: "7 Real Rd", City: "Realville", State: "TX", PostalCode: "75001" },
      Status: "OPEN", TradeName: "HVAC", Priority: "P1", Description: "no heat",
    });
    check("E6: normalizePayload maps SubscriberId/LocationId/address/Description correctly",
      norm.externalWoId === "SC-99" && norm.externalClientCode === "SUB-XYZ" &&
      norm.externalLocationCode === "LOC-7" && norm.addressLine1 === "7 Real Rd" &&
      norm.city === "Realville" && norm.problemDescription === "no heat");

    return finish();
  } finally {
    await teardown();
    console.log("[check-external] teardown complete (T-B + external_* removed)");
  }
}

function finish() {
  console.log("");
  console.log(`[check-external] passed: ${passed}`);
  console.log(`[check-external] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-external] PHASE-BLOCKING LEDGER RED ✗ — PHASE BLOCKED");
  } else {
    console.log("[check-external] PHASE-BLOCKING LEDGER GREEN ✓ (source-agnostic / mapping+F5 / isolation / no-leak+OQ-6 / locked behaviors)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => {
    console.error("[check-external] FAILED:", e);
    process.exit(1);
  });
