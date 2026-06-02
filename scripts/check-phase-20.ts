/**
 * scripts/check-phase-20.ts — Phase 20 VENDOR EDGE (photo storage) harness.
 *
 * Proves the Phase-20 real-bytes attachment path against SANDBOX, capture-backend only:
 *   1. Upload happy path — writer with a file → row carries storage_key/checksum/storage_provider/
 *      size/mime, visibility=internal_only, bytes captured under the key, serve → 'url'.
 *   2. Placeholder path — writer with no file → storage_key NULL, placeholder_created audit,
 *      serve → 'placeholder'.
 *   3. Cross-tenant isolation — a tenant-B-scoped vendor serving tenant-A's attachment → 'forbidden'.
 *   4. Author-scope + no existence leak — vendor2 (own assignment, same job) serving vendor1's
 *      attachment → 'forbidden'; a non-existent attachmentId → 'forbidden'; BOTH identical.
 *   5. Write-boundary — captured checksum == stored checksum (no corruption); a FORCED failed put
 *      (STORAGE_FORCE_FAIL=1) writes NO job_attachments row (put-before-insert guard).
 *
 * SANDBOX ONLY (module-top env swap + hard-exit if not _sandbox). STORAGE_CAPTURE=1 forces the
 * CaptureStorageProvider — no real R2, no network. Self-seeds + tears down. Mirrors
 * check-notifications-send.ts. Run: pnpm run db:check:vendor-edge
 */

export {};

