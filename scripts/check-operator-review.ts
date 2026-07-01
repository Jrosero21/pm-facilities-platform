/**
 * scripts/check-operator-review.ts — Phase 18 OPERATOR REVIEW SURFACES harness.
 *
 * Empirically proves the Phase-18 operator-review surfaces:
 *   A. Cross-job readers — listVendorUpdates returns vendor-origin notes with the correct
 *      #jobNumber·clientName label and EXCLUDES non-vendor + archived notes;
 *      listPendingReviewDraftsDetailed returns pending_review + approved across jobs and
 *      EXCLUDES published / rejected / discarded.
 *   B. Cross-tenant isolation — a tenant-B vendor note + draft never surface for tenant-A.
 *   C. Promotion guards — client_visible / client_and_vendor_visible flip; internal_only /
 *      requires_review / vendor_visible / garbage → INVALID_PROMOTION_TARGET (NO flip);
 *      a cross-tenant noteId → NOTE_NOT_FOUND.
 *   D. Write-boundary / Fork-1 — after a valid promotion, communication_logs AND
 *      client_update_logs are UNCHANGED (NO outbound); job_notes row count unchanged
 *      (UPDATE, not insert); audit_logs +1 exactly (job_note.visibility_promoted with
 *      metadata {jobId, from, to}). This is the proof Fork 1 ships flip+audit ONLY.
 *
 * SANDBOX ONLY (module-top env swap + hard-exit if not _sandbox). Self-seeds two T-A jobs
 * (+ drafts/notes) and a tenant-B fixture; tears down everything it created. NO migration.
 * Mirrors scripts/check-chatbot-assistant.ts. Run: pnpm run db:check:operator-review
 */

// Module marker (WP-13.2): file-scope top-level names — `export {}` makes this a MODULE so
// whole-project tsc doesn't collide them.
export {};

// -------- Sandbox guard + env swap (BEFORE any DB-touching import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-review] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-review] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-review] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

// -------- Tiny assertion framework (mirror check-chatbot) --------
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

function parseMeta(v: unknown): Record<string, unknown> | null {
  // MariaDB JSON is parse-at-read — may arrive as a string.
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return v as Record<string, unknown>;
}

