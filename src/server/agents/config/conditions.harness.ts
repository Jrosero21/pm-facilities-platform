// Offline node:assert harness for the PURE policy-conditions evaluator. No DB / server-only —
// plain tsx:  pnpm exec tsx src/server/agents/config/conditions.harness.ts
import assert from "node:assert/strict";
import {
  parseConditions, evaluatePolicyConditions,
  type PolicyActionContext, type ConditionsBlock,
} from "./conditions";

let pass = 0;
function test(n: string, fn: () => void) { fn(); pass++; console.log(`  ok ${n}`); }
console.log("policy-conditions evaluator harness");

// helpers: wrap a conditions block in a policy-raw, parse it, evaluate against a ctx.
const parseC = (c: unknown) => parseConditions({ conditions: c });
const CTX = (over: Partial<PolicyActionContext> = {}): PolicyActionContext => ({
  effectiveNte: 800, tradeCode: "PLUMB", priorityCode: "ROUTINE", clientId: "client-x", ...over,
});
const ev = (c: unknown, ctx: PolicyActionContext) => evaluatePolicyConditions(parseC(c), ctx);

// ── absent / invalid ──────────────────────────────────────────────────────────────────────
test("absent conditions (no key) → pass (no narrowing)", () => {
  assert.deepEqual(evaluatePolicyConditions(parseConditions({}), CTX()), { pass: true, failedOn: null });
  assert.equal(parseConditions({}), null);
});
test("invalid conditions (bad Zod shape) → fail invalid_conditions", () => {
  assert.equal(parseC({ maxNteAmount: "500" }), "invalid"); // string, not number
  assert.deepEqual(ev({ maxNteAmount: "500" }, CTX()), { pass: false, failedOn: "invalid_conditions" });
  assert.equal(parseC("not-an-object"), "invalid");
});

// ── maxNteAmount (<= boundary) ──────────────────────────────────────────────────────────────
test("maxNteAmount: under → pass", () => {
  assert.deepEqual(ev({ maxNteAmount: 1000 }, CTX({ effectiveNte: 800 })), { pass: true, failedOn: null });
});
test("maxNteAmount: exactly equal → pass (<= boundary)", () => {
  assert.deepEqual(ev({ maxNteAmount: 500 }, CTX({ effectiveNte: 500 })), { pass: true, failedOn: null });
});
test("maxNteAmount: over → fail nte_over_threshold", () => {
  assert.deepEqual(ev({ maxNteAmount: 500 }, CTX({ effectiveNte: 500.01 })), { pass: false, failedOn: "nte_over_threshold" });
});
test("maxNteAmount: null NTE → fail nte_unknown (unknown amount → don't auto-act)", () => {
  assert.deepEqual(ev({ maxNteAmount: 500 }, CTX({ effectiveNte: null })), { pass: false, failedOn: "nte_unknown" });
});

// ── trade allowed / blocked ──────────────────────────────────────────────────────────────────
test("allowedTradeCodes: in → pass; not-in → fail; null trade → fail (must-prove-in)", () => {
  assert.equal(ev({ allowedTradeCodes: ["HVAC", "PLUMB"] }, CTX({ tradeCode: "PLUMB" })).pass, true);
  assert.deepEqual(ev({ allowedTradeCodes: ["HVAC"] }, CTX({ tradeCode: "PLUMB" })), { pass: false, failedOn: "trade_not_allowed" });
  assert.deepEqual(ev({ allowedTradeCodes: ["HVAC"] }, CTX({ tradeCode: null })), { pass: false, failedOn: "trade_not_allowed" });
});
test("blockedTradeCodes: not-in → pass; in → fail; null trade → pass (must-prove-out)", () => {
  assert.equal(ev({ blockedTradeCodes: ["HVAC"] }, CTX({ tradeCode: "PLUMB" })).pass, true);
  assert.deepEqual(ev({ blockedTradeCodes: ["HVAC"] }, CTX({ tradeCode: "HVAC" })), { pass: false, failedOn: "trade_blocked" });
  assert.equal(ev({ blockedTradeCodes: ["HVAC"] }, CTX({ tradeCode: null })).pass, true); // can't prove blocked
});

