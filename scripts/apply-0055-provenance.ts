/**
 * scripts/apply-0055-provenance.ts — direct-ALTER apply of migration 0055 (CF-19.1 provenance).
 *
 * Adds: client_location_hours.hours_source + client_locations.timezone_source,
 *   enum('client_provided','system_default','looked_up') DEFAULT 'system_default' NOT NULL.
 *
 * Apply convention (house rule): migrations land by DIRECT ALTER, sandbox → prod — NEVER
 * `drizzle-kit migrate` (the __drizzle_migrations ledger undercounts; migrate would replay).
 *
 * TARGET: defaults to SANDBOX (derives *_sandbox from DATABASE_URL). PROD requires the explicit
 * opt-in APPLY_0055_PROD=1 AND a URL that resolves to jonnyrosero_pm (not *_sandbox). Idempotent:
 * each ALTER is skipped if the column already exists, so a re-run is safe.
 *
 * GATE 1 (this run): sandbox, no flag.   GATE 2 (Jonny, separately): APPLY_0055_PROD=1 against prod.
 */

export {};

// ===== TARGET GUARD — module top, before any @/server/db import =====
const RAW = process.env.DATABASE_URL;
if (!RAW) {
  console.error("[apply-0055] DATABASE_URL not set — refusing to run.");
  process.exit(2);
}
const APPLY_PROD = process.env.APPLY_0055_PROD === "1";
let target: string;
let intendedDb: string;
if (APPLY_PROD) {
  // PROD path: the URL must already point at prod (not sandbox). Explicit opt-in required.
  if (RAW.includes("_sandbox")) {
    console.error("[apply-0055] APPLY_0055_PROD=1 but URL resolved to sandbox — aborting (prod intent, sandbox URL).");
    process.exit(2);
  }
  target = RAW;
  intendedDb = "jonnyrosero_pm";
} else {
  // DEFAULT path: derive the *_sandbox DB; refuse if it doesn't resolve to one.
  target = RAW.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
  if (!target.includes("pm_sandbox")) {
    console.error("[apply-0055] refusing: could not resolve a *_sandbox DB and APPLY_0055_PROD!=1");
    process.exit(2);
  }
  intendedDb = "pm_sandbox";
}
process.env.DATABASE_URL = target;
console.log(`[apply-0055] target: ${target.replace(/\/\/[^@]+@/, "//<creds>@")}  (intended: ${intendedDb})`);

type Col = { Field: string; Type: string; Null: string; Key: string; Default: string | null; Extra: string };

async function main() {
  const { db } = await import("@/server/db"); // dynamic — after the guard
  const { sql } = await import("drizzle-orm");

  // Ground-truth backstop: the ACTUALLY connected DB must equal the intended target.
  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  const dbName = dbRows[0]?.db ?? "";
  if (dbName !== intendedDb) {
    console.error(`[apply-0055] ABORT: connected DB is "${dbName}", expected "${intendedDb}".`);
    process.exit(2);
  }
  console.log("[apply-0055] connected DB confirmed:", dbName);

  async function columnExists(table: string, col: string): Promise<boolean> {
    const [rows] = (await db.execute(
      sql`SELECT COUNT(*) AS n FROM information_schema.COLUMNS
          WHERE table_schema = DATABASE() AND table_name = ${table} AND column_name = ${col}`,
    )) as unknown as [{ n: number }[]];
    return Number(rows[0]?.n) > 0;
  }

  // Each ALTER is the EXACT generated 0055 DDL; applied only if the column is absent (idempotent).
  const steps = [
    {
      table: "client_location_hours", col: "hours_source",
      ddl: "ALTER TABLE `client_location_hours` ADD `hours_source` enum('client_provided','system_default','looked_up') DEFAULT 'system_default' NOT NULL",
    },
    {
      table: "client_locations", col: "timezone_source",
      ddl: "ALTER TABLE `client_locations` ADD `timezone_source` enum('client_provided','system_default','looked_up') DEFAULT 'system_default' NOT NULL",
    },
  ];

  for (const s of steps) {
    if (await columnExists(s.table, s.col)) {
      console.log(`[apply-0055] ${s.table}.${s.col} — already present, SKIP`);
      continue;
    }
    await db.execute(sql.raw(s.ddl));
    console.log(`[apply-0055] ${s.table}.${s.col} — ADDED`);
  }

  // ---- POST-APPLY VERIFY ----
  console.log("\n[apply-0055] verify:");
  for (const s of steps) {
    const [cols] = (await db.execute(sql.raw(`SHOW COLUMNS FROM \`${s.table}\` LIKE '${s.col}'`))) as unknown as [Col[]];
    const c = cols[0];
    console.log(`  ${s.table}.${s.col}: Type=${c?.Type}  Null=${c?.Null}  Default=${c?.Default}  Extra=${c?.Extra}`);
    const okType = (c?.Type ?? "").replace(/\s+/g, "") === "enum('client_provided','system_default','looked_up')";
    const okShape = okType && c?.Null === "NO" && c?.Default === "system_default";
    console.log(`    → ${okShape ? "OK" : "MISMATCH"} (enum 3 values, NOT NULL, DEFAULT 'system_default')`);
  }

  // ---- row-count + backfill sanity ----
  const [hRows] = (await db.execute(sql`SELECT COUNT(*) AS n FROM client_location_hours`)) as unknown as [{ n: number }[]];
  const [lRows] = (await db.execute(sql`SELECT COUNT(*) AS n FROM client_locations`)) as unknown as [{ n: number }[]];
  const [bRows] = (await db.execute(
    sql`SELECT COUNT(*) AS n FROM client_locations WHERE timezone_source = 'system_default'`,
  )) as unknown as [{ n: number }[]];
  const hN = Number(hRows[0]?.n), lN = Number(lRows[0]?.n), bN = Number(bRows[0]?.n);
  console.log(`\n[apply-0055] rows: client_location_hours=${hN}  client_locations=${lN}  (of which timezone_source='system_default'=${bN})`);
  console.log(`[apply-0055] backfill: all ${lN} client_locations default to 'system_default'? ${bN === lN ? "YES" : "NO"}`);

  console.log(`\n${intendedDb === "jonnyrosero_pm" ? "PROD" : "SANDBOX"} 0055 APPLIED`);
  process.exit(0);
}

main().catch((e) => { console.error("[apply-0055] ERROR:", e); process.exit(1); });
