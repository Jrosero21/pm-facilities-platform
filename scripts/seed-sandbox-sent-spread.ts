/**
 * scripts/seed-sandbox-sent-spread.ts — CF-19.1a demo: a SENT priority-spread.
 *
 * Creates SENT dispatch assignments across priority tiers under phase9-seed-tenant so the
 * exceptions queue (/notifications) renders the per-priority "stuck > X hours" matrix — a MIX
 * of stuck (past tier threshold) and not-stuck (under), to prove the threshold discriminates
 * AND the two-band bubble-up ordering. Self-tearing-down + idempotent.
 *
 * SANDBOX ONLY. Modes: --seed (default) | --teardown. Everything created is namespaced by a
 * marker in problem_description ([SENT-SPREAD]) so teardown removes ONLY this script's rows,
 * never the phase9 base seed. Mirrors the b16-4 seed's createJob+assignment shape.
 *
 *   pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/seed-sandbox-sent-spread.ts --seed
 *   pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/seed-sandbox-sent-spread.ts --teardown
 */

export {};

// ===== SANDBOX GUARD — module top, before any @/server/db (or @/server/jobs → db) import =====
const RAW = process.env.DATABASE_URL;
if (!RAW) {
  console.error("[sent-spread] DATABASE_URL not set — refusing to run.");
  process.exit(2);
}
const sandboxUrl = RAW.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[sent-spread] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[sent-spread] sandbox target confirmed: ${sandboxUrl.replace(/\/\/[^@]+@/, "//<creds>@")}`);

const MARKER = "[SENT-SPREAD]";
const TENANT_SLUG = "phase9-seed-tenant";
const OPERATOR_EMAIL = "operator@phase9seed.test";

// hoursAgo = how long ago sent_at is. Thresholds (dispatch-sla-rules SENT map): EMERGENCY 2h /
// URGENT 4h / HIGH 8h / ROUTINE 24h / SCHEDULED 48h / null→DEFAULT 24h.
const SCENARIOS: { label: string; priorityCode: string | null; hoursAgo: number }[] = [
  { label: "EMERGENCY stuck",   priorityCode: "EMERGENCY", hoursAgo: 3 },   // >2h → stuck
  { label: "URGENT stuck",      priorityCode: "URGENT",    hoursAgo: 6 },   // >4h → stuck
  { label: "HIGH stuck",        priorityCode: "HIGH",      hoursAgo: 12 },  // >8h → stuck
  { label: "no-priority stuck", priorityCode: null,        hoursAgo: 30 },  // >24h DEFAULT → stuck
  { label: "ROUTINE ok",        priorityCode: "ROUTINE",   hoursAgo: 12 },  // <24h → not stuck
  { label: "SCHEDULED ok",      priorityCode: "SCHEDULED", hoursAgo: 24 },  // <48h → not stuck
];

async function main() {
  const mode = process.argv.includes("--teardown") ? "teardown" : "seed";

  const { db } = await import("@/server/db"); // dynamic — after the guard
  const {
    tenants, clients, clientLocations, vendors, trades, priorities, users,
    jobs, jobVendorAssignments, jobStatusHistory, jobEvents, auditLogs,
    jobVendorAssignmentStatusHistory, dispatchAssignmentStatuses,
  } = await import("@/server/schema");
  const { eq, and, inArray, like, sql } = await import("drizzle-orm");
  const { isDispatchStuck } = await import("@/server/analytics/dispatch-sla-rules");

  // Ground-truth: connected DB must be *_sandbox.
  const { rows: dbRows } = (await db.execute(sql`SELECT current_database() AS db`)) as unknown as { rows: { db: string }[] };
  const dbName = dbRows[0]?.db ?? "";
  if (!/_sandbox$/.test(dbName)) {
    console.error(`[sent-spread] ABORT: connected DB is "${dbName}", not a *_sandbox DB.`);
    process.exit(2);
  }
  console.log("[sent-spread] connected DB confirmed:", dbName);

  // Resolve the seed tenant by slug.
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TENANT_SLUG)).limit(1);
  if (!tenant) {
    console.error(`[sent-spread] ${TENANT_SLUG} not found — run the phase9 sandbox seed first.`);
    process.exit(2);
  }
  const tenantId = tenant.id;

  // ---------- TEARDOWN ----------
  async function teardown(): Promise<number> {
    const seedJobs = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.tenantId, tenantId), like(jobs.problemDescription, `${MARKER}%`)));
    const jobIds = seedJobs.map((j) => j.id);
    if (jobIds.length === 0) {
      console.log("[sent-spread] teardown: no namespaced rows found — nothing to remove.");
      return 0;
    }
    const aRows = await db.select({ id: jobVendorAssignments.id }).from(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, jobIds));
    const aIds = aRows.map((r) => r.id);
    await db.transaction(async (tx) => {
      if (aIds.length) {
        await tx.delete(jobVendorAssignmentStatusHistory).where(inArray(jobVendorAssignmentStatusHistory.assignmentId, aIds));
        await tx.delete(auditLogs).where(inArray(auditLogs.targetId, aIds));
        await tx.delete(jobVendorAssignments).where(inArray(jobVendorAssignments.id, aIds));
      }
      await tx.delete(auditLogs).where(inArray(auditLogs.targetId, jobIds)); // job.created
      await tx.delete(jobStatusHistory).where(inArray(jobStatusHistory.jobId, jobIds));
      await tx.delete(jobEvents).where(inArray(jobEvents.jobId, jobIds));
      await tx.delete(jobs).where(inArray(jobs.id, jobIds));
    });
    console.log(`[sent-spread] teardown: removed ${jobIds.length} jobs + ${aIds.length} assignments (+ history/events/audit) under ${MARKER}.`);
    return jobIds.length;
  }

  if (mode === "teardown") {
    await teardown();
    const remaining = (await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.tenantId, tenantId), like(jobs.problemDescription, `${MARKER}%`)))).length;
    console.log(`[sent-spread] clean confirm: ${remaining} namespaced jobs remaining (expect 0).`);
    process.exit(remaining === 0 ? 0 : 1);
  }

  // ---------- SEED (idempotent: teardown first) ----------
  await teardown();

  const { createJob } = await import("@/server/jobs"); // dynamic — statically imports db

  // Reuse existing seed-tenant client/location/vendor/trade/creator (don't invent).
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, tenantId)).limit(1);
  if (!client) { console.error("[sent-spread] no client under the seed tenant — run the phase9 seed first."); process.exit(2); }
  const [location] = await db.select({ id: clientLocations.id }).from(clientLocations).where(and(eq(clientLocations.tenantId, tenantId), eq(clientLocations.clientId, client.id))).limit(1);
  if (!location) { console.error("[sent-spread] no client location under the seed tenant."); process.exit(2); }
  const [vendor] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.tenantId, tenantId)).limit(1);
  if (!vendor) { console.error("[sent-spread] no vendor under the seed tenant."); process.exit(2); }
  const [trade] = await db.select({ id: trades.id }).from(trades).limit(1); // trades are global
  if (!trade) { console.error("[sent-spread] no trades found."); process.exit(2); }
  const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, OPERATOR_EMAIL)).limit(1);
  const creatorId = operator?.id ?? (await db.select({ id: users.id }).from(users).limit(1))[0]?.id;
  if (!creatorId) { console.error("[sent-spread] no users found for created_by."); process.exit(2); }

  // Priority ids by code (this tenant's set).
  const prioRows = await db.select({ id: priorities.id, code: priorities.code }).from(priorities).where(eq(priorities.tenantId, tenantId));
  const prioByCode = new Map(prioRows.map((p) => [p.code, p.id]));

  const [sentStatus] = await db.select({ id: dispatchAssignmentStatuses.id }).from(dispatchAssignmentStatuses).where(eq(dispatchAssignmentStatuses.code, "SENT")).limit(1);
  if (!sentStatus) { console.error("[sent-spread] SENT dispatch status not found."); process.exit(2); }

  const created: { jobNumber: number; priorityCode: string; hoursAgo: number; expectStuck: boolean }[] = [];
  for (const s of SCENARIOS) {
    const priorityId = s.priorityCode != null ? prioByCode.get(s.priorityCode) ?? null : null;
    if (s.priorityCode != null && priorityId == null) {
      console.error(`[sent-spread] priority code ${s.priorityCode} not found for this tenant — aborting.`);
      process.exit(2);
    }
    const job = await createJob({
      tenantId,
      clientId: client.id,
      clientLocationId: location.id,
      primaryTradeId: trade.id,
      priorityId,
      problemDescription: `${MARKER} ${s.label} — sent ${s.hoursAgo}h ago (CF-19.1a demo)`,
      createdByUserId: creatorId,
    });
    // Direct assignment insert in SENT, sent_at backdated via SQL (DB frame — no TZ skew on TIMESTAMPDIFF).
    await db.insert(jobVendorAssignments).values({
      tenantId,
      jobId: job.id,
      vendorId: vendor.id,
      currentStatusId: sentStatus.id,
      matchedTradeId: trade.id,
      matchedTradeWasPrimary: true,
      tightestGeoAtDispatch: "national",
      matchedGeoTypesAtDispatch: ["national"],
      complianceStatusAtDispatch: "ok",
      sentAt: sql.raw(`(NOW() - (${s.hoursAgo} * INTERVAL '1 hour'))`),
    });
    const expectStuck = isDispatchStuck({ statusCode: "SENT", priorityCode: s.priorityCode, dwellSeconds: s.hoursAgo * 3600 });
    created.push({ jobNumber: job.jobNumber, priorityCode: s.priorityCode ?? "(null)", hoursAgo: s.hoursAgo, expectStuck });
  }

  // VERIFY table.
  console.log("\n[sent-spread] created:");
  console.log("  job#   priority      sent_hours_ago   expected isStuck");
  for (const c of created) {
    console.log(`  #${String(c.jobNumber).padEnd(5)} ${c.priorityCode.padEnd(12)} ${String(c.hoursAgo).padStart(10)}h     ${c.expectStuck ? "STUCK" : "ok"}`);
  }
  const stuckN = created.filter((c) => c.expectStuck).length;
  console.log(`\n[sent-spread] ${created.length} SENT assignments (${stuckN} stuck / ${created.length - stuckN} not). Bubble-up: stuck rows sort to the top band.`);
  console.log("SENT spread seeded — log in as jnrosero@gmail.com on pnpm dev and open /notifications.");
  process.exit(0);
}

main().catch((e) => { console.error("[sent-spread] ERROR:", e); process.exit(1); });
