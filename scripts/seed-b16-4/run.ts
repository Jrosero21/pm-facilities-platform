/**
 * B-16.4 dev-seed — P4: runnable entrypoint + manifest + teardown.
 *
 * SANDBOX-ONLY (guard at module top, before any @/server/db import).
 *
 * Modes (argv):
 *   (default)        generate the world, write manifest
 *   --teardown       remove ONLY this seed's data (by manifest + namespace), then exit
 *   --reset          teardown then generate (idempotent re-seed)
 *
 * Teardown safety: deletes strictly within this seed's namespaced tenant and
 * SEED- vendors, children-first under FK_CHECKS=0, scoped by the dedicated
 * seed tenant id. It NEVER touches the phase9 fixture (different tenant) or any
 * other tenant's data. If no manifest exists, teardown falls back to the seed
 * tenant slug — still namespace-scoped, never global.
 */

// ===== SANDBOX GUARD — module top, before any db import =====
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[b16.4-seed] DATABASE_URL not set — refusing to run.");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[b16.4-seed] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log("[b16.4-seed] target:", sandboxUrl.replace(/\/\/[^@]+@/, "//<creds>@"));

// ===== imports (after swap) =====
// @/server/db is loaded dynamically inside the functions (after the guard). A static
// import would hoist above the guard and connect to dev. @/server/schema is
// connection-safe (no schema file imports db) and stays static — its table objects
// are needed for the teardown deletes. ./generate + ./timeline load db dynamically
// themselves, so importing them here statically does NOT connect.
import { writeFileSync } from "node:fs";
import {
  tenants, vendors, vendorTradeCoverage,
  jobVendorAssignments, jobVendorAssignmentStatusHistory,
  vendorEtaConfirmations, vendorCheckIns, vendorCheckOuts,
  jobs, jobStatusHistory, jobEvents, jobPriorityHistory, jobTradeHistory,
  tenantJobSequences, auditLogs, clients, clientLocations,
} from "@/server/schema";
import { eq, sql } from "drizzle-orm";
import { NS, ARCHETYPES } from "./config";
import { generatePlan, loadStatusIds } from "./generate";
import { writeTimelines } from "./timeline";

/**
 * Ground-truth backstop: query the ACTUAL connected database and abort unless it's
 * a *_sandbox DB. This checks the real connection (not the env var), so even if the
 * dynamic-import guard ever regresses, the seed cannot write to dev. Runs before any
 * write, in every mode.
 */
async function assertSandboxConnection(): Promise<void> {
  const { db } = await import("@/server/db");
  const [rows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [
    { db: string }[],
  ];
  const dbName = rows[0]?.db ?? "";
  if (!/_sandbox$/.test(dbName)) {
    console.error(`[b16.4-seed] ABORT: connected DB is "${dbName}", not a *_sandbox DB. Refusing to write.`);
    process.exit(2);
  }
  console.log("[b16.4-seed] connected DB confirmed:", dbName);
}

// ---- manifest shape (the scorer harness reads this) ----
type Manifest = {
  seedTenantId: string;
  createdAt: string;
  vendors: {
    vendorId: string;
    vendorCode: string;
    archetype: string;
    expectedRankBand: number;
    assignmentCount: number;
    jobIds: string[];
    assignmentIds: string[];
  }[];
  counts: Record<string, number>;
};

async function resolveSeedTenantId(): Promise<string | null> {
  const { db } = await import("@/server/db"); // dynamic — after the guard
  const rows = await db.select({ id: tenants.id })
    .from(tenants).where(eq(tenants.slug, NS.tenantSlug)).limit(1);
  return rows[0]?.id ?? null;
}

async function teardown(): Promise<void> {
  const { db } = await import("@/server/db"); // dynamic — after the guard
  const tenantId = await resolveSeedTenantId();
  if (!tenantId) {
    console.log("[b16.4-seed] teardown: no seed tenant found — nothing to remove.");
    return;
  }
  console.log("[b16.4-seed] teardown: removing seed tenant", tenantId, "subtree…");

  // pre-count for the log (everything is scoped to the dedicated seed tenant)
  const [{ n: vendorCount }] = await db
    .select({ n: sql<number>`count(*)` }).from(vendors).where(eq(vendors.tenantId, tenantId));
  const [{ n: assignmentCount }] = await db
    .select({ n: sql<number>`count(*)` }).from(jobVendorAssignments).where(eq(jobVendorAssignments.tenantId, tenantId));

  // EVERY table the seed (transitively) writes carries tenant_id, so teardown is a
  // uniform tenant-scoped sweep — complete (no orphans) and namespace-safe (only the
  // dedicated seed tenant; never the phase9 fixture). FK_CHECKS=0 so order is moot.
  const tenantScoped = [
    jobVendorAssignmentStatusHistory, vendorEtaConfirmations, vendorCheckIns, vendorCheckOuts,
    jobVendorAssignments, jobStatusHistory, jobEvents, jobPriorityHistory, jobTradeHistory,
    vendorTradeCoverage, auditLogs, tenantJobSequences, jobs, vendors, clientLocations, clients,
  ];
  await db.execute(sql`SET FOREIGN_KEY_CHECKS=0`);
  try {
    for (const tbl of tenantScoped) {
      await db.delete(tbl).where(eq(tbl.tenantId, tenantId));
    }
    await db.delete(tenants).where(eq(tenants.id, tenantId)); // the tenant itself (no tenant_id)
  } finally {
    await db.execute(sql`SET FOREIGN_KEY_CHECKS=1`);
  }
  console.log(`[b16.4-seed] teardown complete: ${vendorCount} vendors, ${assignmentCount} assignments + all job/presence/history/audit rows under the seed tenant removed.`);
}

async function generate(): Promise<void> {
  console.log("[b16.4-seed] generating world…");
  const plan = await generatePlan();
  const statusIds = await loadStatusIds();
  const counts = await writeTimelines(plan, statusIds);

  const manifest: Manifest = {
    seedTenantId: plan.tenantId,
    createdAt: plan.createdAt,
    vendors: plan.vendors.map((v) => ({
      vendorId: v.vendorId,
      vendorCode: v.vendorCode,
      archetype: v.archetype,
      expectedRankBand: ARCHETYPES[v.archetype].expectedRankBand,
      assignmentCount: v.assignments.length,
      jobIds: v.assignments.map((a) => a.jobId),
      assignmentIds: v.assignments.map((a) => a.assignmentId),
    })),
    counts: {
      vendors: plan.vendors.length,
      assignments: plan.vendors.reduce((n, v) => n + v.assignments.length, 0),
      ...counts,
    },
  };
  writeFileSync(NS.manifestPath, JSON.stringify(manifest, null, 2));
  console.log("[b16.4-seed] manifest written:", NS.manifestPath);
  console.log("[b16.4-seed] counts:", manifest.counts);
}

async function main() {
  const mode = process.argv.includes("--teardown") ? "teardown"
    : process.argv.includes("--reset") ? "reset" : "generate";

  // Ground-truth backstop BEFORE any read or write — abort unless really on *_sandbox.
  await assertSandboxConnection();

  if (mode === "teardown") { await teardown(); process.exit(0); }
  if (mode === "reset") { await teardown(); await generate(); process.exit(0); }
  await generate();
  process.exit(0);
}

main().catch((e) => { console.error("[b16.4-seed] ERROR:", e); process.exit(1); });
