/**
 * scripts/testbed/eval-trigger.ts — Phase 29 Stage 2: prove the trigger mechanism in the sandbox.
 *
 *   DATABASE_URL="postgres://<user>@localhost:5432/pm_sandbox" \
 *     pnpm tsx --conditions=react-server scripts/testbed/eval-trigger.ts
 *
 * MUTATES (the cron route really re-dispatches). Scoped to the TBSTUCK- cohort; everything is
 * snapshotted and restored in teardown, including the autonomy flags.
 *
 * Exercises the ACTUAL route handler — imported from src/app/api/cron/auto-redispatch/route and
 * called with real Request objects — not a reimplementation of it. That is the only way the token
 * guard and the tenant enumeration get tested at all.
 *
 * WHAT IS AND IS NOT PROVABLE HEADLESS: autoRedispatchSweepAction cannot run here (requireTenant
 * needs a session). Its behaviour-preservation is therefore established structurally — its body is
 * now a single call to runAutoRedispatchSweep, the same function the cron calls — and asserted here
 * only insofar as that shared core behaves correctly. Stated plainly rather than implied.
 */
// ── SELF-CONTAINED SANDBOX GUARD ─────────────────────────────────────────────────────────────
// The canonical guard (scripts/testbed/guard.ts) lives on the testbed-generator branch, which is
// deliberately kept OUT of main — and this branch is cut from main because the sweep core and cron
// route must merge there. So the guard is reproduced here rather than imported across branches.
// It is intentionally the same deny-by-default shape: refuse any hosted host even when it names
// pm_sandbox, refuse plain `pm`, refuse anything else, and never derive one database from another.
// DUPLICATION IS A KNOWN COST — if the canonical guard tightens, this copy must be updated too.
const SANDBOX_DB = "pm_sandbox";
const FORBIDDEN_HOSTS = ["neon.tech", "neon.build", "aws.neon", "vercel-storage"];
function assertSandbox(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) throw new Error(`[trig:guard] REFUSED — DATABASE_URL is not set (expects .../${SANDBOX_DB}).`);
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("[trig:guard] REFUSED — DATABASE_URL is not a parseable URL."); }
  const host = url.hostname.toLowerCase();
  const hit = FORBIDDEN_HOSTS.find((f) => host.includes(f));
  if (hit) throw new Error(`[trig:guard] REFUSED — host "${host}" is a hosted Postgres host (matched "${hit}").`);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, "")).trim();
  if (dbName !== SANDBOX_DB) throw new Error(`[trig:guard] REFUSED — DATABASE_URL names "${dbName || "(none)"}", not "${SANDBOX_DB}".`);
  console.log(`[trig:guard] OK — ${host}:${url.port || "5432"}/${dbName}`);
  return raw;
}

// ── GUARD FIRST. Nothing that can reach the database is imported above this line. ────────────
assertSandbox();

/** Mirrors scripts/testbed/config.ts (testbed-generator branch) — only what this script needs. */
const TESTBED = { tenantSlug: process.env.TESTBED_TENANT_SLUG ?? "phase9-seed-tenant" } as const;

const NS = "TBSTUCK";
const AGENT_ID = "dispatch_router_v1";
const SECRET = "testbed-cron-secret-do-not-use-in-prod";
const CRON_URL = "http://localhost/api/cron/auto-redispatch";
const pad = (s: string, n: number) => s.padEnd(n);

