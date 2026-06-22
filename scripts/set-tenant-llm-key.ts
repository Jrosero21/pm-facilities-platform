/**
 * scripts/set-tenant-llm-key.ts — store a tenant's LLM API key, ENCRYPTED (CF-23.1 K2).
 *
 * Validates nothing about the key's provider-validity (that surfaces at call time); it encrypts via
 * secret-crypto and writes one active tenant_llm_keys row per (tenant, provider), demoting any prior
 * active row (single-active). Reads back via resolveLlmKey and prints { source, hasKey, tenantKeyError }
 * — NEVER the key itself.
 *
 * REQUIRES SECRET_ENCRYPTION_KEY in the env (the real master key) — errors clearly if unset. This is a
 * REAL-key tool (it stores a real tenant key); do NOT auto-generate a master key here.
 *
 * Env-driven:
 *   TENANT_KEY_TENANT_ID   (required)  — the tenant uuid
 *   TENANT_KEY_PROVIDER    (default anthropic) — anthropic | openai
 *   TENANT_KEY_PLAINTEXT   (required)  — the raw provider API key to encrypt+store
 *   TENANT_KEY_LABEL       (optional)  — a human label
 *
 *   pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/set-tenant-llm-key.ts
 *
 * SANDBOX by default (module-top *_sandbox derivation + SELECT DATABASE() assert). PROD only with
 * SET_TENANT_KEY_PROD=1 AND a URL that resolves to jonnyrosero_pm.
 */

export {};

// ===== TARGET GUARD — module top, before any @/server/* import =====
const RAW = process.env.DATABASE_URL;
if (!RAW) { console.error("[set-key] DATABASE_URL not set — refusing."); process.exit(2); }
const PROD = process.env.SET_TENANT_KEY_PROD === "1";
let target: string;
let intendedDb: string;
if (PROD) {
  if (RAW.includes("_sandbox")) { console.error("[set-key] SET_TENANT_KEY_PROD=1 but URL is sandbox — abort."); process.exit(2); }
  target = RAW;
  intendedDb = "jonnyrosero_pm";
} else {
  target = RAW.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
  if (!target.includes("jonnyrosero_pm_sandbox")) { console.error("[set-key] could not resolve a *_sandbox DB and SET_TENANT_KEY_PROD!=1."); process.exit(2); }
  intendedDb = "jonnyrosero_pm_sandbox";
}
process.env.DATABASE_URL = target;
console.log(`[set-key] target: ${target.replace(/\/\/[^@]+@/, "//<creds>@")}  (intended: ${intendedDb})`);

async function main() {
  if (!process.env.SECRET_ENCRYPTION_KEY) {
    console.error("[set-key] SECRET_ENCRYPTION_KEY is not set — refusing (cannot encrypt without the master key).");
    process.exit(2);
  }
  const tenantId = process.env.TENANT_KEY_TENANT_ID;
  const provider = (process.env.TENANT_KEY_PROVIDER ?? "anthropic") as "anthropic" | "openai";
  const plaintextKey = process.env.TENANT_KEY_PLAINTEXT;
  const label = process.env.TENANT_KEY_LABEL ?? null;
  if (!tenantId || !plaintextKey) {
    console.error("[set-key] TENANT_KEY_TENANT_ID and TENANT_KEY_PLAINTEXT are required.");
    process.exit(2);
  }
  if (provider !== "anthropic" && provider !== "openai") {
    console.error(`[set-key] TENANT_KEY_PROVIDER must be anthropic|openai (got "${provider}").`);
    process.exit(2);
  }

  const { db } = await import("@/server/db");
  const { sql } = await import("drizzle-orm");
  const { setTenantLlmKey, resolveLlmKey } = await import("@/server/security/llm-keys");

  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  const dbName = dbRows[0]?.db ?? "";
  if (dbName !== intendedDb) { console.error(`[set-key] ABORT: connected DB is "${dbName}", expected "${intendedDb}".`); process.exit(2); }
  console.log("[set-key] connected DB confirmed:", dbName);

  const { id } = await setTenantLlmKey({ tenantId, provider, plaintextKey, label });
  const resolved = await resolveLlmKey(tenantId, provider);
  console.log(`[set-key] stored row id=${id}`);
  console.log(`[set-key] readback: { source: "${resolved.source}", hasKey: ${resolved.key != null}, tenantKeyError: ${resolved.tenantKeyError ?? "none"} }`);
  console.log(`[set-key] ${intendedDb === "jonnyrosero_pm" ? "PROD" : "SANDBOX"} ${provider} key set for tenant ${tenantId}.`);
  process.exit(0);
}

main().catch((e) => { console.error("[set-key] ERROR:", e instanceof Error ? e.message : String(e)); process.exit(1); });
