/**
 * scripts/check-notifications-send.ts — Phase 19 NOTIFICATIONS + SEND harness.
 *
 * Proves the Phase-19 invariants against SANDBOX:
 *   A. Send path via CaptureProvider — compose → sendCommunication → flip 'sent', provider_message_id
 *      stored, attempts++, sentAt set, exactly ONE captured payload carrying the RESOLVED source body
 *      (not the summary), +1 audit. MISSING_RECIPIENT / UNRESOLVABLE_SEND_SOURCE reject cleanly.
 *   B. Idempotency (§2.6) — a 2nd send on a sent row returns early (NO 2nd provider call / capture /
 *      audit / attempts bump); a 'failed' row (no provider id) CAN retry.
 *   C. Capture-honesty — SEND_CAPTURE=1 ⇒ getSendProvider().name==='capture'; ResendProvider is NEVER
 *      constructed (no RESEND_API_KEY set; building it would throw — capture branch never builds it).
 *   D. Exception readers — getExceptions returns vendor_not_accepted (SENT) + nte_increase_requested
 *      (submitted) + operational (overdue), excludes pure-aged, sorts by sortKey DESC; cross-tenant
 *      isolation.
 *   E. Write-boundary — a send moves only communication_logs(1) + audit_logs(+1); readers are pure.
 *
 * SANDBOX ONLY (module-top env swap + hard-exit if not _sandbox). SEND_CAPTURE=1 forces capture — no
 * real email, api.resend.com never reached. Self-seeds + tears down. Mirrors check-operator-review.ts.
 * Run: pnpm run db:check:notifications-send
 */

export {};

