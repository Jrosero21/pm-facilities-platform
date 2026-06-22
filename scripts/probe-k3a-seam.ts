/**
 * scripts/probe-k3a-seam.ts — OFFLINE seam probe for CF-23.1 K3a (no DB, no network).
 * Proves: (a) the no-op invariant — buildCandidates is byte-identical with absent / undefined / {}
 * providerKeys; (b) apiKey THREADING — buildProviderModel + buildCandidates forward the right key to
 * the registry's buildModel (via a registry-level spy); (c) real construction — both the singleton
 * (no key) and factory (key) paths build a valid model without a network call.
 *
 *   pnpm exec tsx --conditions=react-server scripts/probe-k3a-seam.ts
 */

import assert from "node:assert/strict";

// Fake PLATFORM keys so both providers are "available" (providerAvailable reads env). No network is
// made — model construction is lazy; we never invoke generateObject.
process.env.ANTHROPIC_API_KEY = "sk-ant-FAKE-platform";
process.env.OPENAI_API_KEY = "sk-oai-FAKE-platform";

async function main() {
  const { buildProviderModel, PROVIDER_REGISTRY } = await import("@/server/agents/providers");
  const { buildCandidates } = await import("@/server/agents/failover");
  let pass = 0;
  const ok = (n: string) => { pass++; console.log(`  ok ${n}`); };

  const routing = {
    mode: "direct" as const,
    provider: "anthropic" as const,
    modelId: "claude-sonnet-4-6",
    recordedModel: "anthropic/claude-sonnet-4-6",
  };
  const fo = ["anthropic/claude-sonnet-4-6", "openai/gpt-5.4"];
  const recorded = (cs: { recordedModel: string }[]) => cs.map((c) => c.recordedModel);

  console.log("K3a seam probe\n(a) NO-OP INVARIANT");
  const a = buildCandidates(routing, fo);
  const b = buildCandidates(routing, fo, undefined);
  const c = buildCandidates(routing, fo, {});
  assert.equal(a.length, 2); // anthropic + openai (both available)
  assert.deepEqual(recorded(a), ["anthropic/claude-sonnet-4-6", "openai/gpt-5.4"]);
  ok("absent providerKeys → 2 candidates, expected recordedModel list");
  assert.deepEqual(recorded(b), recorded(a));
  ok("undefined providerKeys → identical recordedModel list (byte-identical to absent)");
  assert.deepEqual(recorded(c), recorded(a));
  ok("empty {} providerKeys → identical recordedModel list (empty map = no keys = today)");
  // base-only path (no failoverOrder) is likewise stable.
  assert.deepEqual(recorded(buildCandidates(routing, undefined)), recorded(buildCandidates(routing, undefined, {})));
  ok("base-only (no failoverOrder) → identical with/without providerKeys");

  console.log("\n(b) APIKEY THREADING (registry-level spy — deterministic, no network)");
  const realBuild = PROVIDER_REGISTRY.anthropic.buildModel;
  const realBuildOai = PROVIDER_REGISTRY.openai.buildModel;
  const seen: Array<{ provider: string; apiKey: string | undefined }> = [];
  try {
    // Spy: record the apiKey each provider's buildModel receives; return a stub model (no SDK call).
    const stub = (bareId: string) => ({ modelId: bareId } as unknown as ReturnType<typeof realBuild>);
    PROVIDER_REGISTRY.anthropic.buildModel = (bareId: string, apiKey?: string) => { seen.push({ provider: "anthropic", apiKey }); return stub(bareId); };
    PROVIDER_REGISTRY.openai.buildModel = (bareId: string, apiKey?: string) => { seen.push({ provider: "openai", apiKey }); return stub(bareId); };

    seen.length = 0;
    buildProviderModel("anthropic", "claude-sonnet-4-6");
    assert.deepEqual(seen, [{ provider: "anthropic", apiKey: undefined }]);
    ok("buildProviderModel(no apiKey) → buildModel got apiKey undefined (singleton path)");

    seen.length = 0;
    buildProviderModel("anthropic", "claude-sonnet-4-6", "sk-ant-TENANT");
    assert.deepEqual(seen, [{ provider: "anthropic", apiKey: "sk-ant-TENANT" }]);
    ok("buildProviderModel(apiKey) → buildModel got the tenant key (factory path)");

    // NOTE: buildCandidates eagerly builds `base` (then discards it when failoverOrder yields
    // candidates), so buildModel is called for base + each candidate. We assert PER-PROVIDER key
    // correctness (order/count-independent) rather than an exact call list.
    seen.length = 0;
    buildCandidates(routing, fo); // no providerKeys
    assert.ok(seen.length >= 2 && seen.every((s) => s.apiKey === undefined));
    ok("buildCandidates(no providerKeys) → every buildModel call got apiKey undefined (singleton)");

    seen.length = 0;
    buildCandidates(routing, fo, { anthropic: "sk-ant-TENANT" }); // anthropic key only
    assert.ok(seen.filter((s) => s.provider === "anthropic").every((s) => s.apiKey === "sk-ant-TENANT"));
    assert.ok(seen.filter((s) => s.provider === "openai").every((s) => s.apiKey === undefined));
    ok("buildCandidates({anthropic}) → anthropic calls got the tenant key, openai got undefined (platform)");
  } finally {
    PROVIDER_REGISTRY.anthropic.buildModel = realBuild;
    PROVIDER_REGISTRY.openai.buildModel = realBuildOai;
  }

  console.log("\n(c) REAL CONSTRUCTION (no network — model build is lazy)");
  const m1 = buildProviderModel("anthropic", "claude-sonnet-4-6");                 // singleton
  const m2 = buildProviderModel("anthropic", "claude-sonnet-4-6", undefined);      // singleton
  const m3 = buildProviderModel("anthropic", "claude-sonnet-4-6", "sk-ant-FAKE");  // factory (createAnthropic)
  for (const [n, m] of [["singleton", m1], ["singleton(undefined)", m2], ["factory(key)", m3]] as const) {
    assert.ok(m && typeof m === "object", `${n} built a model object`);
    assert.equal((m as { modelId?: string }).modelId, "claude-sonnet-4-6", `${n} modelId === bareId`);
  }
  ok("singleton (no key), singleton (undefined), and factory (key) ALL build a valid model, no throw, no network");
  assert.ok(m1 !== m3);
  ok("factory(key) model is a distinct instance from the singleton (createAnthropic path was taken)");

  console.log(`\n${pass} passed`);
  process.exit(0);
}

main().catch((e) => { console.error("[k3a] ERROR:", e); process.exit(1); });
