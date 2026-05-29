/** ── Phase 9 batch 9d — RETAINED analytics-readers regression harness ───────────────────
 *  Runs every src/server/analytics/ reader against the deterministically-seeded sandbox tenant and
 *  checks each result against a FIXTURE-DERIVED ORACLE (the expected* helpers in
 *  seed-sandbox-phase9-fixture.ts, which derive expectations by trivial filters/math — not by
 *  re-running the readers' SQL). This is the project's first persistent verify-style artifact and a
 *  partial answer to CF-8c.8.3.
 *
 *  CO-VERSIONING CONTRACT (manifest §7): seed + fixture + this harness are ONE unit. Editing the
 *  fixture's data changes both the seeded rows AND the oracle in lockstep; this harness must move in
 *  the same commit. Run AFTER the seed (it reads the seeded `phase9-seed-tenant`).
 *
 *  Run:  npx tsx --env-file=.env.local --conditions=react-server scripts/check-analytics-readers.ts
 *    or: pnpm db:check:analytics-readers
 *
 *  SANDBOX GUARD: refuses to run unless DATABASE_URL resolves to *_sandbox. The analytics readers
 *  statically `import { db } from "@/server/db"`, so DATABASE_URL must be swapped to the sandbox
 *  BEFORE they are (dynamically) imported — same dynamic-import guard pattern as the seed.
 */
import { eq } from "drizzle-orm";
import { tenants } from "@/server/schema";
import * as F from "./seed-sandbox-phase9-fixture";

const configured = process.env.DATABASE_URL;
if (!configured) throw new Error("[check9d] DATABASE_URL is not set");
const SANDBOX_URL = configured.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!SANDBOX_URL.includes("jonnyrosero_pm_sandbox")) {
  throw new Error("[check9d] refuses to run: resolved DATABASE_URL is not the *_sandbox database");
}
process.env.DATABASE_URL = SANDBOX_URL;
console.log("[check9d] sandbox target:", SANDBOX_URL.replace(/\/\/[^@]*@/, "//…@"));

// Dynamic imports — picked up only after the env swap above.
const { db } = await import("@/server/db");
const openJobs = await import("@/server/analytics/open-jobs");
const stalledJobs = await import("@/server/analytics/stalled-jobs");
const pendingInvoices = await import("@/server/analytics/pending-invoices");
const timeInStatus = await import("@/server/analytics/time-in-status");
const dispatchTiming = await import("@/server/analytics/dispatch-timing");
const operationalQueue = await import("@/server/analytics/operational-queue");
const stalledRules = await import("@/server/analytics/stalled-rules");

// ── tiny check framework ──
let pass = 0;
let fail = 0;
const failed: string[] = [];
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failed.push(name);
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}
const J = (x: unknown) => JSON.stringify(x);
const within = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;
/** equal maps over the union of keys, treating missing as 0 */
function mapsEqual(got: Record<string, number>, exp: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(got), ...Object.keys(exp)]);
  for (const k of keys) if ((got[k] ?? 0) !== (exp[k] ?? 0)) return false;
  return true;
}

// ── resolve seed tenant (same lookup the seed uses) ──
const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, F.SEED_TENANT.slug)).limit(1);
if (!t) throw new Error(`[check9d] seed tenant "${F.SEED_TENANT.slug}" not found — run the seed first`);
const tid = t.id;
console.log("[check9d] seed tenant:", tid, "\n");

// ── 1. countOpenJobsByStatus ──
{
  const rows = await openJobs.countOpenJobsByStatus(tid);
  const got: Record<string, number> = {};
  for (const r of rows) got[r.statusCode] = r.count;
  const exp = F.expectedOpenByStatus();
  const total = rows.reduce((s, r) => s + r.count, 0);
  check("countOpenJobsByStatus — per-status counts", mapsEqual(got, exp), `got ${J(got)} exp ${J(exp)}`);
  check("countOpenJobsByStatus — total = 19", total === F.TOTAL_OPEN, `got ${total}`);
}

// ── 2. countOpenJobsByPriority ──
{
  const rows = await openJobs.countOpenJobsByPriority(tid);
  const got: Record<string, number> = {};
  for (const r of rows) got[r.priorityCode] = r.count;
  const exp = F.expectedOpenByPriority();
  check("countOpenJobsByPriority — per-priority counts (0-incl)", mapsEqual(got, exp), `got ${J(got)} exp ${J(exp)}`);
}

// ── 3. topClientsByOpenJobs ──
{
  const rows = await openJobs.topClientsByOpenJobs(tid);
  const got = rows.map((r) => ({ name: r.clientName, count: r.count }));
  const exp = F.expectedTopClients();
  check("topClientsByOpenJobs — ranked names+counts", J(got) === J(exp), `got ${J(got)} exp ${J(exp)}`);
}

// ── 4. topTradesByOpenJobs (top 5; ties at counts 4 and 2 → compare canonicalized) ──
{
  const rows = await openJobs.topTradesByOpenJobs(tid, 5);
  const canon = (a: { code: string; count: number }[]) =>
    [...a].sort((x, y) => y.count - x.count || x.code.localeCompare(y.code)).map((e) => `${e.code}:${e.count}`);
  const got = canon(rows.map((r) => ({ code: r.tradeCode, count: r.count })));
  const exp = canon(F.expectedTopTrades().slice(0, 5));
  check("topTradesByOpenJobs — top-5 (tie-canonical)", J(got) === J(exp), `got ${J(got)} exp ${J(exp)}`);
  check("topTradesByOpenJobs — #1 is HVAC:5", rows[0]?.tradeCode === "HVAC" && rows[0]?.count === 5, `got ${J(rows[0])}`);
}

