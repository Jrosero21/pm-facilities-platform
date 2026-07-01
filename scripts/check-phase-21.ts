/**
 * scripts/check-phase-21.ts — Phase 21 MAGIC-LINK (linkless vendor access) harness.
 *
 * The heaviest harness in v2 — the security negatives are NOT softened:
 *   1. Token happy path + clock (mint → resolve {ok, assignment}; mint(-1) → {ok:false} expired).
 *   2. The four negatives → uniform {ok:false}: expired, revoked, tampered/forged, and
 *      foreign-assignment (three confinement asserts: bind / read-confine / write-confine).
 *   3. Linkless write provenance: source_token_id = tokenId AND created_by/uploaded_by NULL.
 *   4. Shared-job read isolation: a token sees ONLY its own source_token_id rows on a shared job.
 *   5. Cross-tenant: a tenant-B token resolves to B; a tenant-A read/revoke can't reach it.
 *   6. Send + idempotency (capture): sent_at set + link in the email; the sent_at isNull guard and
 *      the provider_message_id send short-circuit.
 *   7. MISSING_RECIPIENT (no orphan token): a no-email contact → throw, zero tokens minted.
 *   8. No-leak symmetry: a random attachment id → forbidden (same as the wrong-token case).
 *
 * SANDBOX ONLY. BOTH capture backends forced (no real R2, no real email). Self-seed + teardown.
 * Mirrors scripts/check-phase-20.ts. Run: pnpm run db:check:magic-link
 */

export {};

