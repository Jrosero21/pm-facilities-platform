/**
 * scripts/check-billing-rules.ts — CF-27.7 Seam 0 MARKUP-RULES harness.
 *
 * Acceptance proof for the client_billing_rules writer + the read-side contract:
 *   C — create lands is_default+active+markup; resolveClientMarkupDefault resolves it (margin flows)
 *   D — single-default invariant through create + set-default (prior default demoted; exactly one)
 *   A — archive clears default → resolve null; recovers when another rule is set default
 *   V — validation: invalid/missing markup + empty name throw named errors, write no row
 *   I — at most ONE (is_default=true AND status=active) per client, checked after every mutation
 *
 * No LLM / no agent. SANDBOX ONLY — hard-guarded (forces *_sandbox; exit 2 otherwise). Self-seeds a
 * fresh tenant + client and tears it down by tracked id under FK_CHECKS=0. Reuses the global seed
 * operator (no user seed/teardown — the check-job-edit precedent). Run: pnpm run db:check:billing-rules
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-billing-rules] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-billing-rules] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[check-billing-rules] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "billing-rules-harness-tenant";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const { tenants, clients, clientBillingRules, auditLogs, users } = await import("@/server/schema");
  const { and, eq, inArray, sql } = await import("drizzle-orm");
  const {
    createClientBillingRule, setDefaultClientBillingRule, archiveClientBillingRule,
  } = await import("@/server/billing/billing-rules");
  const { resolveClientMarkupDefault } = await import("@/server/billing/client-invoices");

  let tId = "";
  let clientA = "";

  async function teardown() {
    try {
      await db.transaction(async (tx) => {
        if (clientA) await tx.delete(clientBillingRules).where(eq(clientBillingRules.clientId, clientA));
        if (tId) {
          await tx.delete(auditLogs).where(eq(auditLogs.tenantId, tId));
          await tx.delete(clients).where(eq(clients.tenantId, tId));
          await tx.delete(tenants).where(eq(tenants.id, tId));
        }
      });
    } catch (e) { console.error("[check-billing-rules] teardown warning:", e); }
  }

  // pre-clean a leftover harness tenant (idempotency)
  {
    const prior = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG)).limit(1);
    if (prior[0]) {
      const pt = prior[0].id;
      const pClients = (await db.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, pt))).map((c) => c.id);
      await db.transaction(async (tx) => {
        if (pClients.length) await tx.delete(clientBillingRules).where(inArray(clientBillingRules.clientId, pClients));
        await tx.delete(auditLogs).where(eq(auditLogs.tenantId, pt));
        await tx.delete(clients).where(eq(clients.tenantId, pt));
        await tx.delete(tenants).where(eq(tenants.id, pt));
      });
    }
  }

  // helpers
  const ruleRow = async (id: string) =>
    (await db.select().from(clientBillingRules).where(eq(clientBillingRules.id, id)).limit(1))[0];
  const defaultCount = async () =>
    (await db.select({ id: clientBillingRules.id }).from(clientBillingRules).where(
      and(eq(clientBillingRules.clientId, clientA), eq(clientBillingRules.isDefault, true), eq(clientBillingRules.status, "active")),
    )).length;
  const auditCount = async (action: string, targetId: string) =>
    (await db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.action, action), eq(auditLogs.targetId, targetId)))).length;
  const ruleCount = async () =>
    (await db.select({ id: clientBillingRules.id }).from(clientBillingRules).where(eq(clientBillingRules.clientId, clientA))).length;
  const expectThrow = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); return false; } catch (e) { return (e as Error).message === msg; }
  };

  try {
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    check("setup: seed operator exists", !!operator);
    if (!operator) return finish();

    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Billing-Rules Harness Tenant" });
    clientA = uuidv7();
    await db.insert(clients).values({ id: clientA, tenantId: tId, name: "Billing Client A" });

    // ════════ C — create + read-side contract ════════
    console.log("\n[C] CREATE + resolve");
    const { id: r1 } = await createClientBillingRule({ tenantId: tId, clientId: clientA, actorUserId: operator.id, name: "Standard", markupPercent: "18", isDefault: true });
    const r1row = await ruleRow(r1);
    check("C1: R1 created active + is_default + markup normalizes to 18.000 + audit created",
      r1row?.status === "active" && r1row?.isDefault === true && r1row?.markupPercent === "18.000" && (await auditCount("client_billing_rule.created", r1)) === 1,
      JSON.stringify({ status: r1row?.status, def: r1row?.isDefault, mk: r1row?.markupPercent }));
    check("C2: resolveClientMarkupDefault === 18.000 (the read-side contract — margin will flow)",
      (await resolveClientMarkupDefault(tId, clientA)) === "18.000");
    check("I (after C): exactly one is_default+active", (await defaultCount()) === 1);

    // ════════ D — single-default invariant ════════
    console.log("\n[D] SINGLE-DEFAULT invariant (create + set-default demote prior)");
    const { id: r2 } = await createClientBillingRule({ tenantId: tId, clientId: clientA, actorUserId: operator.id, name: "Premium", markupPercent: "25", isDefault: true });
    check("D1: creating R2 as default demotes R1; resolve === 25.000",
      (await ruleRow(r2))?.isDefault === true && (await ruleRow(r1))?.isDefault === false
        && (await resolveClientMarkupDefault(tId, clientA)) === "25.000" && (await defaultCount()) === 1,
      JSON.stringify({ r2def: (await ruleRow(r2))?.isDefault, r1def: (await ruleRow(r1))?.isDefault }));

    await setDefaultClientBillingRule({ tenantId: tId, clientId: clientA, ruleId: r1, actorUserId: operator.id });
    check("D2: setDefault back to R1 → R1 default, R2 demoted, exactly ONE default, audit set_default; resolve === 18.000",
      (await ruleRow(r1))?.isDefault === true && (await ruleRow(r2))?.isDefault === false
        && (await defaultCount()) === 1 && (await auditCount("client_billing_rule.set_default", r1)) === 1
        && (await resolveClientMarkupDefault(tId, clientA)) === "18.000");

    // ════════ A — archive clears default → resolve null → recover ════════
    console.log("\n[A] ARCHIVE clears default");
    await archiveClientBillingRule({ tenantId: tId, ruleId: r1, actorUserId: operator.id });
    check("A1: archive R1 → status archived + is_default cleared + audit archived; resolve === null (no active default)",
      (await ruleRow(r1))?.status === "archived" && (await ruleRow(r1))?.isDefault === false
        && (await auditCount("client_billing_rule.archived", r1)) === 1
        && (await resolveClientMarkupDefault(tId, clientA)) === null && (await defaultCount()) === 0);
    await setDefaultClientBillingRule({ tenantId: tId, clientId: clientA, ruleId: r2, actorUserId: operator.id });
    check("A2: set R2 default again → resolve === 25.000 (recovers after archive)",
      (await resolveClientMarkupDefault(tId, clientA)) === "25.000" && (await defaultCount()) === 1);

    // ════════ V — validation (no row written) ════════
    console.log("\n[V] VALIDATION (throws named errors, writes no row)");
    const before = await ruleCount();
    const vMarkup = await expectThrow(() => createClientBillingRule({ tenantId: tId, clientId: clientA, actorUserId: operator.id, name: "Bad", markupPercent: "abc", isDefault: false }), "MARKUP_INVALID");
    const vName = await expectThrow(() => createClientBillingRule({ tenantId: tId, clientId: clientA, actorUserId: operator.id, name: "  ", markupPercent: "10", isDefault: false }), "NAME_REQUIRED");
    const vReq = await expectThrow(() => createClientBillingRule({ tenantId: tId, clientId: clientA, actorUserId: operator.id, name: "NoMarkup", markupPercent: "", isDefault: false }), "MARKUP_REQUIRED");
    check("V1: invalid markup → MARKUP_INVALID", vMarkup);
    check("V2: empty name → NAME_REQUIRED", vName);
    check("V3: missing markup → MARKUP_REQUIRED", vReq);
    check("V4: no rows written by the rejected creates", (await ruleCount()) === before);

    console.log("\n[HONESTY]");
    console.log("  [check-billing-rules] SEEDED-FIXTURE proof on the REAL writer + resolveClientMarkupDefault.");
    console.log("  No LLM/money derivation — markup is operator-entered. Proves the single-default invariant");
    console.log("  through create/set-default/archive, and that the resolved default is what margin flows from.");

    return finish();
  } finally {
    await teardown();
    console.log("[check-billing-rules] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-billing-rules] passed: ${passed}`);
  console.log(`[check-billing-rules] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-billing-rules] MARKUP-RULES LEDGER RED ✗");
  } else {
    console.log("[check-billing-rules] MARKUP-RULES LEDGER GREEN ✓ (create+resolve / single-default invariant / archive-clears-default→null / validation)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => { console.error("[check-billing-rules] FAILED:", e); process.exit(1); });