// ── 5. countStalledJobs ──
{
  const res = await stalledJobs.countStalledJobs(tid);
  const got: Record<string, number> = {};
  for (const r of res.byStatus) got[r.statusCode] = r.count;
  check("countStalledJobs — total = 9", res.total === F.expectedStalledTotal, `got ${res.total} exp ${F.expectedStalledTotal}`);
  check("countStalledJobs — byStatus", mapsEqual(got, F.expectedStalledByStatus()), `got ${J(got)} exp ${J(F.expectedStalledByStatus())}`);
}

// ── 6. countPendingInvoices ──
{
  const res = await pendingInvoices.countPendingInvoices(tid);
  check("countPendingInvoices — vendorPending = 8", res.vendorPending === F.expectedVendorPending, `got ${res.vendorPending} exp ${F.expectedVendorPending}`);
  check("countPendingInvoices — clientPending = 5", res.clientPending === F.expectedClientPending, `got ${res.clientPending} exp ${F.expectedClientPending}`);
  check("countPendingInvoices — total", res.total === F.expectedVendorPending + F.expectedClientPending, `got ${res.total}`);
}

// ── 7. timeInStatusDistribution ──
{
  const rows = await timeInStatus.timeInStatusDistribution(tid);
  const exp = F.expectedTimeInStatus();
  const gotCodes = new Set(rows.map((r) => r.statusCode));
  const expCodes = new Set(Object.keys(exp));
  check(
    "timeInStatusDistribution — exact status set (no terminal COMPLETED/CANCELLED)",
    gotCodes.size === expCodes.size && [...expCodes].every((c) => gotCodes.has(c)),
    `got ${J([...gotCodes])} exp ${J([...expCodes])}`,
  );
  for (const r of rows) {
    const e = exp[r.statusCode];
    if (!e) {
      check(`timeInStatusDistribution[${r.statusCode}] — unexpected status`, false, `reader returned ${r.statusCode} not in oracle`);
      continue;
    }
    const ok = r.count === e.count && within(r.p50Seconds, e.p50Seconds) && within(r.p90Seconds, e.p90Seconds) && within(r.meanSeconds, e.meanSeconds);
    check(`timeInStatusDistribution[${r.statusCode}] — count/p50/p90/mean`, ok, `got ${J({ count: r.count, p50: r.p50Seconds, p90: r.p90Seconds, mean: r.meanSeconds })} exp ${J(e)}`);
  }
}

// ── 8. timeToDispatchDistribution ──
{
  const res = await dispatchTiming.timeToDispatchDistribution(tid);
  const e = F.expectedDispatch();
  const ok = res.count === e.count && within(res.p50Seconds, e.p50Seconds) && within(res.p90Seconds, e.p90Seconds) && within(res.meanSeconds, e.meanSeconds);
  check("timeToDispatchDistribution — count/p50/p90/mean (uniform 3600s by design)", ok, `got ${J(res)} exp ${J(e)}`);
}

// ── 9. operationalQueue ──
{
  const rows = await operationalQueue.operationalQueue(tid, 20);
  check("operationalQueue — returns all 19 open jobs (limit 20)", rows.length === F.TOTAL_OPEN, `got ${rows.length}`);

  // precedence: tier index in URGENCY_TIER_ORDER must be non-decreasing down the list
  const order = stalledRules.URGENCY_TIER_ORDER as readonly string[];
  const idx = (tier: string) => order.indexOf(tier);
  let monotone = true;
  for (let i = 1; i < rows.length; i++) if (idx(rows[i].urgencyTier) < idx(rows[i - 1].urgencyTier)) monotone = false;
  check("operationalQueue — tier precedence monotone (stalled→overdue→unassigned-high→aged)", monotone, `tiers ${J(rows.map((r) => r.urgencyTier))}`);

  // per-tier counts vs oracle
  const tierCounts: Record<string, number> = {};
  for (const r of rows) tierCounts[r.urgencyTier] = (tierCounts[r.urgencyTier] ?? 0) + 1;
  check("operationalQueue — per-tier counts", mapsEqual(tierCounts, F.expectedTierCounts() as unknown as Record<string, number>), `got ${J(tierCounts)} exp ${J(F.expectedTierCounts())}`);

  // per-job classification: map jobNumber → fixture open-job (open jobs are jobNumber 1..19 in array order)
  let perJobOk = true;
  const mism: string[] = [];
  for (const r of rows) {
    const fx = F.OPEN_JOBS[r.jobNumber - 1];
    if (!fx || r.urgencyTier !== fx.expectedTier || r.isStalled !== fx.expectedStalled) {
      perJobOk = false;
      mism.push(`#${r.jobNumber}(${fx?.key}): tier got ${r.urgencyTier}/exp ${fx?.expectedTier}, stalled got ${r.isStalled}/exp ${fx?.expectedStalled}`);
    }
  }
  check("operationalQueue — per-job tier+stalled match fixture ground truth", perJobOk, mism.join("; "));

  // limit slicing
  const top5 = await operationalQueue.operationalQueue(tid, 5);
  let top5Monotone = true;
  for (let i = 1; i < top5.length; i++) if (idx(top5[i].urgencyTier) < idx(top5[i - 1].urgencyTier)) top5Monotone = false;
  check("operationalQueue — limit=5 slices to 5 in precedence order", top5.length === 5 && top5Monotone, `len ${top5.length}`);
}

console.log(`\n[check9d] ${pass}/${pass + fail} checks passed${fail ? ` — FAILED: ${failed.join(", ")}` : ""}`);
console.log(fail === 0 ? "[check9d] ALL 9 ANALYTICS READERS VERIFIED ✓" : `[check9d] ${fail} CHECK(S) FAILED ✗`);
process.exit(fail === 0 ? 0 : 1);
