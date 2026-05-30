import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { clientUsers } from "@/server/schema";

/**
 * Resolves the set of client IDs a user has access to within a tenant.
 *
 * Reads client_users rows where (tenant_id, user_id) match. Returns an
 * empty Set when no mapping exists — callers gate on `.size === 0` or
 * use the client predicates from `@/server/role-predicates` with the
 * resolved scope.
 *
 * Mirrors getVendorScope (vendor-scope.ts): server-only module,
 * drizzle-direct query, trusts drizzle to throw on connection / driver
 * errors. Bare-param signature (userId, tenantId) — caller extracts from
 * AuthContext at the callsite (ctx.user.id, ctx.activeTenant.tenantId).
 *
 * Phase 11 batch 11c.
 */
export async function getClientScope(
  userId: string,
  tenantId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ clientId: clientUsers.clientId })
    .from(clientUsers)
    .where(
      and(
        eq(clientUsers.tenantId, tenantId),
        eq(clientUsers.userId, userId),
      ),
    );
  return new Set(rows.map((r) => r.clientId));
}
