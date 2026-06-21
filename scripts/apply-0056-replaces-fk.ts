/**
 * scripts/apply-0056-replaces-fk.ts — direct-ALTER apply of migration 0056.
 *
 * Adds the re-dispatch self-FK on job_vendor_assignments:
 *   1) column  replaces_assignment_id varchar(36) NULL
 *   2) FK      jva_replaces_fk (replaces_assignment_id) -> job_vendor_assignments(id) ON DELETE set null
 *   3) index   jva_replaces_idx (replaces_assignment_id)
 *
 * Apply convention (house rule): migrations land by DIRECT ALTER, sandbox -> prod — NEVER
 * `drizzle-kit migrate` (the __drizzle_migrations ledger undercounts; migrate would replay).
 *
 * TARGET: defaults to SANDBOX (derives *_sandbox from DATABASE_URL). PROD requires the explicit
 * opt-in APPLY_0056_PROD=1 AND a URL that resolves to jonnyrosero_pm (not *_sandbox). Each of the
 * 3 parts is checked independently and applied only if missing, so a re-run / half-applied state
 * is safe.
 *
 * GATE 1 (this run): sandbox, no flag.   GATE 2 (Jonny, separately): APPLY_0056_PROD=1 against prod.
 */

export {};

// ===== TARGET GUARD — module top, before any @/server/db import =====
const RAW = process.env.DATABASE_URL;
if (!RAW) {
  console.error("[apply-0056] DATABASE_URL not set — refusing to run.");
  process.exit(2);
}
const APPLY_PROD = process.env.APPLY_0056_PROD === "1";
let target: string;
let intendedDb: string;
if (APPLY_PROD) {
  // PROD path: the URL must already point at prod (not sandbox). Explicit opt-in required.
  if (RAW.includes("_sandbox")) {
    console.error("[apply-0056] APPLY_0056_PROD=1 but URL resolved to sandbox — aborting (prod intent, sandbox URL).");
    process.exit(2);
  }
  target = RAW;
  intendedDb = "jonnyrosero_pm";
} else {
  // DEFAULT path: derive the *_sandbox DB; refuse if it doesn't resolve to one.
  target = RAW.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
  if (!target.includes("jonnyrosero_pm_sandbox")) {
    console.error("[apply-0056] refusing: could not resolve a *_sandbox DB and APPLY_0056_PROD!=1");
    process.exit(2);
  }
  intendedDb = "jonnyrosero_pm_sandbox";
}
process.env.DATABASE_URL = target;
console.log(`[apply-0056] target: ${target.replace(/\/\/[^@]+@/, "//<creds>@")}  (intended: ${intendedDb})`);

const TABLE = "job_vendor_assignments";
const COL = "replaces_assignment_id";
const FK = "jva_replaces_fk";
const IDX = "jva_replaces_idx";

type Col = { Field: string; Type: string; Null: string; Key: string; Default: string | null; Extra: string };

