/**
 * scripts/check-client-rates.ts — Phase (i) rate-sheet CLIENT-RATES harness.
 *
 * Acceptance proof for the client_rates writer + billing-model setter:
 *   C — create trade-specific + general rates; both coexist ACTIVE (NO demote — the rate-vs-billing-rule
 *       difference); listClientRates joins the trade name
 *   V — validation: bad rate_type / amount / trade → named errors, no row written
 *   A — archive one rate → archived; the other untouched
 *   M — setClientBillingModel: change audits from→to; UNCHANGED is a no-op (no audit); invalid throws
 *   Au — audit rows: client_rate.created ×2, client_rate.archived, client.billing_model_changed ×1 (not 2)
 *
 * No LLM / no agent. SANDBOX ONLY — hard-guarded (exit 2 otherwise). Self-seeds a tenant + client,
 * reuses the global seed operator + the global HVAC trade (no user/trade seed). Run: pnpm run db:check:client-rates
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-client-rates] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[check-client-rates] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-client-rates] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "client-rates-harness-tenant";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const { tenants, clients, clientRates, auditLogs, users, trades } = await import("@/server/schema");
  const { and, eq, inArray, sql } = await import("drizzle-orm");
  const {
    createClientRate, archiveClientRate, listClientRates, setClientBillingModel,
  } = await import("@/server/billing/client-rates");

  let tId = "";
  let clientA = "";

  async function teardown() {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
        if (clientA) await tx.delete(clientRates).where(eq(clientRates.clientId, clientA));
        if (tId) {
          await tx.delete(auditLogs).where(eq(auditLogs.tenantId, tId));
          await tx.delete(clients).where(eq(clients.tenantId, tId));
          await tx.delete(tenants).where(eq(tenants.id, tId));
        }
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
      });
    } catch (e) { console.error("[check-client-rates] teardown warning:", e); }
  }

  // pre-clean a leftover harness tenant (idempotency)
  {
    const prior = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG)).limit(1);
    if (prior[0]) {
      const pt = prior[0].id;
      const pClients = (await db.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, pt))).map((c) => c.id);
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
        if (pClients.length) await tx.delete(clientRates).where(inArray(clientRates.clientId, pClients));
        await tx.delete(auditLogs).where(eq(auditLogs.tenantId, pt));
        await tx.delete(clients).where(eq(clients.tenantId, pt));
        await tx.delete(tenants).where(eq(tenants.id, pt));
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
      });
    }
  }

  // helpers
  const rateRow = async (id: string) =>
    (await db.select().from(clientRates).where(eq(clientRates.id, id)).limit(1))[0];
  const activeCount = async () =>
    (await db.select({ id: clientRates.id }).from(clientRates).where(
      and(eq(clientRates.clientId, clientA), eq(clientRates.status, "active")),
    )).length;
  const totalRates = async () =>
    (await db.select({ id: clientRates.id }).from(clientRates).where(eq(clientRates.clientId, clientA))).length;
  const auditCount = async (action: string) =>
    (await db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.tenantId, tId), eq(auditLogs.action, action)))).length;
  const clientModel = async () =>
    (await db.select({ bm: clients.billingModel }).from(clients).where(eq(clients.id, clientA)).limit(1))[0]?.bm;
  const expectThrow = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); return false; } catch (e) { return (e as Error).message === msg; }
  };

  try {
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [hvac] = await db.select({ id: trades.id, name: trades.name }).from(trades).where(eq(trades.code, "HVAC"));
    check("setup: seed operator + HVAC trade exist", !!operator && !!hvac);
    if (!operator || !hvac) return finish();

    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Client-Rates Harness Tenant" });
    clientA = uuidv7();
    await db.insert(clients).values({ id: clientA, tenantId: tId, name: "Rate Client A" }); // billing_model defaults cost_plus

    // ════════ C — create + coexist (no demote) ════════
    console.log("\n[C] CREATE — trade-specific + general rates coexist ACTIVE");
    const { id: r1 } = await createClientRate({ tenantId: tId, clientId: clientA, actorUserId: operator.id, tradeId: hvac.id, rateType: "hourly", amount: "95" });
    const r1row = await rateRow(r1);
    check("C1: trade-specific hourly rate → active, amount '95.00', audit created",
      r1row?.status === "active" && r1row?.amount === "95.00" && r1row?.tradeId === hvac.id && (await auditCount("client_rate.created")) === 1,
      JSON.stringify({ status: r1row?.status, amt: r1row?.amount }));
    const { id: r2 } = await createClientRate({ tenantId: tId, clientId: clientA, actorUserId: operator.id, tradeId: null, rateType: "per_unit", amount: "40", unit: "each" });
    const r2row = await rateRow(r2);
    check("C2: general (no-trade) per_unit rate → active, trade_id null, unit 'each'",
      r2row?.status === "active" && r2row?.tradeId === null && r2row?.unit === "each");
    const list = await listClientRates(tId, clientA);
    const byId = new Map(list.map((r) => [r.id, r]));
    check("C3: listClientRates returns BOTH active (NO demote) with trade name joined (HVAC / null)",
      list.length === 2 && (await activeCount()) === 2
        && byId.get(r1)?.tradeName === hvac.name && byId.get(r2)?.tradeName === null,
      JSON.stringify({ n: list.length, t1: byId.get(r1)?.tradeName, t2: byId.get(r2)?.tradeName }));

    // ════════ V — validation (no row written) ════════
    console.log("\n[V] VALIDATION");
    const before = await totalRates();
    const vType = await expectThrow(() => createClientRate({ tenantId: tId, clientId: clientA, actorUserId: operator.id, tradeId: null, rateType: "bogus", amount: "10" }), "RATE_TYPE_INVALID");
    const vAmt = await expectThrow(() => createClientRate({ tenantId: tId, clientId: clientA, actorUserId: operator.id, tradeId: null, rateType: "hourly", amount: "-5" }), "AMOUNT_INVALID");
    const vTrade = await expectThrow(() => createClientRate({ tenantId: tId, clientId: clientA, actorUserId: operator.id, tradeId: uuidv7(), rateType: "hourly", amount: "10" }), "TRADE_NOT_FOUND");
    check("V1: bad rate_type → RATE_TYPE_INVALID", vType);
    check("V2: amount '-5' → AMOUNT_INVALID", vAmt);
    check("V3: bogus trade_id → TRADE_NOT_FOUND", vTrade);
    check("V4: no rows written by the rejected creates", (await totalRates()) === before);

    // ════════ A — archive one, other untouched ════════
    console.log("\n[A] ARCHIVE one rate");
    await archiveClientRate({ tenantId: tId, rateId: r1, actorUserId: operator.id });
    check("A1: archive R1 → status archived + audit; R2 still active (untouched)",
      (await rateRow(r1))?.status === "archived" && (await rateRow(r2))?.status === "active"
        && (await auditCount("client_rate.archived")) === 1 && (await activeCount()) === 1);

    // ════════ M — billing-model setter ════════
    console.log("\n[M] BILLING MODEL setter");
    await setClientBillingModel({ tenantId: tId, clientId: clientA, actorUserId: operator.id, billingModel: "rate_sheet" });
    const auditAfterM1 = await auditCount("client.billing_model_changed");
    check("M1: set rate_sheet → billing_model='rate_sheet' + audit billing_model_changed {cost_plus→rate_sheet}",
      (await clientModel()) === "rate_sheet" && auditAfterM1 === 1);
    await setClientBillingModel({ tenantId: tId, clientId: clientA, actorUserId: operator.id, billingModel: "rate_sheet" });
    check("M2: set rate_sheet AGAIN (unchanged) → no-op, NO new audit row (still 1)",
      (await clientModel()) === "rate_sheet" && (await auditCount("client.billing_model_changed")) === 1);
    const vModel = await expectThrow(() => setClientBillingModel({ tenantId: tId, clientId: clientA, actorUserId: operator.id, billingModel: "bogus" }), "BILLING_MODEL_INVALID");
    check("M3: invalid model → BILLING_MODEL_INVALID, model unchanged (still rate_sheet)",
      vModel && (await clientModel()) === "rate_sheet");

    // ════════ Au — audit ledger ════════
    console.log("\n[Au] AUDIT ledger");
    check("Au: client_rate.created ×2, client_rate.archived ×1, client.billing_model_changed ×1 (not 2)",
      (await auditCount("client_rate.created")) === 2 && (await auditCount("client_rate.archived")) === 1 && (await auditCount("client.billing_model_changed")) === 1);

    console.log("\n[HONESTY]");
    console.log("  [check-client-rates] SEEDED-FIXTURE proof on the REAL writer. No LLM — rates are");
    console.log("  operator-entered. Proves rates COEXIST (no demote, unlike billing rules), validation");
    console.log("  rejects bad input, archive is scoped, and the billing-model change is no-op-safe + audited.");

    return finish();
  } finally {
    await teardown();
    console.log("[check-client-rates] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-client-rates] passed: ${passed}`);
  console.log(`[check-client-rates] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-client-rates] CLIENT-RATES LEDGER RED ✗");
  } else {
    console.log("[check-client-rates] CLIENT-RATES LEDGER GREEN ✓ (coexisting rates / trade-name join / validation / scoped archive / no-op-safe model change + audit)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => { console.error("[check-client-rates] FAILED:", e); process.exit(1); });
