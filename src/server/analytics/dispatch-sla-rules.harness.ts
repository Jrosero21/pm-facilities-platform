// Offline node:assert harness. Pure module — no DB / server-only pulled, so plain tsx:
//   pnpm exec tsx src/server/analytics/dispatch-sla-rules.harness.ts
import assert from "node:assert/strict";
import {
  isDispatchStuck, dispatchStuckThresholdSeconds, DISPATCH_STUCK_THRESHOLDS_SECONDS,
} from "./dispatch-sla-rules";

let pass = 0;
function test(n: string, fn: () => void) { fn(); pass++; console.log(`  ok ${n}`); }
const H = 3600;
console.log("dispatch-SLA rules harness");

// threshold resolution per tier
test("SENT thresholds resolve per priority", () => {
  assert.equal(dispatchStuckThresholdSeconds("SENT", "EMERGENCY"), 2 * H);
  assert.equal(dispatchStuckThresholdSeconds("SENT", "URGENT"), 4 * H);
  assert.equal(dispatchStuckThresholdSeconds("SENT", "HIGH"), 8 * H);
  assert.equal(dispatchStuckThresholdSeconds("SENT", "ROUTINE"), 24 * H);
  assert.equal(dispatchStuckThresholdSeconds("SENT", "SCHEDULED"), 48 * H);
});
test("null priority -> DEFAULT (24h)", () => {
  assert.equal(dispatchStuckThresholdSeconds("SENT", null), 24 * H);
});
test("unmapped priority code -> DEFAULT (24h)", () => {
  assert.equal(dispatchStuckThresholdSeconds("SENT", "WEIRD_CUSTOM_TIER"), 24 * H);
});
test("untracked status -> undefined (not tracked)", () => {
  assert.equal(dispatchStuckThresholdSeconds("ACCEPTED", "EMERGENCY"), undefined); // not filled yet
  assert.equal(dispatchStuckThresholdSeconds("WORK_COMPLETE", "EMERGENCY"), undefined);
  assert.equal(dispatchStuckThresholdSeconds("GHOSTED", "EMERGENCY"), undefined); // terminal-failed, never tracked
});

// classifier — boundary + tiers
test("emergency stuck just over 2h, not at/under", () => {
  assert.equal(isDispatchStuck({ statusCode: "SENT", priorityCode: "EMERGENCY", dwellSeconds: 2 * H + 1 }), true);
  assert.equal(isDispatchStuck({ statusCode: "SENT", priorityCode: "EMERGENCY", dwellSeconds: 2 * H }), false); // exactly-at = not over
  assert.equal(isDispatchStuck({ statusCode: "SENT", priorityCode: "EMERGENCY", dwellSeconds: 2 * H - 1 }), false);
});
test("routine 8h dwell NOT stuck (24h threshold); emergency 8h dwell IS stuck", () => {
  assert.equal(isDispatchStuck({ statusCode: "SENT", priorityCode: "ROUTINE", dwellSeconds: 8 * H }), false);
  assert.equal(isDispatchStuck({ statusCode: "SENT", priorityCode: "EMERGENCY", dwellSeconds: 8 * H }), true);
});
test("null-priority SENT uses 24h: 12h not stuck, 25h stuck", () => {
  assert.equal(isDispatchStuck({ statusCode: "SENT", priorityCode: null, dwellSeconds: 12 * H }), false);
  assert.equal(isDispatchStuck({ statusCode: "SENT", priorityCode: null, dwellSeconds: 25 * H }), true);
});
test("untracked status never stuck regardless of dwell", () => {
  assert.equal(isDispatchStuck({ statusCode: "ACCEPTED", priorityCode: "EMERGENCY", dwellSeconds: 999 * H }), false);
  assert.equal(isDispatchStuck({ statusCode: "DECLINED", priorityCode: "EMERGENCY", dwellSeconds: 999 * H }), false);
  assert.equal(isDispatchStuck({ statusCode: "GHOSTED", priorityCode: "EMERGENCY", dwellSeconds: 999 * H }), false); // terminal-failed
});
test("map shape: SENT is the only filled status today", () => {
  assert.deepEqual(Object.keys(DISPATCH_STUCK_THRESHOLDS_SECONDS), ["SENT"]);
});

console.log(`\n${pass} passed`);