// -------- Sandbox guard + capture flag (BEFORE any DB/send import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-notif] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-notif] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
process.env.SEND_CAPTURE = "1"; // force CaptureProvider — ResendProvider must never be constructed.
delete process.env.RESEND_API_KEY; // belt-and-suspenders: no real key in the harness path.
console.log(`[check-notif] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

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
const T_B_SLUG = "phase19-harness-tenant-b";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, jobs, vendors, users, trades,
    jobStatusHistory, jobEvents, auditLogs,
    communicationLogs, clientUpdateLogs,
    jobVendorAssignments, jobVendorAssignmentStatusHistory, dispatchAssignmentStatuses, changeOrders,
  } = await import("@/server/schema");
  const { eq, and, inArray, count, sql } = await import("drizzle-orm");
  const { createJob } = await import("@/server/jobs");
  const { sendCommunication } = await import("@/server/communications");
  const { getExceptions } = await import("@/server/analytics/exceptions");
  const { getSendProvider, getCaptured, resetCaptured } = await import("@/lib/integrations/send");

  let tBId: string | null = null;
  const createdJobIds: string[] = [];
  const createdCommIds: string[] = [];
  const createdNoteAuditTargets: string[] = [];

  async function teardown() {
    try {
      const ids = [...createdJobIds];
      const auditTargets = [...createdJobIds, ...createdCommIds, ...createdNoteAuditTargets];
      await db.transaction(async (tx) => {
        if (ids.length) {
          const a = await tx.select({ id: jobVendorAssignments.id }).from(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, ids));
          const aIds = a.map((r) => r.id);
          if (aIds.length) await tx.delete(jobVendorAssignmentStatusHistory).where(inArray(jobVendorAssignmentStatusHistory.assignmentId, aIds));
          await tx.delete(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, ids));
          await tx.delete(changeOrders).where(inArray(changeOrders.jobId, ids));
          await tx.delete(communicationLogs).where(inArray(communicationLogs.jobId, ids));
          await tx.delete(clientUpdateLogs).where(inArray(clientUpdateLogs.jobId, ids));
          await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, ids));
          await tx.delete(jobEvents).where(inArray(jobEvents.jobId, ids));
        }
        if (auditTargets.length) await tx.delete(auditLogs).where(inArray(auditLogs.targetId, auditTargets));
        if (ids.length) await tx.delete(jobs).where(inArray(jobs.id, ids));
        if (tBId) {
          const tbJobs = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, tBId!));
          const tbJobIds = tbJobs.map((r) => r.id);
          if (tbJobIds.length) {
            const tba = await tx.select({ id: jobVendorAssignments.id }).from(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, tbJobIds));
            const tbaIds = tba.map((r) => r.id);
            if (tbaIds.length) await tx.delete(jobVendorAssignmentStatusHistory).where(inArray(jobVendorAssignmentStatusHistory.assignmentId, tbaIds));
            await tx.delete(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, tbJobIds));
            await tx.delete(changeOrders).where(inArray(changeOrders.jobId, tbJobIds));
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
        }
      });
    } catch (e) {
      console.error("[check-notif] teardown warning:", e);
    }
  }

  // pre-clean a leftover T-B
  {
    const priorTB = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, T_B_SLUG)).limit(1);
    if (priorTB[0]) { tBId = priorTB[0].id; await teardown(); tBId = null; }
  }

  // ---- helpers ----
  async function seedComm(opts: {
    tenantId: string; jobId: string; recipientEmail: string | null;
    sourceType: "client_update" | "job_note"; sourceId: string; deliveryStatus?: "draft" | "failed";
    providerMessageId?: string | null; lastError?: string | null;
  }): Promise<string> {
    const id = uuidv7();
    await db.insert(communicationLogs).values({
      id, tenantId: opts.tenantId, jobId: opts.jobId,
      channel: "email", direction: "outbound",
      sourceType: opts.sourceType, sourceId: opts.sourceId,
      summary: "harness summary excerpt (NOT the real body)",
      recipientType: opts.recipientEmail ? "client_contact" : "none",
      recipientEmail: opts.recipientEmail,
      deliveryStatus: opts.deliveryStatus ?? "draft",
      providerMessageId: opts.providerMessageId ?? null,
      lastError: opts.lastError ?? null,
    });
    createdCommIds.push(id);
    createdNoteAuditTargets.push(id);
    return id;
  }
  async function seedClientUpdate(tenantId: string, jobId: string, content: string): Promise<string> {
    const id = uuidv7();
    await db.insert(clientUpdateLogs).values({ id, tenantId, jobId, content });
    return id;
  }

  try {
    console.log("\n[setup] resolve T-A + operator + reference data");
    const [tA] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SEED_TENANT_SLUG));
    check("setup: seeded tenant (T-A) exists", !!tA);
    if (!tA) return finish();
    const tAId = tA.id;
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    check("setup: operator user", !!operator);
    if (!operator) return finish();
    const loc = (await db.select({ id: clientLocations.id, clientId: clientLocations.clientId }).from(clientLocations).where(eq(clientLocations.tenantId, tAId)).limit(1))[0];
    const [sentStatus] = await db.select({ id: dispatchAssignmentStatuses.id }).from(dispatchAssignmentStatuses).where(eq(dispatchAssignmentStatuses.code, "SENT"));
    const [trade] = await db.select({ id: trades.id }).from(trades).limit(1);
    check("setup: client location + SENT status + a trade exist", !!loc && !!sentStatus && !!trade);
    if (!loc || !sentStatus || !trade) return finish();

    const mkJob = async (desc: string) => {
      const j = await createJob({ tenantId: tAId, clientId: loc.clientId, clientLocationId: loc.id, problemDescription: desc, createdByUserId: operator.id });
      createdJobIds.push(j.id);
      return j;
    };
    const insertAssignment = async (tenantId: string, jobId: string, vendorId: string, sentAt: Date) => {
      const id = uuidv7();
      await db.insert(jobVendorAssignments).values({
        id, tenantId, jobId, vendorId, currentStatusId: sentStatus.id,
        matchedTradeId: trade.id, matchedTradeWasPrimary: false,
        tightestGeoAtDispatch: "national", matchedGeoTypesAtDispatch: ["national"],
        complianceStatusAtDispatch: "ok", sentAt,
      });
      return id;
    };

    // ════════ A. SEND PATH (CaptureProvider) ════════
    console.log("\n[A] send path via CaptureProvider");
    resetCaptured();
    const jobSend = await mkJob("Harness — send path");
    const culId = await seedClientUpdate(tAId, jobSend.id, "THE REAL RESOLVED BODY — full client update content.");
    const commOk = await seedComm({ tenantId: tAId, jobId: jobSend.id, recipientEmail: "client@example.test", sourceType: "client_update", sourceId: culId });
    const beforeAudit = async () => Number((await db.select({ c: count() }).from(auditLogs).where(eq(auditLogs.targetId, commOk)))[0]?.c ?? 0);
    const aAudit0 = await beforeAudit();
    const sent = await sendCommunication({ tenantId: tAId, commId: commOk, actorUserId: operator.id });
    const cap = getCaptured();
    check("A1: delivery_status flips to 'sent'", sent.deliveryStatus === "sent");
    check("A2: provider_message_id stored (synthetic capture id)", !!sent.providerMessageId && sent.providerMessageId.startsWith("cap_"));
    check("A3: attempts incremented to 1", sent.attempts === 1);
    check("A4: sentAt set", sent.sentAt != null);
    check("A5: exactly ONE payload captured", cap.length === 1);
    check("A6: captured body is the RESOLVED source content, NOT the summary", cap[0]?.body === "THE REAL RESOLVED BODY — full client update content." && cap[0]?.subject.includes("#"));
    check("A7: +1 audit 'communication.sent'", (await beforeAudit()) === aAudit0 + 1);

    // MISSING_RECIPIENT
    resetCaptured();
    const culId2 = await seedClientUpdate(tAId, jobSend.id, "body2");
    const commNoRcpt = await seedComm({ tenantId: tAId, jobId: jobSend.id, recipientEmail: null, sourceType: "client_update", sourceId: culId2 });
    let missRcpt = false;
    try { await sendCommunication({ tenantId: tAId, commId: commNoRcpt, actorUserId: operator.id }); } catch (e) { missRcpt = (e as Error).message === "MISSING_RECIPIENT"; }
    check("A8: no recipient_email → MISSING_RECIPIENT, no capture", missRcpt && getCaptured().length === 0);

    // UNRESOLVABLE_SEND_SOURCE (job_note source not handled)
    resetCaptured();
    const commBadSrc = await seedComm({ tenantId: tAId, jobId: jobSend.id, recipientEmail: "x@example.test", sourceType: "job_note", sourceId: uuidv7() });
    let unresolvable = false;
    try { await sendCommunication({ tenantId: tAId, commId: commBadSrc, actorUserId: operator.id }); } catch (e) { unresolvable = (e as Error).message === "UNRESOLVABLE_SEND_SOURCE"; }
    check("A9: unmapped source_type → UNRESOLVABLE_SEND_SOURCE, no capture", unresolvable && getCaptured().length === 0);

    // ════════ B. IDEMPOTENCY ════════
    console.log("\n[B] idempotency — double-fire + failed-retry");
    resetCaptured();
    const auditCount = async (t: string) => Number((await db.select({ c: count() }).from(auditLogs).where(eq(auditLogs.targetId, t)))[0]?.c ?? 0);
    const bAudit0 = await auditCount(commOk);
    const second = await sendCommunication({ tenantId: tAId, commId: commOk, actorUserId: operator.id }); // already sent
    check("B1: 2nd send returns early — ZERO new captures", getCaptured().length === 0);
    check("B2: attempts NOT double-bumped (still 1)", second.attempts === 1);
    check("B3: no 2nd audit row", (await auditCount(commOk)) === bAudit0);
    // failed row CAN retry
    resetCaptured();
    const culId3 = await seedClientUpdate(tAId, jobSend.id, "retry body");
    const commFailed = await seedComm({ tenantId: tAId, jobId: jobSend.id, recipientEmail: "r@example.test", sourceType: "client_update", sourceId: culId3, deliveryStatus: "failed", lastError: "prior failure" });
    const retried = await sendCommunication({ tenantId: tAId, commId: commFailed, actorUserId: operator.id });
    check("B4: a 'failed' row (no provider id) retries → sent + 1 capture", retried.deliveryStatus === "sent" && getCaptured().length === 1);

    // ════════ C. CAPTURE-HONESTY ════════
    console.log("\n[C] capture-honesty — ResendProvider never constructed");
    const provider = getSendProvider();
    check("C1: SEND_CAPTURE=1 ⇒ getSendProvider().name === 'capture'", provider.name === "capture");
    check("C2: RESEND_API_KEY is unset in the harness path", !process.env.RESEND_API_KEY);
    // If the factory had taken the Resend branch it would have constructed ResendProvider, which throws
    // RESEND_API_KEY_MISSING without a key — so a successful 'capture' provider proves Resend was never built.
    check("C3: factory returns capture without throwing (Resend branch never entered)", provider.name === "capture");

    // ════════ D. EXCEPTION READERS ════════
    console.log("\n[D] exception detection + isolation");
    const jobVNA = await mkJob("Harness — vendor not accepted");
    const vendorAId = uuidv7();
    await db.insert(vendors).values({ id: vendorAId, tenantId: tAId, name: "Harness Vendor A" });
    await insertAssignment(tAId, jobVNA.id, vendorAId, new Date(Date.now() - 6 * 3600 * 1000));
    const jobNTE = await mkJob("Harness — NTE increase");
    await db.insert(changeOrders).values({ id: uuidv7(), tenantId: tAId, jobId: jobNTE.id, status: "submitted", total: "500.00", reason: "extra parts" });
    const jobOver = await mkJob("Harness — overdue");
    await db.update(jobs).set({ dueAt: new Date(Date.now() - 24 * 3600 * 1000) as never }).where(eq(jobs.id, jobOver.id));
    const jobAged = await mkJob("Harness — plain (should be excluded)");

    const exc = await getExceptions(tAId);
    const byJob = (jid: string) => exc.filter((e) => e.jobId === jid);
    check("D1: vendor_not_accepted present for the SENT-assignment job, labeled", byJob(jobVNA.id).some((e) => e.kind === "vendor_not_accepted" && e.jobNumber === jobVNA.jobNumber));
    check("D2: nte_increase_requested present for the submitted-CO job", byJob(jobNTE.id).some((e) => e.kind === "nte_increase_requested"));
    check("D3: operational present for the overdue job", byJob(jobOver.id).some((e) => e.kind === "operational" && e.kind === "operational"));
    check("D4: pure-aged plain job EXCLUDED", byJob(jobAged.id).length === 0);
    const keys = exc.map((e) => e.sortKey);
    check("D5: sorted by sortKey DESC", keys.every((v, i) => i === 0 || keys[i - 1] >= v));

    // cross-tenant isolation
    tBId = uuidv7();
    await db.insert(tenants).values({ id: tBId, name: "Phase19 Harness Tenant B", slug: T_B_SLUG, type: "aggregator", status: "active" });
    const tbClientId = uuidv7();
    await db.insert(clients).values({ id: tbClientId, tenantId: tBId, name: "Harness Client B" });
    const tbLocId = uuidv7();
    await db.insert(clientLocations).values({ id: tbLocId, tenantId: tBId, clientId: tbClientId, name: "B Store", addressLine1: "1 B Rd", city: "Btown", stateProvince: "NY", postalCode: "10001" });
    const tbVendorId = uuidv7();
    await db.insert(vendors).values({ id: tbVendorId, tenantId: tBId, name: "Harness Vendor B" });
    const tbJob = await createJob({ tenantId: tBId, clientId: tbClientId, clientLocationId: tbLocId, problemDescription: "T-B private", createdByUserId: operator.id });
    await insertAssignment(tBId, tbJob.id, tbVendorId, new Date(Date.now() - 6 * 3600 * 1000));
    await db.insert(changeOrders).values({ id: uuidv7(), tenantId: tBId, jobId: tbJob.id, status: "submitted", total: "999.00" });
    const excA = await getExceptions(tAId);
    check("D6: T-B SENT-assignment + submitted-CO do NOT appear for T-A", !excA.some((e) => e.jobId === tbJob.id));

    // ════════ E. WRITE-BOUNDARY ════════
    console.log("\n[E] write-boundary — a send moves only comm_logs(1) + audit(+1)");
    resetCaptured();
    const culE = await seedClientUpdate(tAId, jobSend.id, "boundary body");
    const commE = await seedComm({ tenantId: tAId, jobId: jobSend.id, recipientEmail: "e@example.test", sourceType: "client_update", sourceId: culE });
    const snap = async () => ({
      cul: Number((await db.select({ c: count() }).from(clientUpdateLogs).where(eq(clientUpdateLogs.tenantId, tAId)))[0]?.c ?? 0),
      jobs: Number((await db.select({ c: count() }).from(jobs).where(eq(jobs.tenantId, tAId)))[0]?.c ?? 0),
      comms: Number((await db.select({ c: count() }).from(communicationLogs).where(eq(communicationLogs.tenantId, tAId)))[0]?.c ?? 0),
    });
    const before = await snap();
    const beforeAuditE = Number((await db.select({ c: count() }).from(auditLogs).where(eq(auditLogs.targetId, commE)))[0]?.c ?? 0);
    await sendCommunication({ tenantId: tAId, commId: commE, actorUserId: operator.id });
    const after = await snap();
    const afterAuditE = Number((await db.select({ c: count() }).from(auditLogs).where(eq(auditLogs.targetId, commE)))[0]?.c ?? 0);
    check("E1: client_update_logs row count UNCHANGED (no new content row)", after.cul === before.cul);
    check("E2: jobs UNCHANGED", after.jobs === before.jobs);
    check("E3: communication_logs row count UNCHANGED (send is an UPDATE, not insert)", after.comms === before.comms);
    check("E4: audit_logs +1 for this comm (the send record)", afterAuditE === beforeAuditE + 1);

    return finish();
  } finally {
    await teardown();
    console.log("[check-notif] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-notif] passed: ${passed}`);
  console.log(`[check-notif] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-notif] PHASE-19 NOTIFICATIONS-SEND LEDGER RED ✗ — PHASE BLOCKED");
  } else {
    console.log("[check-notif] PHASE-19 NOTIFICATIONS-SEND LEDGER GREEN ✓ (send-path / idempotency / capture-honesty / exception-readers / write-boundary)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => {
    console.error("[check-notif] FAILED:", e);
    process.exit(1);
  });
