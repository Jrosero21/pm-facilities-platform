// OFFLINE mock harness. Sets DISPATCH_TIEBREAKER_MOCK before any import so
// routing resolves mock with no key. No DB, no network. Run with:
//   pnpm exec tsx --conditions=react-server src/server/agents/dispatch-tiebreaker/llm.harness.ts
// (--conditions=react-server satisfies the `import "server-only"` in the graph;
//  the import graph pulls NO @/server/db module and nothing connects — mock path
//  never calls generateObject.)
process.env.DISPATCH_TIEBREAKER_MOCK = "1";

import assert from "node:assert/strict";
import {
  resolveDispatchTiebreakerRouting, generateDispatchTiebreak, validateTiebreakPick,
  type TiebreakCandidate,
} from "./llm";

let pass = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => { pass++; console.log(`  ok ${name}`); });
}
const pair: TiebreakCandidate[] = [
  { vendorId: "vA", vendorName: "A HVAC", tradeContext: "rooftop package units" },
  { vendorId: "vB", vendorName: "B Mechanical", tradeContext: "split systems, light commercial" },
];

async function main() {
  console.log("dispatch tiebreaker (offline/mock) harness");

  await test("routing resolves to mock with no key", () => {
    assert.deepEqual(resolveDispatchTiebreakerRouting(), { mode: "mock" });
  });
  await test("mock returns exactly {vendorId,confidence,rationale} — no numeric field", async () => {
    const out = await generateDispatchTiebreak({ routing: { mode: "mock" }, systemPrompt: "", temperature: 0.2, problemDescription: "rooftop unit not cooling", pair });
    assert.deepEqual(Object.keys(out.object).sort(), ["confidence", "rationale", "vendorId"]);
    for (const v of Object.values(out.object)) assert.notEqual(typeof v, "number");
  });
  await test("mock pick is one of the candidate pair", async () => {
    const out = await generateDispatchTiebreak({ routing: { mode: "mock" }, systemPrompt: "", temperature: 0.2, problemDescription: "x", pair });
    assert.ok(["vA", "vB"].includes(out.object.vendorId));
  });
  await test("mock confidence is a valid enum member", async () => {
    const out = await generateDispatchTiebreak({ routing: { mode: "mock" }, systemPrompt: "", temperature: 0.2, problemDescription: "x", pair });
    assert.ok(["high", "medium", "low"].includes(out.object.confidence));
  });
  await test("mock is offline-truthful: model 'mock', zero tokens", async () => {
    const out = await generateDispatchTiebreak({ routing: { mode: "mock" }, systemPrompt: "", temperature: 0.2, problemDescription: "x", pair });
    assert.equal(out.model, "mock");
    assert.equal(out.usage.inputTokens, 0);
    assert.equal(out.usage.outputTokens, 0);
  });
  await test("validateTiebreakPick: in-pair honored, out-of-pair/empty rejected", () => {
    assert.equal(validateTiebreakPick("vA", ["vA", "vB"]), "vA");
    assert.equal(validateTiebreakPick("vZ", ["vA", "vB"]), null);   // hallucinated vendor -> fallback
    assert.equal(validateTiebreakPick("", ["vA", "vB"]), null);
  });

  console.log(`\n${pass} passed`);
}
main().catch((e) => { console.error(e); process.exit(1); });
