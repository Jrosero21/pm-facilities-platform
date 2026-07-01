/**
 * scripts/apply-0057-tenant-llm-keys.ts — direct-CREATE apply of migration 0057.
 *
 * Creates the tenant_llm_keys table (CF-23.1 K1): a tenant's encrypted LLM API key, per-(tenant,
 * provider). The generated 0057 splits into 4 statement-breakpoint statements:
 *   1) CREATE TABLE tenant_llm_keys (...)            (10 cols, PK id)
 *   2) ADD CONSTRAINT tlk_tenant_fk      -> tenants(id) ON DELETE cascade
 *   3) ADD CONSTRAINT tlk_created_by_fk  -> users(id)   ON DELETE set null
 *   4) CREATE INDEX tlk_tenant_provider_status_idx (tenant_id, provider, status)
 * Idempotency grain = TABLE presence: a fresh CREATE applies all four together; if the table is
 * already present the whole migration is skipped (re-run safe). The DDL is read VERBATIM from
 * db/migrations/0057_sparkling_annihilus.sql so the applied SQL === the generated migration.
 *
 * Apply convention (house rule): migrations land by DIRECT CREATE/ALTER, sandbox -> prod — NEVER
 * `drizzle-kit migrate` (the __drizzle_migrations ledger undercounts; migrate would replay).
 *
 * TARGET: defaults to SANDBOX (derives *_sandbox from DATABASE_URL). PROD requires the explicit
 * opt-in APPLY_0057_PROD=1 AND a URL that resolves to jonnyrosero_pm (not *_sandbox).
 *
 * GATE 1 (this run): sandbox, no flag.   GATE 2 (Jonny, separately): APPLY_0057_PROD=1 against prod.
 */

export {};

// ===== TARGET GUARD — module top, before any @/server/db import =====
const RAW = process.env.DATABASE_URL;
if (!RAW) {
  console.error("[apply-0057] DATABASE_URL not set — refusing to run.");
  process.exit(2);
}
const APPLY_PROD = process.env.APPLY_0057_PROD === "1";
let target: string;
let intendedDb: string;
if (APPLY_PROD) {
  // PROD path: the URL must already point at prod (not sandbox). Explicit opt-in required.
  if (RAW.includes("_sandbox")) {
    console.error("[apply-0057] APPLY_0057_PROD=1 but URL resolved to sandbox — aborting (prod intent, sandbox URL).");
    process.exit(2);
  }
  target = RAW;
  intendedDb = "jonnyrosero_pm";
} else {
  // DEFAULT path: derive the *_sandbox DB; refuse if it doesn't resolve to one.
  target = RAW.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
  if (!target.includes("pm_sandbox")) {
    console.error("[apply-0057] refusing: could not resolve a *_sandbox DB and APPLY_0057_PROD!=1");
    process.exit(2);
  }
  intendedDb = "pm_sandbox";
}
process.env.DATABASE_URL = target;
console.log(`[apply-0057] target: ${target.replace(/\/\/[^@]+@/, "//<creds>@")}  (intended: ${intendedDb})`);

const TABLE = "tenant_llm_keys";
const FK_TENANT = "tlk_tenant_fk";
const FK_CREATED_BY = "tlk_created_by_fk";
const IDX = "tlk_tenant_provider_status_idx";
const MIGRATION_FILE = "db/migrations/0057_sparkling_annihilus.sql";

