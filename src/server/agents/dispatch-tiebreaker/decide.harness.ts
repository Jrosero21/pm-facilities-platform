import assert from "node:assert/strict";
import {
  parseTiebreakerMode, shouldFireTiebreaker, applyTiebreak,
  DEFAULT_TIEBREAKER_MODE, type TiebreakerMode,
} from "./decide";

let pass = 0;
function test(n: string, fn: () => void) { fn(); pass++; console.log(`  ok ${n}`); }
console.log("dispatch tiebreaker DECISION harness");

// parseTiebreakerMode
test("parse: known modes pass through", () => {
  assert.equal(parseTiebreakerMode({ tiebreakerMode: "always_on_close_call" }), "always_on_close_call");
  assert.equal(parseTiebreakerMode({ tiebreakerMode: "off" }), "off");
  assert.equal(parseTiebreakerMode({ tiebreakerMode: "autonomy_only" }), "autonomy_only");
});
test("parse: null/absent/unknown/garbage => conservative default", () => {
  for (const raw of [null, undefined, {}, { tiebreakerMode: "bogus" }, { other: 1 }, "string", 7]) {
    assert.equal(parseTiebreakerMode(raw as unknown), DEFAULT_TIEBREAKER_MODE);
  }
  assert.equal(DEFAULT_TIEBREAKER_MODE, "autonomy_only");
});

// shouldFireTiebreaker
test("fire: never when not a close call", () => {
  assert.equal(shouldFireTiebreaker({ closeCall: false, mode: "always_on_close_call", autonomyEnabled: true, tokenOk: true }), false);
});
test("fire: never when token ceiling hit (any mode)", () => {
  for (const mode of ["autonomy_only", "always_on_close_call"] as TiebreakerMode[]) {
    assert.equal(shouldFireTiebreaker({ closeCall: true, mode, autonomyEnabled: true, tokenOk: false }), false);
  }
});
test("fire: off => never", () => {
  assert.equal(shouldFireTiebreaker({ closeCall: true, mode: "off", autonomyEnabled: true, tokenOk: true }), false);
});
test("fire: autonomy_only => only when autonomy enabled", () => {
  assert.equal(shouldFireTiebreaker({ closeCall: true, mode: "autonomy_only", autonomyEnabled: false, tokenOk: true }), false);
  assert.equal(shouldFireTiebreaker({ closeCall: true, mode: "autonomy_only", autonomyEnabled: true, tokenOk: true }), true);
});
test("fire: always_on_close_call => fires even with autonomy off (annotates held draft)", () => {
  assert.equal(shouldFireTiebreaker({ closeCall: true, mode: "always_on_close_call", autonomyEnabled: false, tokenOk: true }), true);
});

// applyTiebreak — the safety core
const PAIR: [string, string] = ["vA", "vB"];
test("apply: no LLM result => deterministic leader stands", () => {
  const d = applyTiebreak({ deterministicWinnerId: "vA", pairIds: PAIR, llm: null });
  assert.equal(d.winnerVendorId, "vA"); assert.equal(d.changedByLlm, false); assert.equal(d.source, "deterministic");
});
test("apply: LLM picks the runner-up (high conf) => swap, source llm_tiebreak", () => {
  const d = applyTiebreak({ deterministicWinnerId: "vA", pairIds: PAIR, llm: { vendorId: "vB", confidence: "high", rationale: "split-system specialist" } });
  assert.equal(d.winnerVendorId, "vB"); assert.equal(d.changedByLlm, true); assert.equal(d.source, "llm_tiebreak");
  assert.equal(d.llmRationale, "split-system specialist");
});
test("apply: LLM confirms the leader => no change, but rationale retained", () => {
  const d = applyTiebreak({ deterministicWinnerId: "vA", pairIds: PAIR, llm: { vendorId: "vA", confidence: "high", rationale: "rooftop unit match" } });
  assert.equal(d.winnerVendorId, "vA"); assert.equal(d.changedByLlm, false); assert.equal(d.source, "deterministic");
});
test("apply: hallucinated out-of-pair vendor => deterministic stands", () => {
  const d = applyTiebreak({ deterministicWinnerId: "vA", pairIds: PAIR, llm: { vendorId: "vZ", confidence: "high", rationale: "x" } });
  assert.equal(d.winnerVendorId, "vA"); assert.equal(d.changedByLlm, false); assert.equal(d.source, "deterministic");
});
test("apply: low-confidence pick does NOT override determinism by default", () => {
  const d = applyTiebreak({ deterministicWinnerId: "vA", pairIds: PAIR, llm: { vendorId: "vB", confidence: "low", rationale: "weak hunch" } });
  assert.equal(d.winnerVendorId, "vA"); assert.equal(d.changedByLlm, false); assert.equal(d.source, "deterministic");
});
test("apply: low-confidence honored only when explicitly opted in", () => {
  const d = applyTiebreak({ deterministicWinnerId: "vA", pairIds: PAIR, llm: { vendorId: "vB", confidence: "low", rationale: "ok" }, honorLowConfidence: true });
  assert.equal(d.winnerVendorId, "vB"); assert.equal(d.changedByLlm, true);
});

console.log(`\n${pass} passed`);