// -------- Sandbox guard + capture flag (BEFORE any DB/storage import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-p20] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[check-p20] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
process.env.STORAGE_CAPTURE = "1"; // force CaptureStorageProvider — no real R2, no network.
delete process.env.R2_ACCESS_KEY_ID; // belt-and-suspenders: never construct R2Provider.
console.log(`[check-p20] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

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
const T_B_SLUG = "phase20-harness-tenant-b";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, jobs, vendors, vendorUsers, users,
    jobStatusHistory, jobEvents, auditLogs,
    jobAttachments, jobVendorAssignments, jobVendorAssignmentStatusHistory,
    dispatchAssignmentStatuses, trades,
  } = await import("@/server/schema");
  const { eq, and, inArray, count, sql } = await import("drizzle-orm");
  const { createJob } = await import("@/server/jobs");
  const { createVendorPhotoPlaceholder } = await import("@/server/vendor/create-vendor-photo-placeholder");
  const { getVendorAttachmentUrl } = await import("@/server/vendor/get-vendor-attachment-url");
  const { getCaptured, resetCaptured } = await import("@/lib/integrations/storage");

  let tBId: string | null = null;
  const createdJobIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdVendorIds: string[] = [];
  const createdAttachmentIds: string[] = [];

  async function teardown() {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
        if (createdAttachmentIds.length) {
          await tx.delete(auditLogs).where(inArray(auditLogs.targetId, createdAttachmentIds));
        }
        if (createdJobIds.length) {
          const a = await tx.select({ id: jobVendorAssignments.id }).from(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, createdJobIds));
          const aIds = a.map((r) => r.id);
          if (aIds.length) await tx.delete(jobVendorAssignmentStatusHistory).where(inArray(jobVendorAssignmentStatusHistory.assignmentId, aIds));
          await tx.delete(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, createdJobIds));
          await tx.delete(jobAttachments).where(inArray(jobAttachments.jobId, createdJobIds));
          await tx.delete(auditLogs).where(inArray(auditLogs.targetId, createdJobIds));
          await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, createdJobIds));
          await tx.delete(jobEvents).where(inArray(jobEvents.jobId, createdJobIds));
          await tx.delete(jobs).where(inArray(jobs.id, createdJobIds));
        }
        if (createdVendorIds.length) {
          await tx.delete(vendorUsers).where(inArray(vendorUsers.vendorId, createdVendorIds));
          await tx.delete(vendors).where(inArray(vendors.id, createdVendorIds));
        }
        if (createdUserIds.length) {
          await tx.delete(users).where(inArray(users.id, createdUserIds));
        }
        if (tBId) {
          await tx.delete(vendorUsers).where(eq(vendorUsers.tenantId, tBId!));
          await tx.delete(vendors).where(eq(vendors.tenantId, tBId!));
          await tx.delete(clientLocations).where(eq(clientLocations.tenantId, tBId!));
          await tx.delete(clients).where(eq(clients.tenantId, tBId!));
          await tx.delete(tenants).where(eq(tenants.id, tBId!));
        }
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
      });
    } catch (e) {
      console.error("[check-p20] teardown warning:", e);
    }
  }

  // pre-clean a leftover T-B
  {
    const priorTB = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, T_B_SLUG)).limit(1);
    if (priorTB[0]) { tBId = priorTB[0].id; await teardown(); tBId = null; }
  }

  async function insertAssignment(tenantId: string, jobId: string, vendorId: string, statusId: string, tradeId: string): Promise<string> {
    const id = uuidv7();
    await db.insert(jobVendorAssignments).values({
      id, tenantId, jobId, vendorId, currentStatusId: statusId,
      matchedTradeId: tradeId, matchedTradeWasPrimary: false,
      tightestGeoAtDispatch: "national", matchedGeoTypesAtDispatch: ["national"],
      complianceStatusAtDispatch: "ok", sentAt: new Date(),
    });
    return id;
  }
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]); // tiny fake png bytes

  try {
    console.log("\n[setup] resolve T-A + reference data; build vendors/users/job/assignments + T-B");
    const [tA] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SEED_TENANT_SLUG));
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const loc = (await db.select({ id: clientLocations.id, clientId: clientLocations.clientId }).from(clientLocations).where(eq(clientLocations.tenantId, tA?.id ?? "")).limit(1))[0];
    const [sentStatus] = await db.select({ id: dispatchAssignmentStatuses.id }).from(dispatchAssignmentStatuses).where(eq(dispatchAssignmentStatuses.code, "SENT"));
    const [trade] = await db.select({ id: trades.id }).from(trades).limit(1);
    check("setup: T-A + operator + location + SENT status + trade exist", !!tA && !!operator && !!loc && !!sentStatus && !!trade);
    if (!tA || !operator || !loc || !sentStatus || !trade) return finish();
    const tAId = tA.id;

    // two vendors + two vendor users (author-scope)
    const vendor1 = uuidv7(); const vendor2 = uuidv7();
    await db.insert(vendors).values({ id: vendor1, tenantId: tAId, name: "P20 Vendor 1" });
    await db.insert(vendors).values({ id: vendor2, tenantId: tAId, name: "P20 Vendor 2" });
    createdVendorIds.push(vendor1, vendor2);
    const user1 = uuidv7(); const user2 = uuidv7();
    await db.insert(users).values({ id: user1, name: "P20 Vendor1 User", email: `p20-v1-${user1}@harness.test` });
    await db.insert(users).values({ id: user2, name: "P20 Vendor2 User", email: `p20-v2-${user2}@harness.test` });
    createdUserIds.push(user1, user2);
    await db.insert(vendorUsers).values({ tenantId: tAId, userId: user1, vendorId: vendor1 });
    await db.insert(vendorUsers).values({ tenantId: tAId, userId: user2, vendorId: vendor2 });

    const job = await createJob({ tenantId: tAId, clientId: loc.clientId, clientLocationId: loc.id, problemDescription: "P20 harness job", createdByUserId: operator.id });
    createdJobIds.push(job.id);
    const a1 = await insertAssignment(tAId, job.id, vendor1, sentStatus.id, trade.id); // vendor1 acts
    const a2 = await insertAssignment(tAId, job.id, vendor2, sentStatus.id, trade.id); // vendor2 acts (same job)
    check("setup: 2 vendors/users + job + 2 assignments created", !!a1 && !!a2);

    const scope1 = new Set([vendor1]);
    const scope2 = new Set([vendor2]);

    // ════════ 1. UPLOAD HAPPY PATH ════════
    console.log("\n[1] upload happy path (capture backend)");
    resetCaptured();
    const up = await createVendorPhotoPlaceholder({
      assignmentId: a1, tenantId: tAId, vendorScope: scope1, actor: { kind: "user", userId: user1 },
      title: "Before service", file: { bytes: PNG, contentType: "image/png", size: PNG.length },
    });
    createdAttachmentIds.push(up.id);
    const [row1] = await db.select().from(jobAttachments).where(eq(jobAttachments.id, up.id));
    check("1a: storage_key/checksum/storage_provider/size/mime all non-null",
      !!row1.storageKey && !!row1.checksum && !!row1.storageProvider && row1.fileSizeBytes != null && !!row1.fileMimeType);
    check("1b: visibility === internal_only", row1.visibility === "internal_only");
    check("1c: storageProvider === 'capture' (no real R2)", row1.storageProvider === "capture");
    const cap = getCaptured();
    check("1d: getCaptured() has the bytes under the row's storage_key", cap.has(row1.storageKey!) && cap.get(row1.storageKey!)?.size === PNG.length);
    const served1 = await getVendorAttachmentUrl({ assignmentId: a1, attachmentId: up.id, tenantId: tAId, vendorScope: scope1 });
    check("1e: serve → kind 'url'", served1.kind === "url");

    // ════════ 2. PLACEHOLDER PATH ════════
    console.log("\n[2] placeholder path (no file)");
    resetCaptured();
    const ph = await createVendorPhotoPlaceholder({ assignmentId: a1, tenantId: tAId, vendorScope: scope1, actor: { kind: "user", userId: user1 }, title: "Placeholder only" });
    createdAttachmentIds.push(ph.id);
    const [rowPh] = await db.select().from(jobAttachments).where(eq(jobAttachments.id, ph.id));
    check("2a: storage_key NULL (placeholder)", rowPh.storageKey === null);
    const [phAudit] = await db.select({ action: auditLogs.action }).from(auditLogs)
      .where(and(eq(auditLogs.targetId, ph.id), eq(auditLogs.action, "job_attachment.placeholder_created"))).limit(1);
    check("2b: job_attachment.placeholder_created audit written", phAudit?.action === "job_attachment.placeholder_created");
    const servedPh = await getVendorAttachmentUrl({ assignmentId: a1, attachmentId: ph.id, tenantId: tAId, vendorScope: scope1 });
    check("2c: serve → kind 'placeholder'", servedPh.kind === "placeholder");

    // ════════ 3. CROSS-TENANT ISOLATION ════════
    console.log("\n[3] cross-tenant isolation");
    tBId = uuidv7();
    await db.insert(tenants).values({ id: tBId, name: "P20 Harness Tenant B", slug: T_B_SLUG, type: "aggregator", status: "active" });
    const vendorB = uuidv7();
    await db.insert(vendors).values({ id: vendorB, tenantId: tBId, name: "P20 Vendor B" });
    const servedX = await getVendorAttachmentUrl({ assignmentId: a1, attachmentId: up.id, tenantId: tBId, vendorScope: new Set([vendorB]) });
    check("3a: tenant-B scope serving T-A attachment → 'forbidden'", servedX.kind === "forbidden");

    // ════════ 4. AUTHOR-SCOPE + NO EXISTENCE LEAK ════════
    console.log("\n[4] author-scope + no existence leak");
    // vendor2 acts on its OWN assignment (a2, same job) but did NOT upload up.id (user1 did).
    const servedAuthor = await getVendorAttachmentUrl({ assignmentId: a2, attachmentId: up.id, tenantId: tAId, vendorScope: scope2 });
    const servedMissing = await getVendorAttachmentUrl({ assignmentId: a1, attachmentId: uuidv7(), tenantId: tAId, vendorScope: scope1 });
    check("4a: vendor2 serving vendor1's attachment (same job) → 'forbidden'", servedAuthor.kind === "forbidden");
    check("4b: non-existent attachmentId → 'forbidden'", servedMissing.kind === "forbidden");
    check("4c: out-of-scope and missing return the IDENTICAL kind (no existence leak)", servedAuthor.kind === servedMissing.kind);

    // ════════ 5. WRITE-BOUNDARY ════════
    console.log("\n[5] write-boundary — checksum integrity + failed-put guard");
    // The checksum stored on the row must equal sha256(bytes) — the bytes the capture provider
    // hashed are the same bytes the writer persisted (no corruption through the path).
    const { createHash } = await import("node:crypto");
    const expectedChecksum = createHash("sha256").update(PNG).digest("hex");
    check("5a: stored checksum == sha256(bytes) (no corruption through the path)", row1.checksum === expectedChecksum);
    // forced failed put → NO row written
    const beforeCount = Number((await db.select({ c: count() }).from(jobAttachments).where(eq(jobAttachments.jobId, job.id)))[0]?.c ?? 0);
    process.env.STORAGE_FORCE_FAIL = "1";
    let threwPutFailed = false;
    try {
      await createVendorPhotoPlaceholder({ assignmentId: a1, tenantId: tAId, vendorScope: scope1, actor: { kind: "user", userId: user1 }, title: "should not persist", file: { bytes: PNG, contentType: "image/png", size: PNG.length } });
    } catch (e) {
      threwPutFailed = (e as Error).message === "STORAGE_PUT_FAILED";
    } finally {
      delete process.env.STORAGE_FORCE_FAIL;
    }
    const afterCount = Number((await db.select({ c: count() }).from(jobAttachments).where(eq(jobAttachments.jobId, job.id)))[0]?.c ?? 0);
    check("5b: forced failed put throws STORAGE_PUT_FAILED", threwPutFailed);
    check("5c: NO job_attachments row written on failed put (put-before-insert)", afterCount === beforeCount);

    return finish();
  } finally {
    await teardown();
    console.log("[check-p20] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-p20] passed: ${passed}`);
  console.log(`[check-p20] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-p20] PHASE-20 VENDOR-EDGE LEDGER RED ✗ — PHASE BLOCKED");
  } else {
    console.log("[check-p20] PHASE-20 VENDOR-EDGE LEDGER GREEN ✓ (upload / placeholder / cross-tenant / author-scope+no-leak / write-boundary)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => {
    console.error("[check-p20] FAILED:", e);
    process.exit(1);
  });