async function main() {
  const { db } = await import("@/server/db"); // dynamic — after the guard
  const { sql } = await import("drizzle-orm");

  // Ground-truth backstop: the ACTUALLY connected DB must equal the intended target.
  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  const dbName = dbRows[0]?.db ?? "";
  if (dbName !== intendedDb) {
    console.error(`[apply-0056] ABORT: connected DB is "${dbName}", expected "${intendedDb}".`);
    process.exit(2);
  }
  console.log("[apply-0056] connected DB confirmed:", dbName);

  async function columnExists(table: string, col: string): Promise<boolean> {
    const [rows] = (await db.execute(
      sql`SELECT COUNT(*) AS n FROM information_schema.COLUMNS
          WHERE table_schema = DATABASE() AND table_name = ${table} AND column_name = ${col}`,
    )) as unknown as [{ n: number }[]];
    return Number(rows[0]?.n) > 0;
  }
  async function fkExists(table: string, name: string): Promise<boolean> {
    const [rows] = (await db.execute(
      sql`SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS
          WHERE constraint_schema = DATABASE() AND table_name = ${table}
            AND constraint_name = ${name} AND constraint_type = 'FOREIGN KEY'`,
    )) as unknown as [{ n: number }[]];
    return Number(rows[0]?.n) > 0;
  }
  async function indexExists(table: string, idx: string): Promise<boolean> {
    const [rows] = (await db.execute(
      sql`SELECT COUNT(*) AS n FROM information_schema.STATISTICS
          WHERE table_schema = DATABASE() AND table_name = ${table} AND index_name = ${idx}`,
    )) as unknown as [{ n: number }[]];
    return Number(rows[0]?.n) > 0;
  }

  // ---- PART 1: COLUMN (must exist before the FK) ----
  if (await columnExists(TABLE, COL)) {
    console.log(`[apply-0056] column ${TABLE}.${COL} — already present, SKIP`);
  } else {
    await db.execute(sql.raw(`ALTER TABLE \`${TABLE}\` ADD \`${COL}\` varchar(36)`));
    console.log(`[apply-0056] column ${TABLE}.${COL} — ADDED`);
  }

  // ---- PART 2: FK (column guaranteed present now) ----
  if (await fkExists(TABLE, FK)) {
    console.log(`[apply-0056] FK ${FK} — already present, SKIP`);
  } else {
    await db.execute(
      sql.raw(
        `ALTER TABLE \`${TABLE}\` ADD CONSTRAINT \`${FK}\` FOREIGN KEY (\`${COL}\`) ` +
          `REFERENCES \`${TABLE}\`(\`id\`) ON DELETE set null ON UPDATE no action`,
      ),
    );
    console.log(`[apply-0056] FK ${FK} — ADDED`);
  }

  // ---- PART 3: INDEX (named jva_replaces_idx; the FK may auto-create a differently-named
  //      implicit index, so check by THIS name and tolerate a redundant-index rejection) ----
  if (await indexExists(TABLE, IDX)) {
    console.log(`[apply-0056] index ${IDX} — already present, SKIP`);
  } else {
    try {
      await db.execute(sql.raw(`CREATE INDEX \`${IDX}\` ON \`${TABLE}\` (\`${COL}\`)`));
      console.log(`[apply-0056] index ${IDX} — CREATED`);
    } catch (e) {
      console.log(`[apply-0056] index ${IDX} — CREATE skipped/failed (likely redundant w/ FK implicit index): ${(e as Error).message}`);
    }
  }

  // ---- POST-APPLY VERIFY ----
  console.log("\n[apply-0056] verify:");

  const [cols] = (await db.execute(sql.raw(`SHOW COLUMNS FROM \`${TABLE}\` LIKE '${COL}'`))) as unknown as [Col[]];
  const c = cols[0];
  console.log(`  column: Type=${c?.Type}  Null=${c?.Null}  Default=${c?.Default}`);
  const colOk = (c?.Type ?? "") === "varchar(36)" && c?.Null === "YES";
  console.log(`    -> ${colOk ? "OK" : "MISMATCH"} (varchar(36), nullable)`);

  const [fkRows] = (await db.execute(
    sql`SELECT rc.CONSTRAINT_NAME AS name, rc.DELETE_RULE AS del,
               kcu.REFERENCED_TABLE_NAME AS ref_table, kcu.REFERENCED_COLUMN_NAME AS ref_col
        FROM information_schema.REFERENTIAL_CONSTRAINTS rc
        JOIN information_schema.KEY_COLUMN_USAGE kcu
          ON kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA AND kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
        WHERE rc.CONSTRAINT_SCHEMA = DATABASE() AND rc.CONSTRAINT_NAME = ${FK}`,
  )) as unknown as [{ name: string; del: string; ref_table: string; ref_col: string }[]];
  const fk = fkRows[0];
  console.log(`  FK: ${fk?.name}  references ${fk?.ref_table}(${fk?.ref_col})  ON DELETE ${fk?.del}`);
  const fkOk = fk?.name === FK && fk?.ref_table === TABLE && fk?.ref_col === "id" && fk?.del === "SET NULL";
  console.log(`    -> ${fkOk ? "OK" : "MISMATCH"} (jva_replaces_fk -> ${TABLE}(id), SET NULL)`);

  // all indexes on the column (by name) — reports jva_replaces_idx and any FK-implicit index
  const [idxRows] = (await db.execute(
    sql`SELECT DISTINCT index_name AS name FROM information_schema.STATISTICS
        WHERE table_schema = DATABASE() AND table_name = ${TABLE} AND column_name = ${COL}`,
  )) as unknown as [{ name: string }[]];
  const idxNames = idxRows.map((r) => r.name);
  console.log(`  indexes on ${COL}: ${idxNames.join(", ") || "(none)"}`);
  const idxOk = idxNames.includes(IDX);
  console.log(`    -> ${idxOk ? "OK" : "MISSING jva_replaces_idx"} (covered by ${idxNames.length} index(es))`);

  const [cntRows] = (await db.execute(
    sql`SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = ${TABLE}`,
  )) as unknown as [{ n: number }[]];
  const colCount = Number(cntRows[0]?.n);
  console.log(`  column count: ${colCount} (expect 22)`);

  if (colOk && fkOk && idxOk && colCount === 22) {
    console.log(`\n${intendedDb === "jonnyrosero_pm" ? "PROD" : "SANDBOX"} 0056 APPLIED`);
    process.exit(0);
  }
  console.error("\n[apply-0056] INCOMPLETE — one of column/FK/index/count not as expected (see above).");
  process.exit(1);
}

main().catch((e) => { console.error("[apply-0056] ERROR:", e); process.exit(1); });
