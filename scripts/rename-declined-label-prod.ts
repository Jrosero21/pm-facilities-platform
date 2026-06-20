/**
 * scripts/rename-declined-label-prod.ts — STEP 3 of the "Declined" → "Vendor Declined" rename.
 *
 * PROD-TARGETED, MANUAL, GATED. Renames the single dispatch_assignment_statuses DISPLAY label
 * for code DECLINED from "Declined" to "Vendor Declined". Touches exactly ONE row; no teardown,
 * no other write. The CODE "DECLINED" is unchanged — all platform logic keys on the code, so this
 * is a pure display-label change. Sandbox was already renamed in Step 2; this is the prod half.
 *
 * Jonny runs this himself (the gate):
 *   ALLOW_PROD_LABEL_UPDATE=1 pnpm run label:rename-declined-prod
 *
 * Idempotent: if the label already reads "Vendor Declined", it does nothing and exits 0.
 */

export {};

// ===== PROD GUARD — module top, before any @/server/db import =====
const RAW = process.env.DATABASE_URL;
if (!RAW) {
  console.error("[rename-declined] DATABASE_URL not set — refusing to run.");
  process.exit(2);
}
// Explicit opt-in (this script WRITES to prod — never run by accident).
if (process.env.ALLOW_PROD_LABEL_UPDATE !== "1") {
  console.error("[rename-declined] refusing: set ALLOW_PROD_LABEL_UPDATE=1 to run the prod label update");
  process.exit(2);
}
// This script's INTENDED target is PROD — refuse a sandbox URL too (sandbox is already done).
if (RAW.includes("_sandbox")) {
  console.error("[rename-declined] this script targets PROD; URL resolved to sandbox — aborting");
  process.exit(2);
}
console.log(`[rename-declined] target: ${RAW.replace(/\/\/[^@]+@/, "//<creds>@")}`);

async function main() {
  const { db } = await import("@/server/db"); // dynamic — after the guard
  const { sql } = await import("drizzle-orm");

  // Ground-truth: confirm the ACTUALLY connected DB is prod jonnyrosero_pm (not sandbox/other).
  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  const dbName = dbRows[0]?.db ?? "";
  if (dbName !== "jonnyrosero_pm") {
    console.error(`[rename-declined] ABORT: connected DB is "${dbName}", expected "jonnyrosero_pm".`);
    process.exit(2);
  }
  console.log("[rename-declined] connected DB confirmed:", dbName);

  // PRE-WRITE read-back (show Jonny the before-state).
  const [pre] = (await db.execute(
    sql`SELECT code, name FROM dispatch_assignment_statuses WHERE code = 'DECLINED'`,
  )) as unknown as [{ code: string; name: string }[]];
  if (!pre[0]) {
    console.error("[rename-declined] DECLINED row not found — aborting");
    process.exit(2);
  }
  console.log(`[rename-declined] before: (code='${pre[0].code}', name='${pre[0].name}')`);
  if (pre[0].name === "Vendor Declined") {
    console.log("[rename-declined] already renamed, nothing to do");
    process.exit(0);
  }

  // THE WRITE — single row, by code. rows-affected captured from the ResultSetHeader.
  const [res] = (await db.execute(
    sql`UPDATE dispatch_assignment_statuses SET name = 'Vendor Declined' WHERE code = 'DECLINED'`,
  )) as unknown as [{ affectedRows: number }];
  const affected = res?.affectedRows ?? 0;
  console.log(`[rename-declined] rows affected: ${affected}`);
  if (affected !== 1) {
    console.warn(`[rename-declined] WARNING: expected exactly 1 row affected, got ${affected} — NOT attempting any fix.`);
  }

  // POST-WRITE read-back.
  const [post] = (await db.execute(
    sql`SELECT code, name FROM dispatch_assignment_statuses WHERE code = 'DECLINED'`,
  )) as unknown as [{ code: string; name: string }[]];
  console.log(`[rename-declined] after: (code='${post[0]?.code}', name='${post[0]?.name}')`);

  if (post[0]?.name === "Vendor Declined") {
    console.log("DONE: prod label is now 'Vendor Declined'");
    process.exit(0);
  }
  console.error(`[rename-declined] FAILED: label is '${post[0]?.name}', expected 'Vendor Declined'`);
  process.exit(1);
}

main().catch((e) => { console.error("[rename-declined] ERROR:", e); process.exit(1); });
