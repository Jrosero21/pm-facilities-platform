/**
 * scripts/set-agent-conditions-policy.ts — set a CONDITIONED agent policy for a tenant.
 *
 * Phase 28 policy-conditions C3. Since there is no authoring UI yet, this is the kept, reusable
 * way to SET a policy whose JSON carries a `conditions` block (the C1 vocabulary). The conditions
 * are VALIDATED through the C1 `conditionsSchema` BEFORE writing (a malformed block is rejected at
 * author time, never stored as the "invalid" sentinel), then written via the blessed
 * `activateAgentPolicy` path (insert draft → activate, demoting any prior active for the key).
 *
 * SANDBOX by default (module-top derivation + SELECT DATABASE() assert). PROD only with
 * SET_CONDITIONS_PROD=1 (NOT used this rung).
 *
 * TWO MODES:
 *   • DEMONSTRATION (default, no CONDITIONS_JSON) — seeds a tenant-level + a per-client policy
 *     on phase9-seed-tenant, resolves both (showing most-specific whole-cloth override), then
 *     tears the demo policies down. Run:
 *       pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/set-agent-conditions-policy.ts
 *   • CUSTOM SET (CONDITIONS_JSON given) — sets ONE real policy and leaves it active (no teardown):
 *       CONDITIONS_TENANT_ID=<id> CONDITIONS_JSON='{"maxNteAmount":500,"blockedPriorityCodes":["EMERGENCY"]}' \
 *       [CONDITIONS_AGENT_ID=dispatch_router_v1] [CONDITIONS_CLIENT_ID=<id|empty=tenant-level>] \
 *       [CONDITIONS_AUTONOMY=true] [CONDITIONS_REQUIRES_REVIEW=false] \
 *       pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/set-agent-conditions-policy.ts
 */

export {};

const RAW = process.env.DATABASE_URL;
if (!RAW) { console.error("[set-cond] DATABASE_URL not set."); process.exit(2); }
const PROD = process.env.SET_CONDITIONS_PROD === "1";
let target: string;
let intendedDb: string;
if (PROD) {
  if (RAW.includes("_sandbox")) { console.error("[set-cond] SET_CONDITIONS_PROD=1 but URL is sandbox — abort."); process.exit(2); }
  target = RAW; intendedDb = "jonnyrosero_pm";
} else {
  target = RAW.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
  if (!target.includes("jonnyrosero_pm_sandbox")) { console.error("[set-cond] could not resolve a *_sandbox DB and SET_CONDITIONS_PROD!=1."); process.exit(2); }
  intendedDb = "jonnyrosero_pm_sandbox";
}
process.env.DATABASE_URL = target;
console.log(`[set-cond] target: ${target.replace(/\/\/[^@]+@/, "//<creds>@")}  (intended: ${intendedDb})`);

const DEFAULT_AGENT = "dispatch_router_v1";
const DEMO_TENANT_SLUG = "phase9-seed-tenant";