async function main() {
  // The route reads process.env.CRON_SECRET at call time; set it before invoking the handler.
  process.env.CRON_SECRET = SECRET;

  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, jobs, agentPolicies, agentRuns,
    jobVendorAssignments, jobVendorAssignmentStatusHistory, dispatchAssignmentStatuses, auditLogs,
  } = await import("@/server/schema");
  const { eq, and, inArray, like, sql } = await import("drizzle-orm");
  const { POST } = await import("@/app/api/cron/auto-redispatch/route");
  const { runAutoRedispatchSweep, REDISPATCH_COOLDOWN_HOURS } = await import("@/server/auto-redispatch-sweep");

  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TESTBED.tenantSlug));
  if (!tenant) throw new Error(`[trig] tenant "${TESTBED.tenantSlug}" not found.`);
  const tenantId = tenant.id;

  const cohortClients = (await db.select({ id: clients.id }).from(clients)
    .where(and(eq(clients.tenantId, tenantId), like(clients.clientCode, `${NS}-%`)))).map((r) => r.id);
  if (!cohortClients.length) throw new Error(`[trig] no ${NS}- cohort — run seed-stuck-cohort.ts first.`);
  const cohortJobs = await db.select({ id: jobs.id, statusId: jobs.currentStatusId, desc: jobs.problemDescription })
    .from(jobs).where(inArray(jobs.clientId, cohortClients));
  const cohortJobIds = cohortJobs.map((j) => j.id);
  const scenarioOf = (jobId: string) => cohortJobs.find((j) => j.id === jobId)?.desc ?? "";

  // ── SNAPSHOT ──────────────────────────────────────────────────────────────────────────────
  const asgBefore = await db.select({
    id: jobVendorAssignments.id, jobId: jobVendorAssignments.jobId, statusId: jobVendorAssignments.currentStatusId,
  }).from(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, cohortJobIds));
  const asgIdsBefore = new Set(asgBefore.map((a) => a.id));
  const statusBefore = new Map(asgBefore.map((a) => [a.id, a.statusId]));
  const histIdsBefore = new Set((await db.select({ id: jobVendorAssignmentStatusHistory.id })
    .from(jobVendorAssignmentStatusHistory).where(inArray(jobVendorAssignmentStatusHistory.assignmentId, [...asgIdsBefore]))).map((r) => r.id));
  const runIdsBefore = new Set((await db.select({ id: agentRuns.id }).from(agentRuns).where(inArray(agentRuns.jobId, cohortJobIds))).map((r) => r.id));
  const auditIdsBefore = new Set((await db.select({ id: auditLogs.id }).from(auditLogs)
    .where(inArray(auditLogs.targetId, [...asgIdsBefore, ...cohortJobIds]))).map((r) => r.id));

  const statusRows = await db.select({ id: dispatchAssignmentStatuses.id, code: dispatchAssignmentStatuses.code }).from(dispatchAssignmentStatuses);
  const codeById = new Map(statusRows.map((r) => [r.id, r.code]));

  const countAsg = async () => Number((await db.select({ n: sql<number>`count(*)::int` }).from(jobVendorAssignments)
    .where(inArray(jobVendorAssignments.jobId, cohortJobIds)))[0]!.n);
  const failures: string[] = [];
  console.log(`[trig] cohort ${cohortJobIds.length} jobs · ${asgBefore.length} assignments · cooldown default ${REDISPATCH_COOLDOWN_HOURS}h`);

  // ── FIXTURE CLOCK REFRESH (must run before anything is measured) ──────────────────────────
  // The stuck cohort encodes DWELL, so it AGES: a control seeded at 0.5x an EMERGENCY 2h threshold
  // is genuinely stuck 14 hours later, and the detector is then correct while the "control" is
  // stale. (Observed twice — 16 minutes was enough to move the tightest band.) So re-derive each
  // SENT fixture's intended dwell from the scenario encoded in its description and re-stamp sent_at
  // relative to NOW. This restores the DESIGNED state; it does not invent one.
  const THRESHOLD_HOURS: Record<string, number> = { EMERGENCY: 2, URGENT: 4, HIGH: 8, ROUTINE: 24, SCHEDULED: 48 };
  const intendedDwellHours = (desc: string): number => {
    const priority = Object.keys(THRESHOLD_HOURS).find((p) => desc.includes(p)) ?? "ROUTINE";
    const t = THRESHOLD_HOURS[priority]!;
    if (desc.includes("just_under")) return t * 0.5;
    if (desc.includes("just_over")) return t * 1.1;
    return t * 5; // far_over, and every attempt-depth scenario (seeded far over ROUTINE)
  };
  const sentStatusId = statusRows.find((r) => r.code === "SENT")!.id;
  let refreshed = 0;
  for (const a of asgBefore) {
    if (a.statusId !== sentStatusId) continue;
    const hours = intendedDwellHours(scenarioOf(a.jobId));
    await db.execute(sql`UPDATE job_vendor_assignments SET sent_at = NOW() - (${hours} * INTERVAL '1 hour') WHERE id = ${a.id}`);
    refreshed++;
  }
  console.log(`[trig] fixture clock refreshed on ${refreshed} SENT assignment(s) — dwells re-derived relative to now`);

  const call = (auth?: string) => POST(new Request(CRON_URL, { method: "POST", headers: auth ? { authorization: auth } : {} }));

  // ── 1. TOKEN GUARD (before any autonomy is enabled) ───────────────────────────────────────
  const beforeGuard = await countAsg();
  const noHeader = await call();
  const wrongSecret = await call("Bearer wrong-secret");
  const malformed = await call(SECRET); // missing "Bearer " prefix
  const afterGuard = await countAsg();
  const guardCodes = [noHeader.status, wrongSecret.status, malformed.status];
  if (!guardCodes.every((c) => c === 401)) failures.push(`TOKEN GUARD: expected 401,401,401 got ${guardCodes.join(",")}`);
  if (afterGuard !== beforeGuard) failures.push(`TOKEN GUARD: unauthorized calls did work (${beforeGuard} → ${afterGuard})`);
  console.log(`\n1. TOKEN GUARD  no-header/wrong/malformed → ${guardCodes.join(",")} · assignments ${beforeGuard} → ${afterGuard}`);

  // ── 2. GATE: authorized, but autonomy is OFF (no policy row exists yet) ────────────────────
  const gateRes = await call(`Bearer ${SECRET}`);
  const gateBody = await gateRes.json() as { tenantsScanned: number; totals: { autoSent: number } };
  const afterGate = await countAsg();
  if (gateRes.status !== 200) failures.push(`GATE: authorized call returned ${gateRes.status}`);
  if (gateBody.totals.autoSent !== 0) failures.push(`GATE: autonomy off but ${gateBody.totals.autoSent} auto_sent`);
  if (afterGate !== beforeGuard) failures.push(`GATE: autonomy-off run mutated (${beforeGuard} → ${afterGate})`);
  console.log(`2. GATE (autonomy OFF)  status ${gateRes.status} · tenantsScanned ${gateBody.tenantsScanned} · autoSent ${gateBody.totals.autoSent} · assignments ${afterGate}`);

  // ── 3. ENABLE autonomy, then RUN 1 through the real route ─────────────────────────────────
  const policyRowId = uuidv7();
  await db.insert(agentPolicies).values({
    id: policyRowId, tenantId, clientId: null, agentId: AGENT_ID,
    policy: { requiresReview: false, autonomyEnabled: true }, status: "active",
  });
  await db.update(clients).set({ autonomyAllowed: true }).where(inArray(clients.id, cohortClients));

  const run1 = await call(`Bearer ${SECRET}`);
  const body1 = await run1.json() as { tenantsScanned: number; totals: { swept: number; autoSent: number; skipped: number; byReason: Record<string, number> } };
  console.log(`3. RUN 1 (autonomy ON)  status ${run1.status} · tenantsScanned ${body1.tenantsScanned} · swept ${body1.totals.swept} · autoSent ${body1.totals.autoSent} · byReason ${JSON.stringify(body1.totals.byReason)}`);
  if (body1.totals.autoSent === 0) failures.push("RUN 1: fired nothing — the trigger did not act");

  const afterRun1 = await db.select({
    id: jobVendorAssignments.id, jobId: jobVendorAssignments.jobId, statusId: jobVendorAssignments.currentStatusId,
    replaces: jobVendorAssignments.replacesAssignmentId, sentAt: jobVendorAssignments.sentAt,
  }).from(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, cohortJobIds));
  const created1 = afterRun1.filter((a) => !asgIdsBefore.has(a.id));
  if (created1.length !== body1.totals.autoSent) failures.push(`RUN 1: ${body1.totals.autoSent} auto_sent but ${created1.length} assignments created`);

  // ── 4. STUCK-FILTER honoured: just_under controls untouched ───────────────────────────────
  const justUnderJobIds = new Set(cohortJobs.filter((j) => j.desc.includes("just_under")).map((j) => j.id));
  const justUnderCreated = created1.filter((a) => justUnderJobIds.has(a.jobId)).length;
  const justUnderMutated = asgBefore.filter((a) => justUnderJobIds.has(a.jobId))
    .filter((a) => afterRun1.find((x) => x.id === a.id)?.statusId !== a.statusId).length;
  if (justUnderCreated || justUnderMutated) failures.push(`STUCK-FILTER: just_under touched (created ${justUnderCreated}, mutated ${justUnderMutated})`);
  console.log(`4. STUCK-FILTER  just_under: ${justUnderCreated} created · ${justUnderMutated} mutated  (both must be 0)`);

  // ── 5. COUNT-CAP: depth3_max never acted on ───────────────────────────────────────────────
  const depth3JobIds = new Set(cohortJobs.filter((j) => j.desc.includes("depth3_max")).map((j) => j.id));
  const depth3Created = created1.filter((a) => depth3JobIds.has(a.jobId)).length;
  if (depth3Created) failures.push(`COUNT-CAP: depth3_max produced ${depth3Created} re-dispatch(es)`);
  console.log(`5. COUNT-CAP  depth3_max re-dispatches: ${depth3Created}  (must be 0)`);

  // ── 6. ★ COOLDOWN — the new rate bound ────────────────────────────────────────────────────
  // Make every replacement from run 1 look STALE (backdate sent_at only), so those jobs become
  // can_suggest again. Their cooldown clock is created_at, which is still ~now — so the sweep must
  // skip them. Backdating sent_at deliberately does NOT move the cooldown clock; that separation is
  // the whole reason the cooldown reads created_at.
  if (created1.length) {
    await db.execute(sql`UPDATE job_vendor_assignments SET sent_at = NOW() - INTERVAL '400 hours'
      WHERE id = ANY(${sql.param(created1.map((a) => a.id))})`);
  }
  const beforeRun2 = await countAsg();
  const run2 = await call(`Bearer ${SECRET}`);
  const body2 = await run2.json() as { totals: { swept: number; autoSent: number; byReason: Record<string, number> } };
  const afterRun2 = await countAsg();
  const cooldownSkips = body2.totals.byReason.cooldown ?? 0;
  console.log(`6. ★ COOLDOWN  run 2 (immediate): swept ${body2.totals.swept} · autoSent ${body2.totals.autoSent} · cooldown-skips ${cooldownSkips} · assignments ${beforeRun2} → ${afterRun2}`);
  if (body2.totals.autoSent !== 0) failures.push(`COOLDOWN: run 2 auto-sent ${body2.totals.autoSent} within the cooldown window`);
  if (afterRun2 !== beforeRun2) failures.push(`COOLDOWN: run 2 created ${afterRun2 - beforeRun2} assignment(s)`);
  if (cooldownSkips === 0) failures.push("COOLDOWN: no job was skipped for cooldown — the bound was never exercised");

  // ── 7. CONTROL — same state, cooldown disabled → the SAME jobs DO get acted on ─────────────
  // Proves run 2's inaction was caused by the cooldown, not by the jobs having stopped qualifying.
  const control = await runAutoRedispatchSweep({ tenantId, cooldownHours: 0 });
  const afterControl = await countAsg();
  console.log(`7. CONTROL (cooldownHours=0)  swept ${control.swept} · autoSent ${control.autoSent} · assignments ${afterRun2} → ${afterControl}`);
  if (control.autoSent === 0) failures.push("CONTROL: with cooldown disabled the same jobs still did not act — run 2's skip was not the cooldown");

  // ── REPORT + TEARDOWN ─────────────────────────────────────────────────────────────────────
  console.log(`\n── summary ─────────────────────────────────────────────────`);
  console.log(`  ${pad("token guard (3 bad calls)", 34)}${guardCodes.join(",")}  no work done`);
  console.log(`  ${pad("autonomy OFF via route", 34)}autoSent ${gateBody.totals.autoSent}, zero writes`);
  console.log(`  ${pad("run 1 (fires)", 34)}autoSent ${body1.totals.autoSent}`);
  console.log(`  ${pad("stuck-filter (just_under)", 34)}untouched`);
  console.log(`  ${pad("count-cap (depth3_max)", 34)}no action`);
  console.log(`  ${pad("cooldown (run 2)", 34)}autoSent 0, ${cooldownSkips} skipped as cooldown`);
  console.log(`  ${pad("control (cooldown off)", 34)}autoSent ${control.autoSent} — cooldown was the cause`);

  console.log(`\n[trig] teardown…`);
  const finalAsg = await db.select({ id: jobVendorAssignments.id }).from(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, cohortJobIds));
  const createdIds = finalAsg.map((a) => a.id).filter((id) => !asgIdsBefore.has(id));
  if (createdIds.length) {
    await db.delete(jobVendorAssignmentStatusHistory).where(inArray(jobVendorAssignmentStatusHistory.assignmentId, createdIds));
    await db.delete(auditLogs).where(inArray(auditLogs.targetId, createdIds));
    await db.delete(jobVendorAssignments).where(inArray(jobVendorAssignments.id, createdIds));
  }
  for (const a of asgBefore) {
    const now = (await db.select({ statusId: jobVendorAssignments.currentStatusId }).from(jobVendorAssignments).where(eq(jobVendorAssignments.id, a.id)))[0];
    if (now && now.statusId !== a.statusId) await db.update(jobVendorAssignments).set({ currentStatusId: a.statusId }).where(eq(jobVendorAssignments.id, a.id));
  }
  const histNew = (await db.select({ id: jobVendorAssignmentStatusHistory.id }).from(jobVendorAssignmentStatusHistory)
    .where(inArray(jobVendorAssignmentStatusHistory.assignmentId, [...asgIdsBefore]))).map((r) => r.id).filter((id) => !histIdsBefore.has(id));
  if (histNew.length) await db.delete(jobVendorAssignmentStatusHistory).where(inArray(jobVendorAssignmentStatusHistory.id, histNew));
  const auditNew = (await db.select({ id: auditLogs.id }).from(auditLogs)
    .where(inArray(auditLogs.targetId, [...asgIdsBefore, ...cohortJobIds]))).map((r) => r.id).filter((id) => !auditIdsBefore.has(id));
  if (auditNew.length) await db.delete(auditLogs).where(inArray(auditLogs.id, auditNew));
  const runsNew = (await db.select({ id: agentRuns.id }).from(agentRuns).where(inArray(agentRuns.jobId, cohortJobIds))).map((r) => r.id).filter((id) => !runIdsBefore.has(id));
  if (runsNew.length) await db.delete(agentRuns).where(inArray(agentRuns.id, runsNew));
  for (const j of cohortJobs) await db.update(jobs).set({ currentStatusId: j.statusId }).where(eq(jobs.id, j.id));
  await db.delete(agentPolicies).where(eq(agentPolicies.id, policyRowId));
  await db.update(clients).set({ autonomyAllowed: false }).where(inArray(clients.id, cohortClients));

  const asgFinal = await countAsg();
  const statusMismatch = (await db.select({ id: jobVendorAssignments.id, statusId: jobVendorAssignments.currentStatusId })
    .from(jobVendorAssignments).where(inArray(jobVendorAssignments.jobId, cohortJobIds)))
    .filter((a) => statusBefore.get(a.id) !== a.statusId).length;
  const policiesLeft = (await db.select({ id: agentPolicies.id }).from(agentPolicies)).length;
  const consentLeft = (await db.select({ id: clients.id }).from(clients).where(and(inArray(clients.id, cohortClients), eq(clients.autonomyAllowed, true)))).length;
  console.log(`  assignments ${asgBefore.length} → ${asgFinal} · status mismatches ${statusMismatch} · policies left ${policiesLeft} · consent-on ${consentLeft}`);
  if (asgFinal !== asgBefore.length) failures.push(`TEARDOWN: assignments ${asgBefore.length} → ${asgFinal}`);
  if (statusMismatch !== 0) failures.push(`TEARDOWN: ${statusMismatch} statuses not restored`);
  if (policiesLeft !== 0) failures.push(`TEARDOWN: ${policiesLeft} policy row(s) left`);
  if (consentLeft !== 0) failures.push(`TEARDOWN: ${consentLeft} client(s) still consented`);

  if (failures.length) {
    console.error(`\n[trig] FAILED:`);
    failures.slice(0, 12).forEach((f) => console.error("  ✗", f));
    process.exit(1);
  }
  console.log(`\n[trig] OK — trigger mechanism proven in sandbox; cohort + flags restored.`);
  process.exit(0);
}

main().catch((e) => { console.error("[trig] fatal:", e); process.exit(1); });
