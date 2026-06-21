import { z } from "zod";

// ── Phase 28 — policy-conditions vocabulary (read + evaluate side; PURE, no DB) ────────────
// A policy JSON may carry an optional `conditions` block that NARROWS when an agent may act
// autonomously. The evaluator slots as ONE MORE `&&` below `autonomyEnabled` in the auto-dispatch
// `permitted` gate — narrowing-only, never widening (it can only make autonomy MORE restrictive;
// it cannot override the kill-switch, the spend/token ceilings, or the fail-safe gate).
//
// NOT confidence floors (gated on Phase-24 calibration — out of scope). Codes/ids are matched as
// STABLE keys (priorities.code / trades.code / clients.id), never display names.

// The condition block a policy JSON may carry. All fields OPTIONAL; an absent block = no narrowing.
const conditionsSchema = z.object({
  // Autonomous only when the job's EFFECTIVE NTE is AT OR UNDER this (dollars). Boundary is `<=`:
  // a maxNteAmount of 500 ALLOWS exactly $500. A null/unknown effective NTE FAILS (don't auto-act).
  maxNteAmount: z.number().optional(),
  // Trade filters (priorities.code/trades.code stable keys). allowed* = must-prove-IN; blocked* = must-prove-OUT.
  allowedTradeCodes: z.array(z.string()).optional(),
  blockedTradeCodes: z.array(z.string()).optional(),
  allowedPriorityCodes: z.array(z.string()).optional(),
  blockedPriorityCodes: z.array(z.string()).optional(),
  // Client filters match on the stable clientId.
  allowedClientIds: z.array(z.string()).optional(),
  blockedClientIds: z.array(z.string()).optional(),
});

export type ConditionsBlock = z.infer<typeof conditionsSchema>;
export { conditionsSchema };

/**
 * Read the `conditions` block off a policy's raw JSON (mirrors parseTiebreakerMode's (raw)→value shape).
 *   - no `conditions` key (absent / null) → null      → the caller applies NO narrowing (locked decision (a))
 *   - present + Zod-valid                 → the block
 *   - present + Zod-INVALID               → "invalid"  → the caller fails-safe to GATED (invalid ≠ absent)
 */
export function parseConditions(raw: unknown): ConditionsBlock | null | "invalid" {
  const conditions = (raw as { conditions?: unknown } | null | undefined)?.conditions;
  if (conditions === undefined || conditions === null) return null; // ABSENT → no narrowing
  const result = conditionsSchema.safeParse(conditions);
  return result.success ? result.data : "invalid";
}

// The job/action data a condition is evaluated against. The caller (the gate) builds this — the
// NTE is already parsed from getEffectiveNte's string, codes are resolved from ids.
export type PolicyActionContext = {
  effectiveNte: number | null; // parsed from getEffectiveNte (string|null); null = unknown amount
  tradeCode: string | null;
  priorityCode: string | null;
  clientId: string | null;
};

/**
 * Evaluate the conditions against an action context. NARROWING-ONLY: pass=true means "conditions do
 * not block autonomy" (the gate then ANDs this with autonomyEnabled + the ceilings). PURE.
 *
 * ALLOWED lists = MUST-PROVE-IN: a null job value FAILS (can't confirm membership → don't auto-act).
 * BLOCKED lists = MUST-PROVE-OUT: a null job value PASSES that check (can't confirm it's blocked).
 * Evaluation order is fixed (so `failedOn` is deterministic): nte → trade(allowed,blocked) →
 * priority(allowed,blocked) → client(allowed,blocked). Returns the FIRST failure.
 */
export function evaluatePolicyConditions(
  parsed: ConditionsBlock | null | "invalid",
  ctx: PolicyActionContext,
): { pass: boolean; failedOn: string | null } {
  if (parsed === null) return { pass: true, failedOn: null }; // absent → no narrowing
  if (parsed === "invalid") return { pass: false, failedOn: "invalid_conditions" }; // fail-safe gated

  // 1. amount threshold (`<=`; unknown amount fails)
  if (parsed.maxNteAmount !== undefined) {
    if (ctx.effectiveNte === null) return { pass: false, failedOn: "nte_unknown" };
    if (!(ctx.effectiveNte <= parsed.maxNteAmount)) return { pass: false, failedOn: "nte_over_threshold" };
  }
  // 2. trade allowed (must prove in)
  if (parsed.allowedTradeCodes !== undefined) {
    if (ctx.tradeCode === null || !parsed.allowedTradeCodes.includes(ctx.tradeCode))
      return { pass: false, failedOn: "trade_not_allowed" };
  }
  // 3. trade blocked (must prove out; null passes)
  if (parsed.blockedTradeCodes !== undefined) {
    if (ctx.tradeCode !== null && parsed.blockedTradeCodes.includes(ctx.tradeCode))
      return { pass: false, failedOn: "trade_blocked" };
  }
  // 4. priority allowed
  if (parsed.allowedPriorityCodes !== undefined) {
    if (ctx.priorityCode === null || !parsed.allowedPriorityCodes.includes(ctx.priorityCode))
      return { pass: false, failedOn: "priority_not_allowed" };
  }
  // 5. priority blocked
  if (parsed.blockedPriorityCodes !== undefined) {
    if (ctx.priorityCode !== null && parsed.blockedPriorityCodes.includes(ctx.priorityCode))
      return { pass: false, failedOn: "priority_blocked" };
  }
  // 6. client allowed
  if (parsed.allowedClientIds !== undefined) {
    if (ctx.clientId === null || !parsed.allowedClientIds.includes(ctx.clientId))
      return { pass: false, failedOn: "client_not_allowed" };
  }
  // 7. client blocked
  if (parsed.blockedClientIds !== undefined) {
    if (ctx.clientId !== null && parsed.blockedClientIds.includes(ctx.clientId))
      return { pass: false, failedOn: "client_blocked" };
  }

  return { pass: true, failedOn: null };
}
