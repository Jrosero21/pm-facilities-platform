import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { roles, tenantUsers, userRoles, users } from "@/server/schema";

// ── G3 — INTERNAL RECIPIENT RESOLUTION (staff notifications) ──────────────────────────
// recipient_type has carried 'internal' since Phase 1 with ZERO usages: every outbound path in the
// platform targets a vendor_contact or a client_contact, so no staff member has ever been notified
// of anything. This module is the missing half — the "who" for an internal send.
//
// ★ INTERNAL RESOLUTION IS STRICTLY SIMPLER THAN CLIENT/VENDOR, for one schema reason:
// users.email is NOT NULL and UNIQUE (auth.ts:15). A resolved internal recipient therefore ALWAYS
// has a deliverable address. The whole "primary contact might have a null email, fall through to
// the next one" dance that notifyClientOfInvoice and dispatch-notify need has no counterpart here.
// The only way to fail is for the user to not be a member of the tenant.
//
// ★ TENANT MEMBERSHIP IS THE GATE, NOT THE users ROW. users is global (a person can belong to
// several tenants); tenant_users is the per-tenant membership with its own status. Resolving
// through an ACTIVE tenant_users row is what stops one tenant's notification from reaching a user
// who only belongs to another — a cross-tenant leak that a bare users lookup by id would allow.

export type InternalRecipient = {
  userId: string;
  name: string;
  /** users.email is NOT NULL, so this is always a real address — never null, never a fallback. */
  email: string;
};

/**
 * Resolve ONE internal recipient by user id, scoped to the tenant.
 * Returns null when the user does not exist or is not an ACTIVE member of this tenant.
 */
export async function getInternalRecipient(
  tenantId: string,
  userId: string,
): Promise<InternalRecipient | null> {
  const rows = await db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(tenantUsers)
    .innerJoin(users, eq(users.id, tenantUsers.userId))
    .where(
      and(
        eq(tenantUsers.tenantId, tenantId),
        eq(tenantUsers.userId, userId),
        eq(tenantUsers.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Resolve EVERY active member of the tenant holding `roleKey` — "notify the tenant admins", rather
 * than notifying one hard-coded person.
 *
 * Role grants live on user_roles with a nullable tenant_id: a tenant-scoped grant carries this
 * tenant's id, and a global grant (super_admin) carries null. This matches the TENANT-SCOPED grant
 * only. A global super_admin is deliberately NOT swept in: they are a platform operator, not a
 * member of this tenant's staff, and mailing them every tenant's routine notifications would be
 * both noise and a cross-tenant disclosure.
 *
 * Ordered by grant time so the list is stable across calls, and de-duplicated: user_roles can
 * carry more than one grant per user.
 */
export async function listInternalRecipientsByRole(
  tenantId: string,
  roleKey: string,
): Promise<InternalRecipient[]> {
  const rows = await db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(users, eq(users.id, userRoles.userId))
    .innerJoin(
      tenantUsers,
      and(eq(tenantUsers.userId, userRoles.userId), eq(tenantUsers.tenantId, tenantId)),
    )
    .where(
      and(
        eq(roles.key, roleKey),
        eq(userRoles.tenantId, tenantId),
        eq(tenantUsers.status, "active"),
      ),
    )
    .orderBy(asc(userRoles.grantedAt));

  const seen = new Set<string>();
  const out: InternalRecipient[] = [];
  for (const r of rows) {
    if (seen.has(r.userId)) continue;
    seen.add(r.userId);
    out.push(r);
  }
  return out;
}