// -------- Sandbox guard + capture flags (BEFORE any DB/storage/send import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-p21] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-p21] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
process.env.STORAGE_CAPTURE = "1"; // CaptureStorageProvider — no real R2.
delete process.env.R2_ACCESS_KEY_ID;
process.env.SEND_CAPTURE = "1"; // CaptureProvider — no real email.
delete process.env.RESEND_API_KEY;
console.log(`[check-p21] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

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
const T_B_SLUG = "phase21-harness-tenant-b";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, jobs, vendors, vendorContacts, users,
    jobStatusHistory, jobEvents, auditLogs, jobNotes, jobAttachments,
    jobVendorAssignments, jobVendorAssignmentStatusHistory, dispatchAssignmentStatuses, trades,
    magicLinkTokens, communicationLogs, outboundMessages,
  } = await import("@/server/schema");
  const { eq, and, inArray, count, isNull, sql } = await import("drizzle-orm");
  const { createJob } = await import("@/server/jobs");
  const { mintToken, resolveMagicLinkToken, revokeToken } = await import("@/server/magic-links/token-core");
  const { getAssignmentDetail } = await import("@/server/dispatch");
  const { createVendorNote } = await import("@/server/vendor/create-vendor-note");
  const { createVendorPhotoPlaceholder } = await import("@/server/vendor/create-vendor-photo-placeholder");
  const { listLinkNotes, listLinkAttachments, getLinklessAttachmentUrl } = await import("@/server/magic-links/link-surface");
  const { sendAssignmentLink } = await import("@/server/magic-links/send-link");
  const { sendCommunication } = await import("@/server/communications");
  const { getCaptured: storageCaptured, resetCaptured: storageReset } = await import("@/lib/integrations/storage");
  const { getCaptured: sendCaptured, resetCaptured: sendReset } = await import("@/lib/integrations/send");

  let tBId: string | null = null;
  const createdJobIds: string[] = [];
  const createdVendorIds: string[] = [];

  // Replicates resolveLinkContext (the route's spine): resolve → assignment → scope + actor.
  async function linkContext(rawToken: string) {
    const res = await resolveMagicLinkToken(rawToken);
    if (!res.ok) return null;
    const asg = await getAssignmentDetail(res.tenantId, res.assignmentId);
    if (!asg) return null;
    return {
      tenantId: res.tenantId,
      assignmentId: res.assignmentId,
      vendorScope: new Set([asg.vendorId]),
      actor: { kind: "linkless" as const, tokenId: res.tokenId },
    };
  }

  async function teardown() {
    try {
      await db.transaction(async (tx) => {
        const allJobIds = [...createdJobIds];
        if (tBId) {
          const tbj = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, tBId!));
          allJobIds.push(...tbj.map((r) => r.id));
        }
        if (allJobIds.length) {
          const aRows = await tx.select({ id: jobVendorAssignments.id }).from(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, allJobIds));
          const aIds = aRows.map((r) => r.id);
          if (aIds.length) {
            await tx.delete(magicLinkTokens).where(inArray(magicLinkTokens.assignmentId, aIds));
            await tx.delete(jobVendorAssignmentStatusHistory).where(inArray(jobVendorAssignmentStatusHistory.assignmentId, aIds));
          }
          await tx.delete(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, allJobIds));
          await tx.delete(jobAttachments).where(inArray(jobAttachments.jobId, allJobIds));
          await tx.delete(jobNotes).where(inArray(jobNotes.jobId, allJobIds));
          await tx.delete(communicationLogs).where(inArray(communicationLogs.jobId, allJobIds));
          await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, allJobIds));
          await tx.delete(jobEvents).where(inArray(jobEvents.jobId, allJobIds));
          await tx.delete(jobs).where(inArray(jobs.id, allJobIds));
        }
        if (createdVendorIds.length) {
          await tx.delete(vendorContacts).where(inArray(vendorContacts.vendorId, createdVendorIds));
          await tx.delete(magicLinkTokens).where(inArray(magicLinkTokens.tenantId, tBId ? [tBId] : []));
          await tx.delete(vendors).where(inArray(vendors.id, createdVendorIds));
        }
        if (tBId) {
          await tx.delete(outboundMessages).where(eq(outboundMessages.tenantId, tBId!));
          await tx.delete(vendors).where(eq(vendors.tenantId, tBId!));
          await tx.delete(clientLocations).where(eq(clientLocations.tenantId, tBId!));
          await tx.delete(clients).where(eq(clients.tenantId, tBId!));
          await tx.delete(tenants).where(eq(tenants.id, tBId!));
        }
      });
    } catch (e) {
      console.error("[check-p21] teardown warning:", e);
    }
  }

  // pre-clean a leftover T-B
  {
    const priorTB = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, T_B_SLUG)).limit(1);
    if (priorTB[0]) { tBId = priorTB[0].id; await teardown(); tBId = null; }
  }

  async function insertAssignment(tenantId: string, jobId: string, vendorId: string, statusId: string, tradeId: string, contactId: string | null): Promise<string> {
    const id = uuidv7();
    await db.insert(jobVendorAssignments).values({
      id, tenantId, jobId, vendorId, currentStatusId: statusId,
      vendorContactId: contactId,
      matchedTradeId: tradeId, matchedTradeWasPrimary: false,
      tightestGeoAtDispatch: "national", matchedGeoTypesAtDispatch: ["national"],
      complianceStatusAtDispatch: "ok", sentAt: new Date(),
    });
    return id;
  }
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

  try {
    console.log("\n[setup] T-A + ref data; vendors/contacts/job/2 assignments + a no-email + T-B");
    const [tA] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SEED_TENANT_SLUG));
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const loc = (await db.select({ id: clientLocations.id, clientId: clientLocations.clientId }).from(clientLocations).where(eq(clientLocations.tenantId, tA?.id ?? "")).limit(1))[0];
    const [sentStatus] = await db.select({ id: dispatchAssignmentStatuses.id }).from(dispatchAssignmentStatuses).where(eq(dispatchAssignmentStatuses.code, "SENT"));
    const [trade] = await db.select({ id: trades.id }).from(trades).limit(1);
    check("setup: T-A + operator + location + SENT status + trade exist", !!tA && !!operator && !!loc && !!sentStatus && !!trade);
    if (!tA || !operator || !loc || !sentStatus || !trade) return finish();
    const tAId = tA.id;

    const vendor1 = uuidv7(); const vendor2 = uuidv7();
    await db.insert(vendors).values({ id: vendor1, tenantId: tAId, name: "P21 Vendor 1" });
    await db.insert(vendors).values({ id: vendor2, tenantId: tAId, name: "P21 Vendor 2" });
    createdVendorIds.push(vendor1, vendor2);
    const contact1 = uuidv7(); const contactNoEmail = uuidv7();
    await db.insert(vendorContacts).values({ id: contact1, tenantId: tAId, vendorId: vendor1, name: "Contact w/ email", email: "v1-contact@harness.test" });
    await db.insert(vendorContacts).values({ id: contactNoEmail, tenantId: tAId, vendorId: vendor1, name: "Contact no email" });

    const job = await createJob({ tenantId: tAId, clientId: loc.clientId, clientLocationId: loc.id, problemDescription: "P21 harness job", createdByUserId: operator.id });
    createdJobIds.push(job.id);
    const a1 = await insertAssignment(tAId, job.id, vendor1, sentStatus.id, trade.id, contact1);       // vendor1, contact w/ email
    const a2 = await insertAssignment(tAId, job.id, vendor2, sentStatus.id, trade.id, null);            // vendor2, shared job
    const a3 = await insertAssignment(tAId, job.id, vendor1, sentStatus.id, trade.id, contactNoEmail);  // no-email contact
    check("setup: job + 3 assignments (a1 w/email, a2 vendor2, a3 no-email)", !!a1 && !!a2 && !!a3);

    // mint + write through tokenA1 and tokenA2 (shared job, two vendors) up front.
    const mA1 = await mintToken({ tenantId: tAId, assignmentId: a1, expiresInSeconds: 604800, createdByUserId: operator.id });
    const mA2 = await mintToken({ tenantId: tAId, assignmentId: a2, expiresInSeconds: 604800, createdByUserId: operator.id });
    const ctxA1 = await linkContext(mA1.rawToken);
    const ctxA2 = await linkContext(mA2.rawToken);
    if (!ctxA1 || !ctxA2) { check("setup: link contexts resolved", false); return finish(); }
    storageReset();
    const noteA1 = await createVendorNote({ assignmentId: ctxA1.assignmentId, tenantId: ctxA1.tenantId, vendorScope: ctxA1.vendorScope, actor: ctxA1.actor, body: "linkless note A1" });
    const photoA1 = await createVendorPhotoPlaceholder({ assignmentId: ctxA1.assignmentId, tenantId: ctxA1.tenantId, vendorScope: ctxA1.vendorScope, actor: ctxA1.actor, title: "photo A1", file: { bytes: PNG, contentType: "image/png", size: PNG.length } });
    const noteA2 = await createVendorNote({ assignmentId: ctxA2.assignmentId, tenantId: ctxA2.tenantId, vendorScope: ctxA2.vendorScope, actor: ctxA2.actor, body: "linkless note A2" });
    const photoA2 = await createVendorPhotoPlaceholder({ assignmentId: ctxA2.assignmentId, tenantId: ctxA2.tenantId, vendorScope: ctxA2.vendorScope, actor: ctxA2.actor, title: "photo A2", file: { bytes: PNG, contentType: "image/png", size: PNG.length } });

    // ════════ 1. TOKEN HAPPY PATH + CLOCK ════════
    console.log("\n[1] token happy path + clock");
    const resA1 = await resolveMagicLinkToken(mA1.rawToken);
    check("1a: valid token resolves {ok:true} bound to its assignment", resA1.ok === true && resA1.ok && resA1.assignmentId === a1);
    const mExpired = await mintToken({ tenantId: tAId, assignmentId: a1, expiresInSeconds: -1, createdByUserId: operator.id });
    const resExp = await resolveMagicLinkToken(mExpired.rawToken);
    check("1b: expired token (mint -1) resolves {ok:false}", resExp.ok === false);

    // ════════ 2. THE FOUR NEGATIVES ════════
    console.log("\n[2] the four negatives → uniform {ok:false} / rejection");
    check("2-expired: {ok:false}", resExp.ok === false); // from group 1
    const mRev = await mintToken({ tenantId: tAId, assignmentId: a1, expiresInSeconds: 604800, createdByUserId: operator.id });
    await revokeToken({ tokenId: mRev.tokenId, tenantId: tAId });
    check("2-revoked: revoked token resolves {ok:false}", (await resolveMagicLinkToken(mRev.rawToken)).ok === false);
    check("2-tampered: random 64-hex → {ok:false}", (await resolveMagicLinkToken("a".repeat(64))).ok === false);
    const flipped = (mA1.rawToken[0] === "0" ? "1" : "0") + mA1.rawToken.slice(1);
    check("2-tampered: real token, one char flipped → {ok:false}", (await resolveMagicLinkToken(flipped)).ok === false);
    // foreign-assignment: (a) bind, (b) read-confine, (c) write-confine
    check("2-foreign-a (bind): resolve(tokenA1).assignmentId === a1", resA1.ok && resA1.assignmentId === a1);
    const fa = await getLinklessAttachmentUrl(tAId, photoA2.id, ctxA1.actor.tokenId);
    check("2-foreign-b (read-confine): tokenA1 cannot presign a2's photo → forbidden", fa.kind === "forbidden");
    let writeConfined = false;
    try {
      await createVendorNote({ assignmentId: a2, tenantId: tAId, vendorScope: new Set([vendor1]), actor: ctxA1.actor, body: "should be blocked" });
    } catch (e) {
      writeConfined = (e as Error).message === "VENDOR_SCOPE_MISMATCH";
    }
    check("2-foreign-c (write-confine): tokenA1 scope cannot write a2 → VENDOR_SCOPE_MISMATCH", writeConfined);

    // ════════ 3. LINKLESS WRITE PROVENANCE ════════
    console.log("\n[3] linkless write provenance (source_token_id + NULL author)");
    const [nA1row] = await db.select().from(jobNotes).where(eq(jobNotes.id, noteA1.id));
    const [pA1row] = await db.select().from(jobAttachments).where(eq(jobAttachments.id, photoA1.id));
    check("3a: note has source_token_id = tokenA1 AND created_by_user_id NULL", nA1row.sourceTokenId === ctxA1.actor.tokenId && nA1row.createdByUserId === null);
    check("3b: photo has source_token_id = tokenA1 AND uploaded_by_user_id NULL", pA1row.sourceTokenId === ctxA1.actor.tokenId && pA1row.uploadedByUserId === null);
    check("3c: storage capture holds the photo bytes", storageCaptured().has(pA1row.storageKey!));

    // ════════ 4. SHARED-JOB READ ISOLATION ════════
    console.log("\n[4] shared-job read isolation (source_token_id gating)");
    const notesA1 = await listLinkNotes(tAId, ctxA1.actor.tokenId);
    const notesA2 = await listLinkNotes(tAId, ctxA2.actor.tokenId);
    check("4a: tokenA1 sees ONLY its note (not a2's)", notesA1.length === 1 && notesA1[0].id === noteA1.id);
    check("4b: tokenA2 sees ONLY its note (not a1's)", notesA2.length === 1 && notesA2[0].id === noteA2.id);
    check("4c: tokenA1 presigns its OWN photo → url", (await getLinklessAttachmentUrl(tAId, photoA1.id, ctxA1.actor.tokenId)).kind === "url");
    check("4d: tokenA1 CANNOT presign a2's photo (shared job) → forbidden", (await getLinklessAttachmentUrl(tAId, photoA2.id, ctxA1.actor.tokenId)).kind === "forbidden");

    // ════════ 5. CROSS-TENANT ════════
    console.log("\n[5] cross-tenant isolation");
    tBId = uuidv7();
    await db.insert(tenants).values({ id: tBId, name: "P21 Harness Tenant B", slug: T_B_SLUG, type: "aggregator", status: "active" });
    const tbClient = uuidv7();
    await db.insert(clients).values({ id: tbClient, tenantId: tBId, name: "Harness Client B" });
    const tbLoc = uuidv7();
    await db.insert(clientLocations).values({ id: tbLoc, tenantId: tBId, clientId: tbClient, name: "B Store", addressLine1: "1 B Rd", city: "Btown", stateProvince: "NY", postalCode: "10001" });
    const vendorB = uuidv7();
    await db.insert(vendors).values({ id: vendorB, tenantId: tBId, name: "P21 Vendor B" });
    const tbJob = await createJob({ tenantId: tBId, clientId: tbClient, clientLocationId: tbLoc, problemDescription: "T-B job", createdByUserId: operator.id });
    const bAsg = await insertAssignment(tBId, tbJob.id, vendorB, sentStatus.id, trade.id, null);
    const mTB = await mintToken({ tenantId: tBId, assignmentId: bAsg, expiresInSeconds: 604800, createdByUserId: operator.id });
    const ctxTB = await linkContext(mTB.rawToken);
    if (ctxTB) await createVendorNote({ assignmentId: ctxTB.assignmentId, tenantId: ctxTB.tenantId, vendorScope: ctxTB.vendorScope, actor: ctxTB.actor, body: "tenant-B linkless note" });
    const resTB = await resolveMagicLinkToken(mTB.rawToken);
    check("5a: tenant-B token resolves to tenant B", resTB.ok === true && resTB.ok && resTB.tenantId === tBId);
    check("5b: tenant-A read of a tenant-B token → empty (tenant-scoped)", (await listLinkNotes(tAId, mTB.tokenId)).length === 0);
    check("5c: tenant-B read of its own token → non-empty", (await listLinkNotes(tBId, mTB.tokenId)).length === 1);
    check("5d: cross-tenant revoke → {revoked:false}", (await revokeToken({ tokenId: mTB.tokenId, tenantId: tAId })).revoked === false);
    check("5e: same-tenant revoke → {revoked:true}", (await revokeToken({ tokenId: mTB.tokenId, tenantId: tBId })).revoked === true);

    // ════════ 6. SEND + IDEMPOTENCY (capture) ════════
    console.log("\n[6] send + idempotency (capture backend)");
    sendReset();
    const sent = await sendAssignmentLink({ tenantId: tAId, assignmentId: a1, actorUserId: operator.id });
    const [sentTok] = await db.select({ sentAt: magicLinkTokens.sentAt }).from(magicLinkTokens).where(eq(magicLinkTokens.id, sent.tokenId));
    check("6a: sendAssignmentLink reports sent", sent.deliveryStatus === "sent");
    check("6b: token sent_at set", sentTok.sentAt != null);
    const cap = sendCaptured();
    check("6c: send capture body contains the /link/ URL", cap.length >= 1 && cap[cap.length - 1].body.includes("/link/"));
    const guard = await db.update(magicLinkTokens).set({ sentAt: sql`now()` }).where(and(eq(magicLinkTokens.id, sent.tokenId), isNull(magicLinkTokens.sentAt)));
    check("6d: link-level idempotency — 2nd sent_at guard affects 0 rows", guard.rowCount === 0);
    // send-level idempotency: compose a comm, send twice → 2nd short-circuits.
    sendReset();
    const omId = uuidv7();
    await db.insert(outboundMessages).values({ id: omId, tenantId: tAId, subject: "x", body: "https://x/link/abc", createdByUserId: operator.id });
    const clId = uuidv7();
    await db.insert(communicationLogs).values({ id: clId, tenantId: tAId, jobId: job.id, channel: "email", direction: "outbound", sourceType: "outbound_message", sourceId: omId, summary: "idem test", recipientType: "vendor_contact", recipientEmail: "x@harness.test", deliveryStatus: "draft" });
    await sendCommunication({ tenantId: tAId, commId: clId, actorUserId: operator.id });
    await sendCommunication({ tenantId: tAId, commId: clId, actorUserId: operator.id }); // 2nd → short-circuit
    check("6e: send-level idempotency — double sendCommunication = ONE capture", sendCaptured().length === 1);

    // ════════ 7. MISSING_RECIPIENT (no orphan token) ════════
    console.log("\n[7] missing recipient → no orphan token");
    const before = Number((await db.select({ c: count() }).from(magicLinkTokens).where(eq(magicLinkTokens.assignmentId, a3)))[0]?.c ?? 0);
    let missRcpt = false;
    try { await sendAssignmentLink({ tenantId: tAId, assignmentId: a3, actorUserId: operator.id }); }
    catch (e) { missRcpt = (e as Error).message === "MISSING_RECIPIENT"; }
    const after = Number((await db.select({ c: count() }).from(magicLinkTokens).where(eq(magicLinkTokens.assignmentId, a3)))[0]?.c ?? 0);
    check("7a: no-email contact → MISSING_RECIPIENT", missRcpt);
    check("7b: ZERO tokens minted for the no-recipient assignment", after === before);

    // ════════ 8. NO-LEAK SYMMETRY ════════
    console.log("\n[8] no-existence-leak symmetry");
    check("8a: random non-existent attachment id → forbidden (same as wrong-token)", (await getLinklessAttachmentUrl(tAId, uuidv7(), ctxA1.actor.tokenId)).kind === "forbidden");

    return finish();
  } finally {
    await teardown();
    console.log("[check-p21] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-p21] passed: ${passed}`);
  console.log(`[check-p21] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-p21] PHASE-21 MAGIC-LINK LEDGER RED ✗ — PHASE BLOCKED");
  } else {
    console.log("[check-p21] PHASE-21 MAGIC-LINK LEDGER GREEN ✓ (clock / 4 negatives / provenance / shared-job isolation / cross-tenant / send-idempotency / missing-recipient / no-leak)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => {
    console.error("[check-p21] FAILED:", e);
    process.exit(1);
  });
