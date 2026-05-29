// ── Phase 9 batch 9e — ROLE PREDICATES (pure read-side gating) ─────────────────────────
// Generic read-side role predicate + the named dashboard-section predicates that compose over it
// (9e manifest §5). PURE — no "server-only", no DB, no IO (mirrors billing/role-gates.ts), so it is
// trivially unit-testable and callable from any server component.
//
// Read-side gating is DISTINCT from the write-side action gates (enforceAccountingGate / isAccountingRole
// in billing/role-gates.ts): a read panel may extend visibility BEYOND the corresponding write gate when
// the information is summary-level and management-relevant — the "read-vs-write asymmetry" (9e manifest
// §3/§11; see 02-decisions.md). The write gate exists for segregation of accounting DUTIES / preventing
// accidental mutations; that concern does not apply to a read of summary counts.
//
// Roles match on `key` (not `code`); super_admin always passes (mirrors requireRole / isAccountingRole).

/** The minimal auth shape these predicates need. `TenantAuthContext` is structurally compatible,
 *  so call sites pass the full context (mirrors enforceAccountingGate's `Pick<…>` narrowing). */
export type RoleCtx = { roleKeys: string[]; isSuperAdmin: boolean };

/** True iff the actor holds ANY of `allowed` (by role key) in the active tenant / globally, or is super_admin. */
export function hasAnyRole(ctx: RoleCtx, allowed: string[]): boolean {
  return ctx.isSuperAdmin || ctx.roleKeys.some((key) => allowed.includes(key));
}

/** Operational dashboard sections: queue, status/priority cards, stalled summary, top-N, distributions. */
export function canSeeOperations(ctx: RoleCtx): boolean {
  return hasAnyRole(ctx, ["tenant_admin", "operator"]);
}

/** Financial dashboard panel (pending AP/AR counts). Read-side — extends to tenant_admin for oversight
 *  even though billing ACTIONS stay strictly accounting-gated (read-vs-write asymmetry, manifest §3/§11). */
export function canSeeFinancials(ctx: RoleCtx): boolean {
  return hasAnyRole(ctx, ["accounting", "tenant_admin"]);
}
