// Offline node:assert harness for the PURE re-dispatch decision core. The core has no DB
// import, so plain tsx (no env, no tunnel):
//   pnpm exec tsx src/server/redispatch-suggestion.harness.ts
import assert from "node:assert/strict";
import {
  decideRedispatchCore, REDISPATCH_MAX_ATTEMPTS, type RedispatchCopyForward,
} from "./redispatch-suggestion";

let pass = 0;
function test(n: string, fn: () => void) { fn(); pass++; console.log(`  ok ${n}`); }
console.log("redispatch-suggestion core harness");

const CF: RedispatchCopyForward = {
  agreedNteAmount: "500.00", // raw decimal string (pass-through)
  dispatchScope: "Fix the walk-in cooler",
  scheduledStartAt: new Date("2026-06-20T12:00:00Z"),
};

assert.equal(REDISPATCH_MAX_ATTEMPTS, 3);

test("attempts >= MAX -> exhausted:max_attempts (even with eligible vendors remaining)", () => {
  const d = decideRedispatchCore({ attemptsSoFar: 3, triedVendorIds: new Set(), rankedVendorIds: ["v1"], copyForward: CF });
  assert.deepEqual(d, { kind: "exhausted", reason: "max_attempts", attemptsSoFar: 3 });
});

test("attempts < MAX + an untried ranked candidate -> suggest that vendorId", () => {
  const d = decideRedispatchCore({ attemptsSoFar: 1, triedVendorIds: new Set(["v0"]), rankedVendorIds: ["v1", "v2"], copyForward: CF });
  assert.equal(d.kind, "suggest");
  if (d.kind === "suggest") assert.equal(d.vendorId, "v1");
});

test("attempts < MAX but ALL ranked already tried -> exhausted:no_eligible_vendor", () => {
  const d = decideRedispatchCore({ attemptsSoFar: 2, triedVendorIds: new Set(["v1", "v2"]), rankedVendorIds: ["v1", "v2"], copyForward: CF });
  assert.deepEqual(d, { kind: "exhausted", reason: "no_eligible_vendor", attemptsSoFar: 2 });
});

test("attempts < MAX but ranked empty (no trade/location/eligible) -> exhausted:no_eligible_vendor", () => {
  const d = decideRedispatchCore({ attemptsSoFar: 0, triedVendorIds: new Set(), rankedVendorIds: [], copyForward: CF });
  assert.deepEqual(d, { kind: "exhausted", reason: "no_eligible_vendor", attemptsSoFar: 0 });
});

test("FIRST untried ranked candidate chosen — skips a tried top-ranked one (order respected)", () => {
  const d = decideRedispatchCore({ attemptsSoFar: 0, triedVendorIds: new Set(["v1"]), rankedVendorIds: ["v1", "v2", "v3"], copyForward: CF });
  assert.equal(d.kind, "suggest");
  if (d.kind === "suggest") assert.equal(d.vendorId, "v2"); // v1 tried -> v2 (NOT v3)
});

test("copyForward carries the stuck assignment's nte/scope/schedule through", () => {
  const d = decideRedispatchCore({ attemptsSoFar: 0, triedVendorIds: new Set(), rankedVendorIds: ["v1"], copyForward: CF });
  assert.equal(d.kind, "suggest");
  if (d.kind === "suggest") {
    assert.deepEqual(d.copyForward, CF);
    assert.equal(d.attemptsSoFar, 0);
  }
});

test("boundary: attempts == MAX-1 still suggests; == MAX exhausts (3 is the cutoff, not 4)", () => {
  const at2 = decideRedispatchCore({ attemptsSoFar: 2, triedVendorIds: new Set(), rankedVendorIds: ["v1"], copyForward: CF });
  assert.equal(at2.kind, "suggest"); // 2 < 3 -> still suggests
  const at3 = decideRedispatchCore({ attemptsSoFar: 3, triedVendorIds: new Set(), rankedVendorIds: ["v1"], copyForward: CF });
  assert.equal(at3.kind, "exhausted"); // 3 >= 3 -> exhausted (not waiting for 4)
});

console.log(`\n${pass} passed`);