const SEED_TENANT_SLUG = "phase9-seed-tenant";
const T_B_SLUG = "phase18-harness-tenant-b";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, jobs, vendors, users,
    jobStatusHistory, jobEvents, auditLogs,
    updateRewriteDrafts, clientUpdateLogs, communicationLogs,
    jobNotes, agentRuns,
  } = await import("@/server/schema");
  const { eq, and, inArray, count } = await import("drizzle-orm");
  const { createJob } = await import("@/server/jobs");
  const { createJobNote, listVendorUpdates, promoteNoteVisibility, getJobNote } = await import("@/server/job-notes");
  const { listPendingReviewDraftsDetailed } = await import("@/server/agents/drafts");

  // ---- tracked created ids (for teardown) ----
  let tBId: string | null = null;
  const createdJobIds: string[] = [];
  const createdNoteIds: string[] = [];
  const createdRunIds: string[] = [];

  async function teardown() {
    try {
      const ids = [...createdJobIds];
      if (createdRunIds.length) {
        await db.delete(updateRewriteDrafts).where(inArray(updateRewriteDrafts.agentRunId, createdRunIds));
      }
      if (ids.length) {
        await db.delete(updateRewriteDrafts).where(inArray(updateRewriteDrafts.jobId, ids));
        await db.delete(agentRuns).where(inArray(agentRuns.jobId, ids));
        await db.delete(jobNotes).where(inArray(jobNotes.jobId, ids));
        await db.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, ids));
        await db.delete(jobEvents).where(inArray(jobEvents.jobId, ids));
      }
      const auditTargets = [...createdJobIds, ...createdNoteIds];
      if (auditTargets.length) {
        await db.delete(auditLogs).where(inArray(auditLogs.targetId, auditTargets));
      }
      if (createdRunIds.length) {
        await db.delete(agentRuns).where(inArray(agentRuns.id, createdRunIds));
      }
      if (ids.length) {
        await db.delete(jobs).where(inArray(jobs.id, ids));
      }
      if (tBId) {
        const { sql } = await import("drizzle-orm");
        await db.transaction(async (tx) => {
          const tbJobs = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, tBId!));
          const tbJobIds = tbJobs.map((r) => r.id);
          if (tbJobIds.length) {
            await tx.delete(updateRewriteDrafts).where(inArray(updateRewriteDrafts.jobId, tbJobIds));
            await tx.delete(agentRuns).where(inArray(agentRuns.jobId, tbJobIds));
            await tx.delete(jobNotes).where(inArray(jobNotes.jobId, tbJobIds));
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
        });
      }
    } catch (e) {
      console.error("[check-review] teardown warning:", e);
    }
  }

  // Defensive pre-clean: drop a leftover T-B from a prior aborted run.
  {
    const priorTB = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, T_B_SLUG)).limit(1);
    if (priorTB[0]) { tBId = priorTB[0].id; await teardown(); tBId = null; }
  }

  // small helper to insert a draft row at an explicit status (reader test needs all statuses).
  type DraftStatus = "pending_review" | "approved" | "rejected" | "discarded" | "published";
  async function seedDraft(tenantId: string, jobId: string, runId: string, status: DraftStatus): Promise<string> {
    const id = uuidv7();
    await db.insert(updateRewriteDrafts).values({
      id, tenantId, jobId, agentRunId: runId,
      sourceType: "job_note", sourceId: uuidv7(),
      draftContent: `harness draft (${status})`, status,
    });
    return id;
  }
  async function seedRun(tenantId: string, jobId: string): Promise<string> {
    const id = uuidv7();
    await db.insert(agentRuns).values({
      id, tenantId, agentId: "operator_review_harness", status: "succeeded",
      jobId, inputSummary: "check-review seed", startedAt: new Date(),
    });
    createdRunIds.push(id);
    return id;
  }

  try {
    console.log("\n[setup] resolve T-A (seeded) + operator; build 2 T-A jobs (+drafts/notes) + a T-B fixture");
    const [tA] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SEED_TENANT_SLUG));
    check("setup: seeded tenant (T-A) exists", !!tA);
    if (!tA) return finish();
    const tAId = tA.id;

    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    check("setup: seeded operator user", !!operator);
    if (!operator) return finish();

    const loc = (await db.select({ id: clientLocations.id, clientId: clientLocations.clientId })
      .from(clientLocations).where(eq(clientLocations.tenantId, tAId)).limit(1))[0];
    check("setup: T-A has a client location to attach jobs to", !!loc);
    if (!loc) return finish();

    // two T-A jobs so the readers are exercised cross-job.
    const jobA1 = await createJob({
      tenantId: tAId, clientId: loc.clientId, clientLocationId: loc.id,
      problemDescription: "Harness job A1 (operator-review).", createdByUserId: operator.id,
    });
    const jobA2 = await createJob({
      tenantId: tAId, clientId: loc.clientId, clientLocationId: loc.id,
      problemDescription: "Harness job A2 (operator-review).", createdByUserId: operator.id,
    });
    createdJobIds.push(jobA1.id, jobA2.id);
    check("setup: 2 T-A jobs created", !!jobA1.id && !!jobA2.id);

    const runA = await seedRun(tAId, jobA1.id);

    // drafts across statuses + jobs
    const dPending = await seedDraft(tAId, jobA1.id, runA, "pending_review");
    const dApproved = await seedDraft(tAId, jobA2.id, runA, "approved");
    const dPublished = await seedDraft(tAId, jobA1.id, runA, "published");
    const dRejected = await seedDraft(tAId, jobA1.id, runA, "rejected");
    const dDiscarded = await seedDraft(tAId, jobA2.id, runA, "discarded");

    // vendor notes (the inbox source) + exclusion fixtures
    const nInternal = await createJobNote({ tenantId: tAId, jobId: jobA1.id, body: "Vendor: arrived on site.", visibility: "internal_only", origin: "vendor", createdByUserId: operator.id });
    const nReview = await createJobNote({ tenantId: tAId, jobId: jobA2.id, body: "Vendor: needs review before client.", visibility: "requires_review", origin: "vendor", createdByUserId: operator.id });
    const nOperator = await createJobNote({ tenantId: tAId, jobId: jobA1.id, body: "Operator internal note.", visibility: "internal_only", origin: "operator", createdByUserId: operator.id });
    const nGuard = await createJobNote({ tenantId: tAId, jobId: jobA1.id, body: "Vendor: guard-test note.", visibility: "internal_only", origin: "vendor", createdByUserId: operator.id });
    const nBoundary = await createJobNote({ tenantId: tAId, jobId: jobA1.id, body: "Vendor: boundary-test note.", visibility: "internal_only", origin: "vendor", createdByUserId: operator.id });
    // archived vendor note (must be excluded) — insert directly to set status.
    const nArchivedId = uuidv7();
    await db.insert(jobNotes).values({ id: nArchivedId, tenantId: tAId, jobId: jobA1.id, body: "Vendor: archived.", visibility: "internal_only", origin: "vendor", status: "archived", createdByUserId: operator.id });
    createdNoteIds.push(nInternal.id, nReview.id, nOperator.id, nGuard.id, nBoundary.id, nArchivedId);

    // --- T-B fixture (isolation poison) ---
    tBId = uuidv7();
    await db.insert(tenants).values({ id: tBId, name: "Phase18 Harness Tenant B", slug: T_B_SLUG, type: "aggregator", status: "active" });
    const tbClientId = uuidv7();
    await db.insert(clients).values({ id: tbClientId, tenantId: tBId, name: "Harness Client B" });
    const tbLocId = uuidv7();
    await db.insert(clientLocations).values({ id: tbLocId, tenantId: tBId, clientId: tbClientId, name: "B Store", addressLine1: "1 B Rd", city: "Btown", stateProvince: "NY", postalCode: "10001" });
    await db.insert(vendors).values({ id: uuidv7(), tenantId: tBId, name: "Harness Vendor B" });
    const tbJob = await createJob({ tenantId: tBId, clientId: tbClientId, clientLocationId: tbLocId, problemDescription: "Tenant-B private job.", createdByUserId: operator.id });
    const tbRun = uuidv7();
    await db.insert(agentRuns).values({ id: tbRun, tenantId: tBId, agentId: "operator_review_harness", status: "succeeded", jobId: tbJob.id, inputSummary: "T-B seed", startedAt: new Date() });
    const tbNote = await createJobNote({ tenantId: tBId, jobId: tbJob.id, body: "Tenant-B vendor note — must never surface to T-A.", visibility: "internal_only", origin: "vendor", createdByUserId: operator.id });
    const tbDraftId = await seedDraft(tBId, tbJob.id, tbRun, "pending_review");
    check("setup: T-B fixture (job + vendor note + draft) created", !!tbJob.id && !!tbNote.id && !!tbDraftId);

    // ════════ A. CROSS-JOB READERS ════════
    console.log("\n[A] cross-job readers — vendor-updates inbox + pending/approved draft queue");
    const vu = await listVendorUpdates(tAId);
    const vuIds = new Set(vu.map((r) => r.id));
    const vuInternal = vu.find((r) => r.id === nInternal.id);
    check("A1: listVendorUpdates includes the internal_only vendor note", vuIds.has(nInternal.id));
    check("A2: listVendorUpdates includes the requires_review vendor note", vuIds.has(nReview.id));
    check("A3: row carries the #jobNumber · clientName label", !!vuInternal && typeof vuInternal.jobNumber === "number" && typeof vuInternal.clientName === "string" && vuInternal.clientName.length > 0);
    check("A4: EXCLUDES the operator-origin note", !vuIds.has(nOperator.id));
    check("A5: EXCLUDES the archived vendor note", !vuIds.has(nArchivedId));

    const dq = await listPendingReviewDraftsDetailed(tAId);
    const dqIds = new Set(dq.map((r) => r.id));
    check("A6: draft queue includes the pending_review draft", dqIds.has(dPending));
    check("A7: draft queue includes the approved draft (cross-job)", dqIds.has(dApproved));
    check("A8: EXCLUDES published draft", !dqIds.has(dPublished));
    check("A9: EXCLUDES rejected draft", !dqIds.has(dRejected));
    check("A10: EXCLUDES discarded draft", !dqIds.has(dDiscarded));

    // ════════ B. CROSS-TENANT ISOLATION ════════
    console.log("\n[B] cross-tenant isolation — T-B rows never surface for T-A");
    check("B1: listVendorUpdates(T-A) EXCLUDES the T-B vendor note", !vuIds.has(tbNote.id));
    check("B2: listPendingReviewDraftsDetailed(T-A) EXCLUDES the T-B draft", !dqIds.has(tbDraftId));

    // ════════ C. PROMOTION GUARDS ════════
    console.log("\n[C] promotion guards — allowed targets flip; others throw; cross-tenant → NOT_FOUND");
    const p1 = await promoteNoteVisibility({ tenantId: tAId, noteId: nInternal.id, toVisibility: "client_visible", actorUserId: operator.id });
    check("C1: promote → client_visible flips (returned row)", p1.visibility === "client_visible");
    check("C1b: re-read confirms the flip persisted", (await getJobNote(tAId, nInternal.id))?.visibility === "client_visible");
    const p2 = await promoteNoteVisibility({ tenantId: tAId, noteId: nReview.id, toVisibility: "client_and_vendor_visible", actorUserId: operator.id });
    check("C2: promote → client_and_vendor_visible flips", p2.visibility === "client_and_vendor_visible");

    async function throwsWith(toVisibility: string, expected: string): Promise<boolean> {
      try {
        await promoteNoteVisibility({ tenantId: tAId, noteId: nGuard.id, toVisibility, actorUserId: operator.id });
        return false;
      } catch (e) {
        return (e instanceof Error ? e.message : String(e)) === expected;
      }
    }
    check("C3: internal_only → INVALID_PROMOTION_TARGET", await throwsWith("internal_only", "INVALID_PROMOTION_TARGET"));
    check("C4: requires_review → INVALID_PROMOTION_TARGET", await throwsWith("requires_review", "INVALID_PROMOTION_TARGET"));
    check("C5: vendor_visible → INVALID_PROMOTION_TARGET", await throwsWith("vendor_visible", "INVALID_PROMOTION_TARGET"));
    check("C6: garbage value → INVALID_PROMOTION_TARGET", await throwsWith("totally_not_a_visibility", "INVALID_PROMOTION_TARGET"));
    check("C7: nGuard NOT flipped by any rejected attempt (still internal_only)", (await getJobNote(tAId, nGuard.id))?.visibility === "internal_only");

    let notFound = false;
    try {
      await promoteNoteVisibility({ tenantId: tAId, noteId: tbNote.id, toVisibility: "client_visible", actorUserId: operator.id });
    } catch (e) {
      notFound = (e instanceof Error ? e.message : String(e)) === "NOTE_NOT_FOUND";
    }
    check("C8: cross-tenant noteId → NOTE_NOT_FOUND (and no T-A flip)", notFound);

    // ════════ D. WRITE-BOUNDARY / FORK-1 (no outbound) ════════
    console.log("\n[D] write-boundary — promotion is flip + audit ONLY; NO communication/client-update rows");
    const snap = async () => ({
      comms: Number((await db.select({ c: count() }).from(communicationLogs).where(eq(communicationLogs.tenantId, tAId)))[0]?.c ?? 0),
      clientUpdates: Number((await db.select({ c: count() }).from(clientUpdateLogs).where(eq(clientUpdateLogs.tenantId, tAId)))[0]?.c ?? 0),
      notes: Number((await db.select({ c: count() }).from(jobNotes).where(eq(jobNotes.tenantId, tAId)))[0]?.c ?? 0),
      audit: Number((await db.select({ c: count() }).from(auditLogs).where(eq(auditLogs.tenantId, tAId)))[0]?.c ?? 0),
    });
    const before = await snap();
    await promoteNoteVisibility({ tenantId: tAId, noteId: nBoundary.id, toVisibility: "client_visible", actorUserId: operator.id });
    const after = await snap();
    check("D1: communication_logs UNCHANGED (NO outbound sent)", after.comms === before.comms);
    check("D2: client_update_logs UNCHANGED (NO publish)", after.clientUpdates === before.clientUpdates);
    check("D3: job_notes count UNCHANGED (promotion is an UPDATE, not an insert)", after.notes === before.notes);
    check("D4: audit_logs +1 exactly", after.audit === before.audit + 1);
    const auditRow = (await db.select({ action: auditLogs.action, metadata: auditLogs.metadata })
      .from(auditLogs).where(and(eq(auditLogs.targetId, nBoundary.id), eq(auditLogs.action, "job_note.visibility_promoted"))).limit(1))[0];
    const meta = parseMeta(auditRow?.metadata);
    check("D5: audit row is job_note.visibility_promoted", auditRow?.action === "job_note.visibility_promoted");
    check("D6: metadata = {jobId, from:'internal_only', to:'client_visible'}",
      !!meta && meta.jobId === jobA1.id && meta.from === "internal_only" && meta.to === "client_visible");

    return finish();
  } finally {
    await teardown();
    console.log("[check-review] teardown complete (T-A harness rows + T-B fixture removed)");
  }
}

function finish() {
  console.log("");
  console.log(`[check-review] passed: ${passed}`);
  console.log(`[check-review] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-review] PHASE-18 OPERATOR-REVIEW LEDGER RED ✗ — PHASE BLOCKED");
  } else {
    console.log("[check-review] PHASE-18 OPERATOR-REVIEW LEDGER GREEN ✓ (cross-job readers / cross-tenant isolation / promotion guards / write-boundary no-outbound)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => {
    console.error("[check-review] FAILED:", e);
    process.exit(1);
  });