async function main() {
  const { readFile } = await import("node:fs/promises");
  const { db } = await import("@/server/db"); // dynamic — after the guard
  const { sql } = await import("drizzle-orm");

  // Ground-truth backstop: the ACTUALLY connected DB must equal the intended target.
  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  const dbName = dbRows[0]?.db ?? "";
  if (dbName !== intendedDb) {
    console.error(`[apply-0057] ABORT: connected DB is "${dbName}", expected "${intendedDb}".`);
    process.exit(2);
  }
  console.log("[apply-0057] connected DB confirmed:", dbName);

  async function tableExists(table: string): Promise<boolean> {
    const [rows] = (await db.execute(
      sql`SELECT COUNT(*) AS n FROM information_schema.TABLES
          WHERE table_schema = DATABASE() AND table_name = ${table}`,
    )) as unknown as [{ n: number }[]];
    return Number(rows[0]?.n) > 0;
  }

  // ---- APPLY (idempotent on table presence) ----
  if (await tableExists(TABLE)) {
    console.log(`[apply-0057] table ${TABLE} present, skip (idempotent re-run).`);
  } else {
    const ddl = await readFile(MIGRATION_FILE, "utf8");
    const statements = ddl
      .split("--> statement-breakpoint")
      .map((s) => s.trim().replace(/;\s*$/, "").trim())
      .filter((s) => s.length > 0);
    console.log(`[apply-0057] table ${TABLE} absent — applying ${statements.length} statement(s) from ${MIGRATION_FILE}:`);
    for (const [i, stmt] of statements.entries()) {
      const head = stmt.split("\n")[0].slice(0, 72);
      await db.execute(sql.raw(stmt));
      console.log(`  [${i + 1}/${statements.length}] OK — ${head}…`);
    }
  }

  // ---- POST-APPLY VERIFY (read back, print) ----
  console.log("\n[apply-0057] verify:");

  const [createRows] = (await db.execute(sql.raw(`SHOW CREATE TABLE \`${TABLE}\``))) as unknown as [Array<Record<string, string>>];
  const createSql = createRows[0]?.["Create Table"] ?? "";
  console.log("---- SHOW CREATE TABLE ----\n" + createSql + "\n---------------------------");

  const [colRows] = (await db.execute(
    sql`SELECT column_name AS name, column_type AS type, is_nullable AS nullable, column_default AS dflt
        FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = ${TABLE}
        ORDER BY ordinal_position`,
  )) as unknown as [{ name: string; type: string; nullable: string; dflt: string | null }[]];
  const colCount = colRows.length;
  const col = (n: string) => colRows.find((c) => c.name === n);
  const providerType = col("provider")?.type ?? "";
  const statusCol = col("status");
  const enc = col("encrypted_key");
  const kref = col("key_ref");
  console.log(`  column count: ${colCount} (expect 10)`);
  console.log(`  provider: ${providerType}`);
  console.log(`  status:   ${statusCol?.type}  default=${statusCol?.dflt}`);
  console.log(`  encrypted_key NOT NULL: ${enc?.nullable === "NO"}   key_ref NOT NULL: ${kref?.nullable === "NO"}`);
  // MariaDB returns a string column_default WITH quotes (e.g. "'active'") — normalize before compare.
  const statusDefault = (statusCol?.dflt ?? "").replace(/'/g, "");
  const enumsOk =
    providerType === "enum('anthropic','openai')" &&
    statusCol?.type === "enum('active','revoked')" &&
    statusDefault === "active" &&
    enc?.nullable === "NO" &&
    kref?.nullable === "NO";

  const [fkRows] = (await db.execute(
    sql`SELECT rc.CONSTRAINT_NAME AS name, rc.DELETE_RULE AS del, kcu.REFERENCED_TABLE_NAME AS ref_table
        FROM information_schema.REFERENTIAL_CONSTRAINTS rc
        JOIN information_schema.KEY_COLUMN_USAGE kcu
          ON kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA AND kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
        WHERE rc.CONSTRAINT_SCHEMA = DATABASE() AND rc.TABLE_NAME = ${TABLE}`,
  )) as unknown as [{ name: string; del: string; ref_table: string }[]];
  const fkTenant = fkRows.find((f) => f.name === FK_TENANT);
  const fkCreated = fkRows.find((f) => f.name === FK_CREATED_BY);
  console.log(`  FK ${FK_TENANT}: -> ${fkTenant?.ref_table} ON DELETE ${fkTenant?.del}`);
  console.log(`  FK ${FK_CREATED_BY}: -> ${fkCreated?.ref_table} ON DELETE ${fkCreated?.del}`);
  const fksOk =
    fkTenant?.ref_table === "tenants" && fkTenant?.del === "CASCADE" &&
    fkCreated?.ref_table === "users" && fkCreated?.del === "SET NULL";

  const [idxRows] = (await db.execute(
    sql`SELECT COUNT(*) AS n FROM information_schema.STATISTICS
        WHERE table_schema = DATABASE() AND table_name = ${TABLE} AND index_name = ${IDX}`,
  )) as unknown as [{ n: number }[]];
  const idxOk = Number(idxRows[0]?.n) > 0;
  console.log(`  index ${IDX}: ${idxOk ? "present" : "MISSING"}`);

  const [cntRows] = (await db.execute(sql.raw(`SELECT COUNT(*) AS n FROM \`${TABLE}\``))) as unknown as [{ n: number }[]];
  const rowCount = Number(cntRows[0]?.n);
  console.log(`  row count: ${rowCount} (expect 0)`);

  if (colCount === 10 && enumsOk && fksOk && idxOk && rowCount === 0) {
    console.log(`\n${intendedDb === "jonnyrosero_pm" ? "PROD" : "SANDBOX"} 0057 APPLIED`);
    process.exit(0);
  }
  console.error("\n[apply-0057] INCOMPLETE — one of count/enums/FKs/index/rows not as expected (see above).");
  process.exit(1);
}

main().catch((e) => { console.error("[apply-0057] ERROR:", e); process.exit(1); });
