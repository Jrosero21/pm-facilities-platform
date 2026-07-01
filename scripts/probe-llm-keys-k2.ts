/**
 * scripts/probe-llm-keys-k2.ts — SANDBOX probe for resolveLlmKey + setTenantLlmKey (CF-23.1 K2).
 * Sets an in-process TEST master key (like secret-crypto.harness) BEFORE the db/crypto imports, so
 * it round-trips without Jonny's real SECRET_ENCRYPTION_KEY. Against phase9-seed-tenant, sandbox only.
 *
 *   pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/probe-llm-keys-k2.ts
 */

export {};

// ===== SANDBOX GUARD =====
const RAW = process.env.DATABASE_URL;
if (!RAW) { console.error("[k2] DATABASE_URL not set."); process.exit(2); }
const sandboxUrl = RAW.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) { console.error("[k2] refusing: not *_sandbox."); process.exit(2); }
process.env.DATABASE_URL = sandboxUrl;
console.log(`[k2] sandbox target confirmed: ${sandboxUrl.replace(/\/\/[^@]+@/, "//<creds>@")}`);

const TENANT_SLUG = "phase9-seed-tenant";

async function main() {
  // In-process TEST master key set BEFORE importing the crypto-using module (key is read per-call).
  const { generateSecretKey } = await import("@/server/security/secret-crypto");
  const KEY_A = generateSecretKey();
  const KEY_B = generateSecretKey();
  process.env.SECRET_ENCRYPTION_KEY = KEY_A;

  const { db } = await import("@/server/db");
  const { tenants, tenantLlmKeys } = await import("@/server/schema");
  const { eq, and, sql } = await import("drizzle-orm");
  const { resolveLlmKey, setTenantLlmKey } = await import("@/server/security/llm-keys");

  const { rows: dbRows } = (await db.execute(sql`SELECT current_database() AS db`)) as unknown as { rows: { db: string }[] };
  if (!/_sandbox$/.test(dbRows[0]?.db ?? "")) { console.error("[k2] ABORT: not *_sandbox."); process.exit(2); }
  console.log("[k2] connected DB confirmed:", dbRows[0]?.db);

  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TENANT_SLUG)).limit(1);
  if (!tenant) { console.error("[k2] phase9-seed-tenant not found."); process.exit(2); }
  const tenantId = tenant.id;

  let allPass = true;
  const check = (n: string, c: boolean) => { console.log(`  ${c ? "PASS" : "FAIL"} — ${n}`); if (!c) allPass = false; };
  async function cleanup() {
    await db.delete(tenantLlmKeys).where(eq(tenantLlmKeys.tenantId, tenantId));
  }
  async function activeCount(provider: "anthropic" | "openai"): Promise<number> {
    return (await db.select({ id: tenantLlmKeys.id }).from(tenantLlmKeys)
      .where(and(eq(tenantLlmKeys.tenantId, tenantId), eq(tenantLlmKeys.provider, provider), eq(tenantLlmKeys.status, "active")))).length;
  }
  async function revokedCount(provider: "anthropic" | "openai"): Promise<number> {
    return (await db.select({ id: tenantLlmKeys.id }).from(tenantLlmKeys)
      .where(and(eq(tenantLlmKeys.tenantId, tenantId), eq(tenantLlmKeys.provider, provider), eq(tenantLlmKeys.status, "revoked")))).length;
  }

  await cleanup();
  // capture console.error output for the loud-flag assertion (key must NOT appear in it).
  const errLog: string[] = [];
  const origErr = console.error;
  console.error = (...args: unknown[]) => { errLog.push(args.map(String).join(" ")); };

  try {
    process.env.SECRET_ENCRYPTION_KEY = KEY_A;

    // 1) STORE → RESOLVE round-trip
    console.log("\n[k2] 1) store → resolve round-trip");
    await setTenantLlmKey({ tenantId, provider: "anthropic", plaintextKey: "sk-ant-test-ABC123" });
    const r1 = await resolveLlmKey(tenantId, "anthropic");
    check("key decrypts back to the stored plaintext", r1.key === "sk-ant-test-ABC123");
    check("source tenant", r1.source === "tenant");

    // 2) SINGLE-ACTIVE: set a different key → prior revoked, resolve returns the NEW key
    console.log("\n[k2] 2) single-active (revoke-then-insert)");
    await setTenantLlmKey({ tenantId, provider: "anthropic", plaintextKey: "sk-ant-test-NEW999" });
    check("exactly 1 active row", (await activeCount("anthropic")) === 1);
    check("prior row revoked (1 revoked)", (await revokedCount("anthropic")) === 1);
    const r2 = await resolveLlmKey(tenantId, "anthropic");
    check("resolve returns the NEW key", r2.key === "sk-ant-test-NEW999");

    // 3) PLATFORM FALLBACK (no key for openai)
    console.log("\n[k2] 3) platform fallback (no key)");
    const r3 = await resolveLlmKey(tenantId, "openai");
    check("key null", r3.key === null);
    check("source platform", r3.source === "platform");
    check("no tenantKeyError", r3.tenantKeyError === undefined);

    // 4) LOUD-FLAG on a tampered blob
    console.log("\n[k2] 4) loud-flag on bad blob");
    await db.update(tenantLlmKeys)
      .set({ encryptedKey: "v1:GARBAGE:GARBAGE:GARBAGE" })
      .where(and(eq(tenantLlmKeys.tenantId, tenantId), eq(tenantLlmKeys.provider, "anthropic"), eq(tenantLlmKeys.status, "active")));
    const beforeErrCount = errLog.length;
    const r4 = await resolveLlmKey(tenantId, "anthropic");
    check("key null (fell back)", r4.key === null);
    check("source platform", r4.source === "platform");
    check("tenantKeyError decrypt_failed", r4.tenantKeyError === "decrypt_failed");
    check("a console.error fired (loud floor)", errLog.length > beforeErrCount);
    const loudLine = errLog[errLog.length - 1] ?? "";
    check("loud line does NOT leak the key/plaintext/blob",
      !loudLine.includes("sk-ant-test") && !loudLine.includes("NEW999") && !loudLine.includes("GARBAGE") && !loudLine.includes("v1:"));

    // 5) WRONG-ENV-KEY fallback: store under KEY_A, swap master to KEY_B, resolve → decrypt fails → platform
    console.log("\n[k2] 5) wrong/rotated master key → fail-closed to platform");
    await cleanup();
    process.env.SECRET_ENCRYPTION_KEY = KEY_A;
    await setTenantLlmKey({ tenantId, provider: "anthropic", plaintextKey: "sk-ant-test-ROTATE" });
    process.env.SECRET_ENCRYPTION_KEY = KEY_B; // rotated/wrong master
    const r5 = await resolveLlmKey(tenantId, "anthropic");
    check("key null under wrong master", r5.key === null);
    check("source platform", r5.source === "platform");
    check("tenantKeyError decrypt_failed", r5.tenantKeyError === "decrypt_failed");
    process.env.SECRET_ENCRYPTION_KEY = KEY_A; // restore
  } finally {
    console.error = origErr;
    await cleanup();
    const left = (await db.select({ id: tenantLlmKeys.id }).from(tenantLlmKeys).where(eq(tenantLlmKeys.tenantId, tenantId))).length;
    console.log(`\n[k2] teardown: tenant_llm_keys rows left for tenant = ${left}`);
  }

  console.log(`\n[k2] ${allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("[k2] ERROR:", e); process.exit(1); });