// ── priority (the "never EMERGENCY" case) ────────────────────────────────────────────────────
test("blockedPriorityCodes ['EMERGENCY']: EMERGENCY → fail; ROUTINE → pass", () => {
  assert.deepEqual(ev({ blockedPriorityCodes: ["EMERGENCY"] }, CTX({ priorityCode: "EMERGENCY" })), { pass: false, failedOn: "priority_blocked" });
  assert.equal(ev({ blockedPriorityCodes: ["EMERGENCY"] }, CTX({ priorityCode: "ROUTINE" })).pass, true);
});
test("allowedPriorityCodes: null priority → fail priority_not_allowed", () => {
  assert.deepEqual(ev({ allowedPriorityCodes: ["ROUTINE"] }, CTX({ priorityCode: null })), { pass: false, failedOn: "priority_not_allowed" });
});

// ── client (the "all clients except Apple" case) ─────────────────────────────────────────────
test("blockedClientIds ['apple']: apple → fail client_blocked; other → pass", () => {
  assert.deepEqual(ev({ blockedClientIds: ["apple-id"] }, CTX({ clientId: "apple-id" })), { pass: false, failedOn: "client_blocked" });
  assert.equal(ev({ blockedClientIds: ["apple-id"] }, CTX({ clientId: "other" })).pass, true);
});

// ── the realistic COMBINED policy ("under $1000 except HVAC / emergency / Apple") ─────────────
test("combined: under-$1000-except-HVAC/emergency/Apple — the 5 scenarios", () => {
  const C: ConditionsBlock = {
    maxNteAmount: 1000,
    blockedTradeCodes: ["HVAC"],
    blockedPriorityCodes: ["EMERGENCY"],
    blockedClientIds: ["apple-id"],
  };
  const run = (ctx: PolicyActionContext) => evaluatePolicyConditions(parseC(C), ctx);
  // $800 plumbing routine other-client → pass
  assert.deepEqual(run(CTX({ effectiveNte: 800, tradeCode: "PLUMB", priorityCode: "ROUTINE", clientId: "other" })), { pass: true, failedOn: null });
  // $800 HVAC → fail trade
  assert.deepEqual(run(CTX({ effectiveNte: 800, tradeCode: "HVAC" })), { pass: false, failedOn: "trade_blocked" });
  // $800 emergency → fail priority
  assert.deepEqual(run(CTX({ effectiveNte: 800, tradeCode: "PLUMB", priorityCode: "EMERGENCY" })), { pass: false, failedOn: "priority_blocked" });
  // $1200 → fail nte
  assert.deepEqual(run(CTX({ effectiveNte: 1200, tradeCode: "PLUMB", priorityCode: "ROUTINE", clientId: "other" })), { pass: false, failedOn: "nte_over_threshold" });
  // $800 plumbing routine APPLE → fail client
  assert.deepEqual(run(CTX({ effectiveNte: 800, tradeCode: "PLUMB", priorityCode: "ROUTINE", clientId: "apple-id" })), { pass: false, failedOn: "client_blocked" });
});

// ── deterministic precedence: FIRST failure in the documented order ──────────────────────────
test("precedence: when MULTIPLE fail, failedOn is the FIRST in order (nte before trade)", () => {
  const C = { maxNteAmount: 1000, blockedTradeCodes: ["HVAC"] };
  // both fail (over $1000 AND HVAC) → nte is checked first
  assert.deepEqual(ev(C, CTX({ effectiveNte: 1200, tradeCode: "HVAC" })), { pass: false, failedOn: "nte_over_threshold" });
  // trade before priority: allowed-trade fail beats a priority block
  const C2 = { allowedTradeCodes: ["PLUMB"], blockedPriorityCodes: ["EMERGENCY"] };
  assert.deepEqual(ev(C2, CTX({ tradeCode: "HVAC", priorityCode: "EMERGENCY" })), { pass: false, failedOn: "trade_not_allowed" });
});

console.log(`\n${pass} passed`);
