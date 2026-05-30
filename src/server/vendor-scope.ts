import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { vendorUsers } from "@/server/schema";

/**
 * Resolves the set of vendor IDs a user has access to within a tenant.
 *
 * Reads vendor_users rows where (tenant_id, user_id) match. Returns an
 * empty Set when no mapping exists — callers gate on `.size === 0` or
 * use `canActOnAssignment` / `canSubmitVendorInvoice` from
 * `@/server/role-predicates` with the resolved scope.
 *
 * Mirrors the impure-resolver convention from Phase 9 analytics readers:
 * server-only module, drizzle-direct query, trusts drizzle to throw on
 * connection / driver errors.
 *
 * Bare-param signature (userId, tenantId) — caller extracts from
 * AuthContext at the callsite (ctx.user.id, ctx.activeTenant.tenantId).
 * Mirrors `countPendingInvoices(tenantId)` style established in Phase 9.
 *
 * Phase 10 batch 10g.
 */
export async function getVendorScope(
  userId: string,
  tenantId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ vendorId: vendorUsers.vendorId })
    .from(vendorUsers)
    .where(
      and(
        eq(vendorUsers.tenantId, tenantId),
        eq(vendorUsers.userId, userId),
      ),
    );
  return new Set(rows.map((r) => r.vendorId));
}
