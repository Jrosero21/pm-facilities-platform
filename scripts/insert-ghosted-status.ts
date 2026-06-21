/**
 * scripts/insert-ghosted-status.ts — insert the GHOSTED dispatch reference-data row.
 *
 * Phase 28 rung 1, batch 2. Adds the 10th dispatch_assignment_statuses row (code GHOSTED)
 * defined in db/seeds/dispatch-reference.ts. Data-only (category reuses the existing enum value
 * 'cancelled' → no schema migration). Idempotent: keyed on code; a pre-existing GHOSTED is a no-op.
 *
 * GLOBAL reference data — no tenant dimension (mirrors job_statuses / trades). Values are
 * HARDCODED to match the seed verbatim (the seed runs main() on import and doesn't export its
 * array, so importing it is unsafe). Keep in sync with db/seeds/dispatch-reference.ts.
 *
 * DEFAULT = SANDBOX. PROD only with INSERT_GHOSTED_PROD=1 (and a non-sandbox URL):
 *   pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/insert-ghosted-status.ts
 *   INSERT_GHOSTED_PROD=1 pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/insert-ghosted-status.ts   (Jonny's gate)
 */

export {};

// ===== TARGET GUARD — module top, before any @/server/db import =====
const RAW = process.env.DATABASE_URL;
if (!RAW) {
  console.error("[ghosted] DATABASE_URL not set — refusing to run.");
  process.exit(2);
}
const INSERT_PROD = process.env.INSERT_GHOSTED_PROD === "1";
let target: string;
let intendedDb: string;
if (INSERT_PROD) {
  // PROD path: the URL must already point at prod (not sandbox). Explicit opt-in required.
  if (RAW.includes("_sandbox")) {
    console.error("[ghosted] INSERT_GHOSTED_PROD=1 but URL resolved to sandbox — aborting (prod intent, sandbox URL).");
    process.exit(2);
  }
  target = RAW;
  intendedDb = "jonnyrosero_pm";
} else {
  // DEFAULT path: derive the *_sandbox DB; refuse if it doesn't resolve to one.
  target = RAW.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
  if (!target.includes("jonnyrosero_pm_sandbox")) {
    console.error("[ghosted] refusing: could not resolve a *_sandbox DB and INSERT_GHOSTED_PROD!=1");
    process.exit(2);
  }
  intendedDb = "jonnyrosero_pm_sandbox";
}
process.env.DATABASE_URL = target;
console.log(`[ghosted] target: ${target.replace(/\/\/[^@]+@/, "//<creds>@")}  (intended: ${intendedDb})`);

// GHOSTED row — verbatim from db/seeds/dispatch-reference.ts (id/status/createdBy/timestamps default).
const GHOSTED = {
  name: "Vendor Ghosted",
  code: "GHOSTED",
  category: "cancelled" as const,
  sortOrder: 100,
  isTerminal: true,
  description:
    "Vendor went silent on a sent dispatch past the SLA window — no response, no-show. Distinct code from Declined/Cancelled (ghost-rate is reportable), same operational category.",
};

async function main() {
  const { db } = await import("@/server/db"); // dynamic — after the guard
  const { dispatchAssignmentStatuses } = await import("@/server/schema");
  const { eq, sql } = await import("drizzle-orm");

  // Ground-truth: connected DB must equal the intended target.
  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  const dbName = dbRows[0]?.db ?? "";
  if (dbName !== intendedDb) {
    console.error(`[ghosted] ABORT: connected DB is "${dbName}", expected "${intendedDb}".`);
    process.exit(2);
  }
  console.log("[ghosted] connected DB confirmed:", dbName);

  // PRE-CHECK (idempotent, keyed on code).
  const existing = await db
    .select({
      code: dispatchAssignmentStatuses.code,
      name: dispatchAssignmentStatuses.name,
      category: dispatchAssignmentStatuses.category,
      sortOrder: dispatchAssignmentStatuses.sortOrder,
      isTerminal: dispatchAssignmentStatuses.isTerminal,
    })
    .from(dispatchAssignmentStatuses)
    .where(eq(dispatchAssignmentStatuses.code, GHOSTED.code))
    .limit(1);

  if (existing.length > 0) {
    console.log("[ghosted] GHOSTED already present, nothing to do:", existing[0]);
  } else {
    await db.insert(dispatchAssignmentStatuses).values({
      name: GHOSTED.name,
      code: GHOSTED.code,
      category: GHOSTED.category,
      sortOrder: GHOSTED.sortOrder,
      isTerminal: GHOSTED.isTerminal,
      description: GHOSTED.description,
    });
    console.log("[ghosted] GHOSTED row inserted.");
  }

  // POST-VERIFY.
  const [row] = await db
    .select({
      code: dispatchAssignmentStatuses.code,
      name: dispatchAssignmentStatuses.name,
      category: dispatchAssignmentStatuses.category,
      sortOrder: dispatchAssignmentStatuses.sortOrder,
      isTerminal: dispatchAssignmentStatuses.isTerminal,
    })
    .from(dispatchAssignmentStatuses)
    .where(eq(dispatchAssignmentStatuses.code, GHOSTED.code))
    .limit(1);
  console.log("[ghosted] post-verify GHOSTED:", row);

  const all = await db
    .select({
      code: dispatchAssignmentStatuses.code,
      name: dispatchAssignmentStatuses.name,
      isTerminal: dispatchAssignmentStatuses.isTerminal,
    })
    .from(dispatchAssignmentStatuses)
    .orderBy(dispatchAssignmentStatuses.sortOrder);
  console.log(`[ghosted] dispatch_assignment_statuses count: ${all.length} (expect 10)`);
  console.table(all);

  if (row?.code === "GHOSTED" && row.isTerminal === true && all.length === 10) {
    console.log(`${INSERT_PROD ? "PROD" : "SANDBOX"} GHOSTED INSERTED`);
    process.exit(0);
  }
  console.error("[ghosted] INCOMPLETE — GHOSTED row or count not as expected (see above).");
  process.exit(1);
}

main().catch((e) => { console.error("[ghosted] ERROR:", e); process.exit(1); });
