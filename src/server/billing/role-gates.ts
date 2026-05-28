// ── Phase 8 batch 8c.8 — BILLING ROLE-GATE PREDICATES (pure util) ─────────────────────
// PURE util — no database, no session, no IO. The authz POLICY for the billing action-layer
// gates, extracted into a testable predicate because the request-context role guard reads
// cookies/session via next/headers and so cannot run outside a request (no role machinery is
// unit-tested on the platform — verified at 8c.8 build). The action calls this predicate (it IS
// the live enforcement), and the verify exercises it directly. Reused by the 8c.8 send gate and
// the future 8c.9 (payment) / 8c.10 (close) gates.
//
// 8c-D2: ISSUING/closing billing is accounting-gated — `accounting` role OR `super_admin`
// auto-pass; NO `tenant_admin`.

/** True iff the actor may perform an accounting-gated billing action (issue / record / close). */
export function isAccountingRole(roleKeys: string[], isSuperAdmin: boolean): boolean {
  return isSuperAdmin || roleKeys.includes("accounting");
}
