export {};
/**
 * B-16.4 harness — vendor performance scorer.
 * SANDBOX-ONLY (env-swap guard at module top + SELECT DATABASE() backstop before any write).
 * Runs computeVendorPerformanceScores against the b164 seed fixture, reads the seed manifest
 * (vendorId -> archetype -> expectedRankBand), rolls per-(vendor,trade) scores up to per-vendor
 * (dispatch-weighted), and asserts the archetype ranking holds:
 *   - mean(vendorScore | band 1) > mean(vendorScore | band 4)
 *   - reliable_fast cohort outranks flaky_unreliable cohort
 *   - reliable_slow shows HIGH completion + LOW on-time (the deliberate distinction)
 *   - random_noise (band 0) excluded from rank assertions
 *
 * Run: pnpm tsx --env-file=.env.local --conditions=react-server scripts/check-vendor-performance.ts
 */

// ===== SANDBOX GUARD — module top, before any db import =====
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) { console.error("[vps-check] DATABASE_URL not set"); process.exit(2); }
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[vps-check] refusing: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;

import { readFileSync } from "node:fs";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok  - ${name}`);
  else { failures++; console.error(`  FAIL- ${name}`, detail ?? ""); }
}

type ManifestVendor = {
  vendorId: string; vendorCode: string; archetype: string;
  expectedRankBand: number; assignmentCount: number;
};
type Manifest = { seedTenantId: string; vendors: ManifestVendor[] };

async function main() {
  // ground-truth backstop: confirm the live connection is sandbox before any write
  const { db } = await import("@/server/db");
  const { sql } = await import("drizzle-orm");
  // drizzle mysql2 .execute returns [rows, fields]; rows[0].db is DATABASE()
  const res = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  const dbName = res[0]?.[0]?.db ?? "";
  if (!/_sandbox$/.test(String(dbName))) {
    console.error("[vps-check] ABORT — connected DB is not *_sandbox:", dbName); process.exit(2);
  }
  console.log("[vps-check] connected DB confirmed:", dbName);

  // load manifest (the oracle)
  const manifest: Manifest = JSON.parse(readFileSync("scripts/seed-b16-4/manifest.json", "utf8"));
  const tenantId = manifest.seedTenantId;
  check("manifest loaded with vendors", manifest.vendors.length > 0, manifest.vendors.length);

  // ---- run the populator (first sandbox write) ----
  const { computeVendorPerformanceScores, getVendorPerformanceScores } =
    await import("@/server/analytics/vendor-performance");
  const result = await computeVendorPerformanceScores(tenantId);
  console.log("[vps-check] populator result:", result);
  check("populator wrote score groups", result.groupsWritten > 0, result);
  check("populator covered vendors", result.vendorsCovered > 0, result.vendorsCovered);

  // ---- read scores back, roll up per-vendor (dispatch-weighted) ----
  const perVendor = new Map<string, { score: number; completion: number; onTime: number }>();
  for (const v of manifest.vendors) {
    const rows = await getVendorPerformanceScores(tenantId, v.vendorId);
    if (rows.length === 0) continue;
    // dispatch-weighted mean across the vendor's trade rows
    let wSum = 0, sScore = 0, sComp = 0, sOnTime = 0;
    for (const r of rows) {
      const w = r.totalDispatches ?? 0;
      wSum += w;
      sScore += Number(r.score ?? 0) * w;
      sComp += Number(r.completionRate ?? 0) * w;
      sOnTime += Number(r.onTimeRate ?? 0) * w;
    }
    if (wSum === 0) continue;
    perVendor.set(v.vendorId, { score: sScore / wSum, completion: sComp / wSum, onTime: sOnTime / wSum });
  }
  check("per-vendor scores computed", perVendor.size > 0, perVendor.size);

  // ---- cohort means by archetype ----
  const cohort = (archetype: string) => {
    const xs = manifest.vendors
      .filter((v) => v.archetype === archetype)
      .map((v) => perVendor.get(v.vendorId))
      .filter(Boolean) as { score: number; completion: number; onTime: number }[];
    const mean = (sel: (x: { score: number; completion: number; onTime: number }) => number) =>
      xs.length ? xs.reduce((s, x) => s + sel(x), 0) / xs.length : NaN;
    return { n: xs.length, score: mean((x) => x.score), completion: mean((x) => x.completion), onTime: mean((x) => x.onTime) };
  };

  const rf = cohort("reliable_fast");
  const rs = cohort("reliable_slow");
  const ff = cohort("flaky_fast");
  const fu = cohort("flaky_unreliable");
  const nt = cohort("newcomer_thin");

  console.log("[vps-check] cohort means:");
  for (const [k, c] of Object.entries({ reliable_fast: rf, reliable_slow: rs, flaky_fast: ff, flaky_unreliable: fu, newcomer_thin: nt })) {
    console.log(`    ${k.padEnd(18)} n=${c.n}  score=${c.score.toFixed(1)}  completion=${c.completion.toFixed(1)}  onTime=${c.onTime.toFixed(1)}`);
  }

  // ---- band-level assertion (coarse, no over-fit) ----
  const bandMean = (band: number) => {
    const xs = manifest.vendors
      .filter((v) => v.expectedRankBand === band)
      .map((v) => perVendor.get(v.vendorId)?.score)
      .filter((s): s is number => s !== undefined);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
  };
  const band1 = bandMean(1), band4 = bandMean(4);
  check("band 1 (best) outranks band 4 (worst)", band1 > band4, { band1, band4 });

  // ---- the key archetype assertions ----
  check("reliable_fast outranks flaky_unreliable (score)", rf.score > fu.score, { rf: rf.score, fu: fu.score });
  check("reliable_fast outranks flaky_unreliable (completion)", rf.completion > fu.completion, { rf: rf.completion, fu: fu.completion });
  check("reliable_fast outranks flaky_unreliable (on-time)", rf.onTime > fu.onTime, { rf: rf.onTime, fu: fu.onTime });

  // the deliberate distinction: reliable_slow = HIGH completion, LOW on-time
  check("reliable_slow has HIGH completion (> flaky_unreliable completion)", rs.completion > fu.completion, { rs: rs.completion, fu: fu.completion });
  check("reliable_slow has LOW on-time (< reliable_fast on-time)", rs.onTime < rf.onTime, { rs: rs.onTime, rf: rf.onTime });
  check("reliable_slow completion clearly exceeds its own on-time", rs.completion > rs.onTime + 10, { completion: rs.completion, onTime: rs.onTime });

  // ---- reader smoke: a known vendor returns rows ----
  const sampleVendor = manifest.vendors.find((v) => v.archetype === "reliable_fast");
  if (sampleVendor) {
    const rows = await getVendorPerformanceScores(tenantId, sampleVendor.vendorId);
    check("reader returns score rows for a scored vendor", rows.length > 0, rows.length);
    check("reader rows carry completion + score", rows.every((r) => r.completionRate != null && r.score != null), rows);
  }

  console.log("");
  if (failures > 0) { console.error(`VPS HARNESS RED — ${failures} failure(s).`); process.exit(1); }
  console.log("VPS HARNESS GREEN — scorer ranks archetypes correctly.");
  process.exit(0);
}

main().catch((e) => { console.error("[vps-check] ERROR:", e); process.exit(1); });