async function main() {
  const { db } = await import("@/server/db");
  const { agentPolicies, tenants, clients } = await import("@/server/schema");
  const { and, eq, sql } = await import("drizzle-orm");
  const { v7: uuidv7 } = await import("uuid");
  const { activateAgentPolicy, resolveAgentPolicy } = await import("@/server/agents/config/policies");
  const { conditionsSchema, parseConditions } = await import("@/server/agents/config/conditions");

  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  if ((dbRows[0]?.db ?? "") !== intendedDb) { console.error(`[set-cond] ABORT: connected "${dbRows[0]?.db}" != "${intendedDb}".`); process.exit(2); }
  console.log("[set-cond] connected DB confirmed:", dbRows[0]?.db);

  // The reusable core: validate conditions, build the policy JSON, write via activateAgentPolicy.
  async function setConditionsPolicy(input: {
    tenantId: string; agentId: string; clientId: string | null;
    conditions: unknown; autonomyEnabled: boolean; requiresReview: boolean;
  }): Promise<string> {
    const parsed = conditionsSchema.safeParse(input.conditions);
    if (!parsed.success) {
      throw new Error(`conditions REJECTED at author time (not stored): ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    const policy = { requiresReview: input.requiresReview, autonomyEnabled: input.autonomyEnabled, conditions: parsed.data };
    const id = uuidv7();
    await db.insert(agentPolicies).values({ id, tenantId: input.tenantId, clientId: input.clientId, agentId: input.agentId, policy, status: "draft" });
    await activateAgentPolicy({ tenantId: input.tenantId, agentId: input.agentId, clientId: input.clientId, id }); // demote prior active + activate
    return id;
  }

  // ── quick inline validation assertion (the C1 schema rejects a malformed block) ──
  const malformed = conditionsSchema.safeParse({ maxNteAmount: "five hundred" });
  console.log(`[set-cond] validation check — { maxNteAmount: "five hundred" } rejected? ${malformed.success === false ? "YES ✓" : "NO ✗"}`);

  // ── CUSTOM SET mode (CONDITIONS_JSON given) ──
  if (process.env.CONDITIONS_JSON) {
    const tenantId = process.env.CONDITIONS_TENANT_ID;
    if (!tenantId) { console.error("[set-cond] CONDITIONS_TENANT_ID required in custom-set mode."); process.exit(2); }
    const agentId = process.env.CONDITIONS_AGENT_ID || DEFAULT_AGENT;
    const clientId = process.env.CONDITIONS_CLIENT_ID || null;
    const conditions = JSON.parse(process.env.CONDITIONS_JSON) as unknown;
    const autonomyEnabled = process.env.CONDITIONS_AUTONOMY !== "false";
    const requiresReview = process.env.CONDITIONS_REQUIRES_REVIEW === "true";
    const id = await setConditionsPolicy({ tenantId, agentId, clientId, conditions, autonomyEnabled, requiresReview });
    const resolved = await resolveAgentPolicy(tenantId, agentId, clientId);
    console.log(`[set-cond] CUSTOM SET active (id=${id.slice(0, 8)}):`, resolved, "→ conditions:", parseConditions(resolved.raw));
    console.log("[set-cond] left active (custom set — no teardown).");
    process.exit(0);
  }

  // ── DEMONSTRATION mode (default) ──
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, DEMO_TENANT_SLUG)).limit(1);
  if (!tenant) { console.error("[set-cond] phase9-seed-tenant not found."); process.exit(2); }
  const tenantId = tenant.id;
  const [client] = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.tenantId, tenantId)).limit(1);
  if (!client) { console.error("[set-cond] no client under phase9-seed-tenant."); process.exit(2); }
  const agentId = DEFAULT_AGENT;

  console.log(`\n[set-cond] DEMONSTRATION on ${DEMO_TENANT_SLUG} (agent ${agentId}), per-client = ${client.name} (${client.id.slice(0, 8)})`);

  // 1) tenant-level "world view": under $500, no other filters.
  await setConditionsPolicy({ tenantId, agentId, clientId: null, conditions: { maxNteAmount: 500 }, autonomyEnabled: true, requiresReview: false });
  // 2) per-client override: under $1000 except HVAC / EMERGENCY (whole policy, NOT merged with #1).
  await setConditionsPolicy({ tenantId, agentId, clientId: client.id, conditions: { maxNteAmount: 1000, blockedTradeCodes: ["HVAC"], blockedPriorityCodes: ["EMERGENCY"] }, autonomyEnabled: true, requiresReview: false });

  // 3) resolve both — most-specific wins; the client policy is taken WHOLE.
  const tenantResolved = await resolveAgentPolicy(tenantId, agentId, null);
  const clientResolved = await resolveAgentPolicy(tenantId, agentId, client.id);
  console.log("\n[set-cond] RESOLUTIONS (most-specific-wins, whole-cloth — NOT merged):");
  console.log("  tenant-level (tenant,agent,null):", { source: tenantResolved.source, autonomyEnabled: tenantResolved.autonomyEnabled }, "→ conditions:", parseConditions(tenantResolved.raw));
  console.log("  per-client   (tenant,agent,Cx) :", { source: clientResolved.source, autonomyEnabled: clientResolved.autonomyEnabled }, "→ conditions:", parseConditions(clientResolved.raw));

  let ok = true;
  const check = (n: string, c: boolean) => { console.log(`  ${c ? "PASS" : "FAIL"} — ${n}`); if (!c) ok = false; };
  const tc = parseConditions(tenantResolved.raw);
  const cc = parseConditions(clientResolved.raw);
  console.log("\n[set-cond] assertions:");
  check("tenant-level resolves source=tenant", tenantResolved.source === "tenant");
  check("tenant-level conditions = { maxNteAmount: 500 }", tc !== null && tc !== "invalid" && tc.maxNteAmount === 500 && tc.blockedTradeCodes === undefined);
  check("per-client resolves source=tenant_client (most-specific wins)", clientResolved.source === "tenant_client");
  check("per-client conditions taken WHOLE (1000 + HVAC + EMERGENCY, NOT 500)", cc !== null && cc !== "invalid" && cc.maxNteAmount === 1000 && cc.blockedTradeCodes?.includes("HVAC") === true && cc.blockedPriorityCodes?.includes("EMERGENCY") === true);

  // 4) TEARDOWN — remove the demo policies (phase9-seed-tenant had 0 dispatch_router_v1 rows before).
  const removed = await db.delete(agentPolicies).where(and(eq(agentPolicies.tenantId, tenantId), eq(agentPolicies.agentId, agentId)));
  const remaining = (await db.select({ id: agentPolicies.id }).from(agentPolicies).where(and(eq(agentPolicies.tenantId, tenantId), eq(agentPolicies.agentId, agentId)))).length;
  console.log(`\n[set-cond] teardown: removed demo policies (affected ${removed.rowCount ?? "?"}); remaining dispatch_router_v1 rows for tenant: ${remaining} (expect 0). Resolver now falls back to agent_policy_defaults.`);

  console.log(`\n[set-cond] ${ok && remaining === 0 ? "DEMONSTRATION PASSED" : "DEMONSTRATION INCOMPLETE"}`);
  process.exit(ok && remaining === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[set-cond] ERROR:", e instanceof Error ? e.message : e); process.exit(1); });
